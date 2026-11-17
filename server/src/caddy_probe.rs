//! Live TLS certificate probing for Caddy-served proxy hosts.
//!
//! Caddy does not expose its automated leaf certificates through the Admin
//! API. This module connects to Caddy's HTTPS listener with each configured
//! domain as SNI and records the certificate a client actually receives.

use std::fmt::{self, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, SecondsFormat, Utc};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::WebPkiServerVerifier;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::sqlite::SqliteRow;
use sqlx::{QueryBuilder, Row, Sqlite};
use tokio::net::TcpStream;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio_rustls::TlsConnector;
use tracing::{error, info, warn};
use x509_parser::extensions::GeneralName;
use x509_parser::prelude::{FromDer, X509Certificate};

use crate::api::settings::{get_setting, upsert_setting};
use crate::api::AppState;
use crate::{email, webhook};

const DEFAULT_INTERVAL_SECS: u64 = 21_600;
const DEFAULT_THRESHOLD_DAYS: i64 = 14;
const DEFAULT_PROBE_PORT: u16 = 443;
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_CONCURRENT_PROBES: usize = 8;

#[derive(Debug, Clone)]
pub struct ParsedCert {
    pub issuer: String,
    pub subject: String,
    pub sans: Vec<String>,
    pub not_before: DateTime<Utc>,
    pub not_after: DateTime<Utc>,
    pub serial: String,
    pub fingerprint_sha256: String,
}

#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub cert: ParsedCert,
    pub chain_valid: bool,
}

#[derive(Debug)]
pub enum ProbeError {
    Connect(String),
    Timeout(u64),
    Handshake(String),
    NoCertificate,
    Parse(String),
}

impl fmt::Display for ProbeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(error) => write!(f, "connect failed: {error}"),
            Self::Timeout(secs) => write!(f, "timed out after {secs}s"),
            Self::Handshake(error) => write!(f, "handshake failed: {error}"),
            Self::NoCertificate => f.write_str("no certificate presented"),
            Self::Parse(error) => write!(f, "certificate parse failed: {error}"),
        }
    }
}

impl std::error::Error for ProbeError {}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ProbeSummary {
    pub probed: usize,
    pub ok: usize,
    pub failed: usize,
    pub alerts_created: usize,
}

#[derive(Debug, Default)]
pub struct ProbeState {
    pub running: AtomicBool,
    pub last_summary: Mutex<Option<ProbeSummary>>,
}

#[derive(Debug)]
struct RecordingVerifier {
    inner: Arc<WebPkiServerVerifier>,
    chain_valid: Mutex<Option<bool>>,
}

impl ServerCertVerifier for RecordingVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let result = self.inner.verify_server_cert(
            end_entity,
            intermediates,
            server_name,
            ocsp_response,
            now,
        );
        if let Ok(mut recorded) = self.chain_valid.lock() {
            *recorded = Some(result.is_ok());
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

fn fingerprint_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

pub fn parse_leaf(der: &[u8]) -> Result<ParsedCert, ProbeError> {
    let (_, cert) =
        X509Certificate::from_der(der).map_err(|error| ProbeError::Parse(error.to_string()))?;

    let not_before = DateTime::<Utc>::from_timestamp(cert.validity().not_before.timestamp(), 0)
        .ok_or_else(|| ProbeError::Parse("invalid not-before timestamp".to_string()))?;
    let not_after = DateTime::<Utc>::from_timestamp(cert.validity().not_after.timestamp(), 0)
        .ok_or_else(|| ProbeError::Parse("invalid not-after timestamp".to_string()))?;

    let sans = cert
        .subject_alternative_name()
        .map_err(|error| ProbeError::Parse(error.to_string()))?
        .map(|extension| {
            extension
                .value
                .general_names
                .iter()
                .filter_map(|name| match name {
                    GeneralName::DNSName(domain) => Some((*domain).to_string()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ParsedCert {
        issuer: cert.issuer().to_string(),
        subject: cert.subject().to_string(),
        sans,
        not_before,
        not_after,
        serial: cert.raw_serial_as_string(),
        fingerprint_sha256: fingerprint_hex(&Sha256::digest(der)),
    })
}

pub fn cert_status(
    days_remaining: Option<i64>,
    error: Option<&str>,
    threshold: i64,
) -> &'static str {
    if error.is_some() {
        return "error";
    }
    match days_remaining {
        Some(days) if days < 0 => "expired",
        Some(days) if days < threshold => "expiring",
        _ => "ok",
    }
}

pub fn effective_interval(raw: Option<&str>) -> Option<Duration> {
    match raw.and_then(|value| value.parse::<u64>().ok()) {
        Some(0) => None,
        Some(secs) if secs >= 300 => Some(Duration::from_secs(secs)),
        _ => Some(Duration::from_secs(DEFAULT_INTERVAL_SECS)),
    }
}

pub fn effective_threshold(raw: Option<&str>) -> i64 {
    raw.and_then(|value| value.parse::<i64>().ok())
        .filter(|days| (0..=3650).contains(days))
        .unwrap_or(DEFAULT_THRESHOLD_DAYS)
}

pub async fn probe_tls(
    host: &str,
    port: u16,
    sni: &str,
    timeout: Duration,
) -> Result<ProbeResult, ProbeError> {
    let tcp = tokio::time::timeout(timeout, TcpStream::connect((host, port)))
        .await
        .map_err(|_| ProbeError::Timeout(timeout.as_secs()))?
        .map_err(|error| ProbeError::Connect(error.to_string()))?;

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let roots = Arc::new(RootCertStore::from_iter(
        webpki_roots::TLS_SERVER_ROOTS.iter().cloned(),
    ));
    let inner = WebPkiServerVerifier::builder_with_provider(roots, provider.clone())
        .build()
        .map_err(|error| ProbeError::Handshake(error.to_string()))?;
    let verifier = Arc::new(RecordingVerifier {
        inner,
        chain_valid: Mutex::new(None),
    });
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|error| ProbeError::Handshake(error.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(verifier.clone())
        .with_no_client_auth();
    let server_name = ServerName::try_from(sni.to_string())
        .map_err(|error| ProbeError::Handshake(error.to_string()))?;

    let stream = tokio::time::timeout(
        timeout,
        TlsConnector::from(Arc::new(config)).connect(server_name, tcp),
    )
    .await
    .map_err(|_| ProbeError::Timeout(timeout.as_secs()))?
    .map_err(|error| ProbeError::Handshake(error.to_string()))?;

    let leaf = stream
        .get_ref()
        .1
        .peer_certificates()
        .and_then(|certificates| certificates.first())
        .ok_or(ProbeError::NoCertificate)?;
    let cert = parse_leaf(leaf.as_ref())?;
    let chain_valid = verifier
        .chain_valid
        .lock()
        .ok()
        .and_then(|recorded| *recorded)
        .unwrap_or(false);

    Ok(ProbeResult { cert, chain_valid })
}

pub(crate) async fn configured_probe_host(state: &AppState) -> String {
    if let Some(host) = get_setting(state, "caddy_cert_probe_host").await {
        let trimmed = host.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    get_setting(state, "caddy_admin_url")
        .await
        .and_then(|url| reqwest::Url::parse(&url).ok())
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "localhost".to_string())
}

pub(crate) async fn configured_probe_port(state: &AppState) -> u16 {
    get_setting(state, "caddy_cert_probe_port")
        .await
        .and_then(|value| value.parse().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_PROBE_PORT)
}

#[derive(Debug)]
struct ProbeTarget {
    proxy_host_id: String,
    domain: String,
}

#[derive(Debug)]
struct CachedProbe {
    proxy_host_id: String,
    domain: String,
    issuer: Option<String>,
    subject: Option<String>,
    sans: Option<String>,
    not_before: Option<String>,
    not_after: Option<String>,
    serial: Option<String>,
    fingerprint_sha256: Option<String>,
    chain_valid: Option<i64>,
    error: Option<String>,
    probed_at: String,
}

impl CachedProbe {
    fn from_result(target: ProbeTarget, result: Result<ProbeResult, ProbeError>) -> Self {
        let probed_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        match result {
            Ok(result) => Self {
                proxy_host_id: target.proxy_host_id,
                domain: target.domain,
                issuer: Some(result.cert.issuer),
                subject: Some(result.cert.subject),
                sans: serde_json::to_string(&result.cert.sans).ok(),
                not_before: Some(
                    result
                        .cert
                        .not_before
                        .to_rfc3339_opts(SecondsFormat::Secs, true),
                ),
                not_after: Some(
                    result
                        .cert
                        .not_after
                        .to_rfc3339_opts(SecondsFormat::Secs, true),
                ),
                serial: Some(result.cert.serial),
                fingerprint_sha256: Some(result.cert.fingerprint_sha256),
                chain_valid: Some(i64::from(result.chain_valid)),
                error: None,
                probed_at,
            },
            Err(error) => Self {
                proxy_host_id: target.proxy_host_id,
                domain: target.domain,
                issuer: None,
                subject: None,
                sans: None,
                not_before: None,
                not_after: None,
                serial: None,
                fingerprint_sha256: None,
                chain_valid: None,
                error: Some(error.to_string()),
                probed_at,
            },
        }
    }
}

struct RunningGuard<'a>(&'a AtomicBool);

impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

async fn execute_claimed_cycle(state: &AppState) -> ProbeSummary {
    let _running_guard = RunningGuard(&state.caddy_probe.running);
    let rows = match sqlx::query(
        "SELECT id, domain FROM caddy_proxy_hosts \
         WHERE enabled = 1 AND tls_enabled = 1 ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(error) => {
            error!(%error, "Failed to load Caddy certificate probe targets");
            return ProbeSummary::default();
        }
    };

    let targets: Vec<ProbeTarget> = rows
        .into_iter()
        .map(|row| ProbeTarget {
            proxy_host_id: row.get("id"),
            domain: row.get("domain"),
        })
        .collect();
    let target_domains: Vec<String> = targets.iter().map(|target| target.domain.clone()).collect();
    let probe_host = configured_probe_host(state).await;
    let probe_port = configured_probe_port(state).await;
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_PROBES));
    let mut tasks = JoinSet::new();

    for target in targets {
        let host = probe_host.clone();
        let semaphore = semaphore.clone();
        tasks.spawn(async move {
            let permit = semaphore.acquire_owned().await;
            let result = match permit {
                Ok(_permit) => probe_tls(&host, probe_port, &target.domain, PROBE_TIMEOUT).await,
                Err(error) => Err(ProbeError::Connect(error.to_string())),
            };
            CachedProbe::from_result(target, result)
        });
    }

    let mut cache_rows = Vec::with_capacity(target_domains.len());
    while let Some(result) = tasks.join_next().await {
        match result {
            Ok(row) => cache_rows.push(row),
            Err(error) => error!(%error, "Caddy certificate probe task failed"),
        }
    }

    let mut summary = ProbeSummary {
        probed: target_domains.len(),
        ..ProbeSummary::default()
    };

    for row in &cache_rows {
        if let Some(probe_error) = row.error.as_deref() {
            summary.failed += 1;
            warn!(domain = %row.domain, error = %probe_error, "TLS certificate probe failed");
        } else {
            summary.ok += 1;
        }

        if let Err(error) = upsert_cache_row(state, row).await {
            error!(domain = %row.domain, %error, "Failed to store Caddy certificate probe result");
        }
    }

    if let Err(error) = delete_stale_rows(state, &target_domains).await {
        error!(%error, "Failed to delete stale Caddy certificate rows");
    }

    summary.alerts_created = evaluate_expiry_alerts(state).await;

    let completed_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    if upsert_setting(state, "caddy_cert_last_probe_at", &completed_at)
        .await
        .is_err()
    {
        error!("Failed to store Caddy certificate probe completion time");
    }

    if let Ok(mut last_summary) = state.caddy_probe.last_summary.lock() {
        *last_summary = Some(summary);
    }
    info!(
        probed = summary.probed,
        ok = summary.ok,
        failed = summary.failed,
        alerts_created = summary.alerts_created,
        "Completed Caddy certificate probe cycle"
    );
    summary
}

async fn upsert_cache_row(state: &AppState, row: &CachedProbe) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO caddy_certificates (domain, proxy_host_id, issuer, subject, sans, \
         not_before, not_after, serial, fingerprint_sha256, chain_valid, error, probed_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(domain) DO UPDATE SET \
         proxy_host_id = excluded.proxy_host_id, issuer = excluded.issuer, \
         subject = excluded.subject, sans = excluded.sans, not_before = excluded.not_before, \
         not_after = excluded.not_after, serial = excluded.serial, \
         fingerprint_sha256 = excluded.fingerprint_sha256, \
         chain_valid = excluded.chain_valid, error = excluded.error, probed_at = excluded.probed_at",
    )
    .bind(&row.domain)
    .bind(&row.proxy_host_id)
    .bind(&row.issuer)
    .bind(&row.subject)
    .bind(&row.sans)
    .bind(&row.not_before)
    .bind(&row.not_after)
    .bind(&row.serial)
    .bind(&row.fingerprint_sha256)
    .bind(row.chain_valid)
    .bind(&row.error)
    .bind(&row.probed_at)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn delete_stale_rows(state: &AppState, domains: &[String]) -> Result<(), sqlx::Error> {
    if domains.is_empty() {
        sqlx::query("DELETE FROM caddy_certificates")
            .execute(&state.db)
            .await?;
        return Ok(());
    }

    let mut query =
        QueryBuilder::<Sqlite>::new("DELETE FROM caddy_certificates WHERE domain NOT IN (");
    let mut separated = query.separated(", ");
    for domain in domains {
        separated.push_bind(domain);
    }
    separated.push_unseparated(")");
    query.build().execute(&state.db).await?;
    Ok(())
}

pub(crate) async fn evaluate_expiry_alerts(state: &AppState) -> usize {
    let raw_threshold = get_setting(state, "caddy_cert_expiry_threshold_days").await;
    let threshold = effective_threshold(raw_threshold.as_deref());
    if threshold == 0 {
        return 0;
    }

    let rows = match sqlx::query(
        "SELECT domain, issuer, not_after FROM caddy_certificates \
         WHERE error IS NULL AND not_after IS NOT NULL ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(error) => {
            error!(%error, "Failed to load certificates for expiry alert evaluation");
            return 0;
        }
    };

    let now = Utc::now();
    let mut created = 0;
    for row in rows {
        if evaluate_expiry_row(state, &row, threshold, now).await {
            created += 1;
        }
    }
    created
}

async fn evaluate_expiry_row(
    state: &AppState,
    row: &SqliteRow,
    threshold: i64,
    now: DateTime<Utc>,
) -> bool {
    let domain: String = row.get("domain");
    let issuer: Option<String> = row.get("issuer");
    let not_after: String = row.get("not_after");
    let expires_at = match DateTime::parse_from_rfc3339(&not_after) {
        Ok(value) => value.with_timezone(&Utc),
        Err(error) => {
            warn!(%domain, %error, "Ignoring certificate with invalid expiry timestamp");
            return false;
        }
    };
    let days_remaining = (expires_at - now).num_days();
    if days_remaining >= threshold {
        return false;
    }

    let duplicate = sqlx::query_scalar::<_, i64>(
        "SELECT 1 FROM alerts WHERE type = 'certificate_expiring' \
         AND json_extract(details, '$.domain') = ? \
         AND datetime(created_at) > datetime('now', '-1 day') LIMIT 1",
    )
    .bind(&domain)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
    .is_some();
    if duplicate {
        return false;
    }

    let message = if days_remaining < 0 {
        format!(
            "Certificate for {domain} expired {} days ago ({not_after})",
            days_remaining.unsigned_abs()
        )
    } else {
        format!("Certificate for {domain} expires in {days_remaining} days ({not_after})")
    };
    let severity = if days_remaining < 0 {
        "CRITICAL"
    } else {
        "WARNING"
    };
    let details = json!({
        "domain": domain,
        "not_after": not_after,
        "days_remaining": days_remaining,
        "issuer": issuer,
    });

    let inserted = sqlx::query(
        "INSERT INTO alerts (id, type, message, details, severity, created_at) \
         VALUES (?, 'certificate_expiring', ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(message)
    .bind(details.to_string())
    .bind(severity)
    .bind(Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true))
    .execute(&state.db)
    .await;

    if let Err(error) = inserted {
        error!(%domain, %error, "Failed to create certificate expiry alert");
        return false;
    }

    state
        .ws_hub
        .broadcast("certificate_expiring", details.clone());
    webhook::dispatch_webhook(&state.db, "certificate_expiring", details.clone());
    email::dispatch_email(&state.db, "certificate_expiring", details);
    true
}

pub async fn run_probe_cycle(state: &AppState) -> ProbeSummary {
    if state.caddy_probe.running.swap(true, Ordering::AcqRel) {
        return ProbeSummary::default();
    }
    execute_claimed_cycle(state).await
}

/// Claim and spawn a probe cycle atomically. Returns false when one is active.
pub fn try_start_probe_cycle(state: AppState) -> bool {
    if state
        .caddy_probe
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return false;
    }
    tokio::spawn(async move {
        execute_claimed_cycle(&state).await;
    });
    true
}

pub fn start_cert_probe_task(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            let raw_interval = get_setting(&state, "caddy_cert_probe_interval_secs").await;
            match effective_interval(raw_interval.as_deref()) {
                Some(interval) => {
                    run_probe_cycle(&state).await;
                    tokio::time::sleep(interval).await;
                }
                None => tokio::time::sleep(Duration::from_secs(300)).await,
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config, db};

    fn test_state(pool: sqlx::SqlitePool) -> AppState {
        AppState::new(pool, config::AppConfig::default())
    }

    #[test]
    fn parse_leaf_fixture() {
        let der = include_bytes!("../tests/fixtures/probe-test.internal.der");
        let cert = parse_leaf(der).expect("fixture should parse");

        assert_eq!(cert.issuer, "CN=probe-test.internal");
        assert_eq!(cert.subject, "CN=probe-test.internal");
        assert_eq!(
            cert.sans,
            ["probe-test.internal", "www.probe-test.internal"]
        );
        assert!(cert.not_before < cert.not_after);
        assert_eq!(
            cert.not_after.to_rfc3339_opts(SecondsFormat::Secs, true),
            "2036-09-03T19:34:43Z"
        );
        assert_eq!(
            cert.serial,
            "5a:c0:a8:3e:06:99:f4:b2:16:d4:75:23:0e:c2:99:41:57:2b:1f:8c"
        );
        assert_eq!(
            cert.fingerprint_sha256,
            "2a4c37cb537908b1b0176b943d32acbf6268bcc850bf7ee021baa5276349c48e"
        );
    }

    #[test]
    fn parse_leaf_rejects_garbage() {
        let error = parse_leaf(b"not a cert").expect_err("garbage must fail");
        assert!(matches!(error, ProbeError::Parse(_)));
        assert!(error.to_string().starts_with("certificate parse failed:"));
    }

    #[test]
    fn cert_status_boundaries() {
        assert_eq!(cert_status(Some(15), None, 14), "ok");
        assert_eq!(cert_status(Some(14), None, 14), "ok");
        assert_eq!(cert_status(Some(13), None, 14), "expiring");
        assert_eq!(cert_status(Some(0), None, 14), "expiring");
        assert_eq!(cert_status(Some(-1), None, 14), "expired");
        assert_eq!(cert_status(None, Some("x"), 14), "error");
    }

    #[test]
    fn effective_interval_and_threshold() {
        assert_eq!(effective_interval(None), Some(Duration::from_secs(21_600)));
        assert_eq!(effective_interval(Some("0")), None);
        assert_eq!(
            effective_interval(Some("300")),
            Some(Duration::from_secs(300))
        );
        assert_eq!(
            effective_interval(Some("garbage")),
            Some(Duration::from_secs(21_600))
        );
        assert_eq!(effective_threshold(None), 14);
        assert_eq!(effective_threshold(Some("0")), 0);
        assert_eq!(effective_threshold(Some("7")), 7);
        assert_eq!(effective_threshold(Some("x")), 14);
    }

    #[tokio::test]
    async fn probe_tls_connection_refused() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let port = listener.local_addr().expect("listener address").port();
        drop(listener);

        let error = probe_tls("127.0.0.1", port, "x.internal", Duration::from_secs(2))
            .await
            .expect_err("closed port must fail");
        assert!(matches!(error, ProbeError::Connect(_)));
        assert!(error.to_string().starts_with("connect failed:"));
    }

    #[tokio::test]
    async fn scheduler_skips_when_disabled() {
        let pool = db::init(":memory:").await.expect("in-memory DB");
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('caddy_cert_probe_interval_secs', '0')",
        )
        .execute(&pool)
        .await
        .expect("seed disabled interval");
        // Pause only after sqlx has established its worker connections. A
        // start-paused runtime can expire sqlx's pool timeout during setup.
        tokio::time::pause();
        start_cert_probe_task(test_state(pool.clone()));

        tokio::time::advance(Duration::from_secs(400)).await;
        tokio::task::yield_now().await;

        let last_probe: Option<String> =
            sqlx::query_scalar("SELECT value FROM settings WHERE key = 'caddy_cert_last_probe_at'")
                .fetch_optional(&pool)
                .await
                .expect("read last probe");
        assert!(last_probe.is_none());
    }

    #[tokio::test]
    async fn evaluate_expiry_alerts_dedupes_and_respects_threshold() {
        let pool = db::init(":memory:").await.expect("in-memory DB");
        let state = test_state(pool.clone());
        let now = Utc::now();
        for (domain, days) in [
            ("one.example", 1),
            ("five.example", 5),
            ("sixty.example", 60),
        ] {
            sqlx::query(
                "INSERT INTO caddy_certificates \
                 (domain, issuer, not_after, error, probed_at) VALUES (?, 'Test CA', ?, NULL, ?)",
            )
            .bind(domain)
            .bind((now + chrono::Duration::days(days)).to_rfc3339_opts(SecondsFormat::Secs, true))
            .bind(now.to_rfc3339_opts(SecondsFormat::Secs, true))
            .execute(&pool)
            .await
            .expect("seed certificate");
        }

        assert_eq!(evaluate_expiry_alerts(&state).await, 2);
        assert_eq!(evaluate_expiry_alerts(&state).await, 0);
        let domains: Vec<String> = sqlx::query_scalar(
            "SELECT json_extract(details, '$.domain') FROM alerts \
             WHERE type = 'certificate_expiring' ORDER BY 1",
        )
        .fetch_all(&pool)
        .await
        .expect("load alert domains");
        assert_eq!(domains, ["five.example", "one.example"]);

        sqlx::query("DELETE FROM alerts")
            .execute(&pool)
            .await
            .expect("clear alerts");
        assert!(
            upsert_setting(&state, "caddy_cert_expiry_threshold_days", "3")
                .await
                .is_ok(),
            "set threshold"
        );
        assert_eq!(evaluate_expiry_alerts(&state).await, 1);
        let only_domain: String = sqlx::query_scalar(
            "SELECT json_extract(details, '$.domain') FROM alerts \
             WHERE type = 'certificate_expiring'",
        )
        .fetch_one(&pool)
        .await
        .expect("load only alert");
        assert_eq!(only_domain, "one.example");

        sqlx::query("DELETE FROM alerts")
            .execute(&pool)
            .await
            .expect("clear alerts");
        assert!(
            upsert_setting(&state, "caddy_cert_expiry_threshold_days", "0")
                .await
                .is_ok(),
            "disable alerts"
        );
        assert_eq!(evaluate_expiry_alerts(&state).await, 0);
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'certificate_expiring'")
                .fetch_one(&pool)
                .await
                .expect("count alerts");
        assert_eq!(count, 0);
    }
}
