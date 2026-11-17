//! Live TLS probing for certificates served by Caddy.
//!
//! The probe performs only a TLS handshake against the configured listener. It
//! does not call Caddy's Admin API and deliberately records untrusted chains
//! instead of rejecting them, so internal-CA and self-signed certificates stay
//! visible to operators.

use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{DateTime, Utc};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::WebPkiServerVerifier;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, RootCertStore, SignatureScheme};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Row, Sqlite};
use tokio::net::TcpStream;
use tokio::task::JoinSet;
use tokio_rustls::TlsConnector;
use tracing::{error, info, warn};
use x509_parser::extensions::GeneralName;
use x509_parser::prelude::{FromDer, X509Certificate};

use crate::api::settings::{get_setting, upsert_setting};
use crate::api::AppState;

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
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "connect failed: {error}"),
            Self::Timeout(seconds) => write!(formatter, "timed out after {seconds}s"),
            Self::Handshake(error) => write!(formatter, "handshake failed: {error}"),
            Self::NoCertificate => formatter.write_str("no certificate presented"),
            Self::Parse(error) => write!(formatter, "certificate parse failed: {error}"),
        }
    }
}

impl std::error::Error for ProbeError {}

#[derive(Debug, Clone, Copy, Default, Serialize)]
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

impl ProbeState {
    pub fn try_start(&self) -> bool {
        self.running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
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
        let valid = self
            .inner
            .verify_server_cert(end_entity, intermediates, server_name, ocsp_response, now)
            .is_ok();
        if let Ok(mut recorded) = self.chain_valid.lock() {
            *recorded = Some(valid);
        }
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner
            .verify_tls12_signature(message, certificate, signature)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        certificate: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.inner
            .verify_tls13_signature(message, certificate, signature)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

pub fn parse_leaf(der: &[u8]) -> Result<ParsedCert, ProbeError> {
    let (_, certificate) =
        X509Certificate::from_der(der).map_err(|error| ProbeError::Parse(error.to_string()))?;
    let not_before =
        DateTime::<Utc>::from_timestamp(certificate.validity().not_before.timestamp(), 0)
            .ok_or_else(|| ProbeError::Parse("not-before timestamp is out of range".to_string()))?;
    let not_after =
        DateTime::<Utc>::from_timestamp(certificate.validity().not_after.timestamp(), 0)
            .ok_or_else(|| ProbeError::Parse("not-after timestamp is out of range".to_string()))?;
    let sans = certificate
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
        issuer: certificate.issuer().to_string(),
        subject: certificate.subject().to_string(),
        sans,
        not_before,
        not_after,
        serial: certificate.raw_serial_as_string(),
        fingerprint_sha256: Sha256::digest(der)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
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
    // A zero alert threshold disables notifications, not visual expiry health.
    let status_threshold = if threshold == 0 {
        DEFAULT_THRESHOLD_DAYS
    } else {
        threshold
    };
    match days_remaining {
        Some(days) if days < 0 => "expired",
        Some(days) if days < status_threshold => "expiring",
        _ => "ok",
    }
}

pub fn effective_interval(raw: Option<&str>) -> Option<Duration> {
    match raw.and_then(|value| value.parse::<u64>().ok()) {
        Some(0) => None,
        Some(seconds) if seconds >= 300 => Some(Duration::from_secs(seconds)),
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
    let started = tokio::time::Instant::now();
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
    let connector = TlsConnector::from(Arc::new(config));
    let server_name = ServerName::try_from(sni.to_string())
        .map_err(|error| ProbeError::Handshake(error.to_string()))?;
    let remaining = timeout
        .checked_sub(started.elapsed())
        .unwrap_or(Duration::ZERO);
    let stream = tokio::time::timeout(remaining, connector.connect(server_name, tcp))
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

pub(crate) async fn probe_target(state: &AppState) -> (String, u16) {
    let host = match get_setting(state, "caddy_cert_probe_host").await {
        Some(host) => host,
        None => get_setting(state, "caddy_admin_url")
            .await
            .and_then(|url| reqwest::Url::parse(&url).ok())
            .and_then(|url| url.host_str().map(ToOwned::to_owned))
            .unwrap_or_else(|| "localhost".to_string()),
    };
    let port = get_setting(state, "caddy_cert_probe_port")
        .await
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_PROBE_PORT);
    (host, port)
}

pub async fn run_probe_cycle(state: &AppState) -> ProbeSummary {
    if !state.caddy_probe.try_start() {
        return ProbeSummary::default();
    }
    run_claimed_probe_cycle(state).await
}

pub(crate) async fn run_claimed_probe_cycle(state: &AppState) -> ProbeSummary {
    let summary = run_probe_cycle_inner(state).await;
    if let Ok(mut last_summary) = state.caddy_probe.last_summary.lock() {
        *last_summary = Some(summary);
    }
    state.caddy_probe.running.store(false, Ordering::SeqCst);
    summary
}

async fn run_probe_cycle_inner(state: &AppState) -> ProbeSummary {
    let targets: Vec<(String, String)> = match sqlx::query_as(
        "SELECT id, domain FROM caddy_proxy_hosts \
         WHERE enabled = 1 AND tls_enabled = 1 ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(targets) => targets,
        Err(error) => {
            error!(%error, "Failed to load Caddy certificate probe targets");
            return ProbeSummary::default();
        }
    };

    let (host, port) = probe_target(state).await;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_PROBES));
    let mut probes = JoinSet::new();
    for (proxy_host_id, domain) in &targets {
        let semaphore = semaphore.clone();
        let host = host.clone();
        let domain = domain.clone();
        let proxy_host_id = proxy_host_id.clone();
        probes.spawn(async move {
            let permit = semaphore.acquire_owned().await;
            let result = match permit {
                Ok(_permit) => probe_tls(&host, port, &domain, PROBE_TIMEOUT).await,
                Err(error) => Err(ProbeError::Connect(error.to_string())),
            };
            (proxy_host_id, domain, result)
        });
    }

    let probed_at = Utc::now().to_rfc3339();
    let mut summary = ProbeSummary {
        probed: targets.len(),
        ..ProbeSummary::default()
    };
    while let Some(joined) = probes.join_next().await {
        match joined {
            Ok((proxy_host_id, domain, Ok(result))) => {
                summary.ok += 1;
                if let Err(error) =
                    store_probe_success(state, &proxy_host_id, &domain, &result, &probed_at).await
                {
                    warn!(%domain, %error, "Failed to store Caddy certificate probe result");
                }
            }
            Ok((proxy_host_id, domain, Err(probe_error))) => {
                summary.failed += 1;
                warn!(%domain, error = %probe_error, "Caddy certificate probe failed");
                if let Err(error) =
                    store_probe_failure(state, &proxy_host_id, &domain, &probe_error, &probed_at)
                        .await
                {
                    warn!(%domain, %error, "Failed to store Caddy certificate probe failure");
                }
            }
            Err(error) => {
                summary.failed += 1;
                warn!(%error, "Caddy certificate probe task failed");
            }
        }
    }

    if let Err(error) = delete_stale_certificates(state, &targets).await {
        warn!(%error, "Failed to delete stale Caddy certificate probe rows");
    }
    summary.alerts_created = match evaluate_expiry_alerts(state).await {
        Ok(created) => created,
        Err(error) => {
            warn!(%error, "Failed to evaluate Caddy certificate expiry alerts");
            0
        }
    };
    if upsert_setting(state, "caddy_cert_last_probe_at", &Utc::now().to_rfc3339())
        .await
        .is_err()
    {
        warn!("Failed to store Caddy certificate probe completion time");
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

async fn store_probe_success(
    state: &AppState,
    proxy_host_id: &str,
    domain: &str,
    result: &ProbeResult,
    probed_at: &str,
) -> Result<(), sqlx::Error> {
    let sans = serde_json::to_string(&result.cert.sans).unwrap_or_else(|_| "[]".to_string());
    sqlx::query(
        r#"INSERT INTO caddy_certificates
           (domain, proxy_host_id, issuer, subject, sans, not_before, not_after, serial,
            fingerprint_sha256, chain_valid, error, probed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(domain) DO UPDATE SET
             proxy_host_id = excluded.proxy_host_id,
             issuer = excluded.issuer,
             subject = excluded.subject,
             sans = excluded.sans,
             not_before = excluded.not_before,
             not_after = excluded.not_after,
             serial = excluded.serial,
             fingerprint_sha256 = excluded.fingerprint_sha256,
             chain_valid = excluded.chain_valid,
             error = NULL,
             probed_at = excluded.probed_at"#,
    )
    .bind(domain)
    .bind(proxy_host_id)
    .bind(&result.cert.issuer)
    .bind(&result.cert.subject)
    .bind(sans)
    .bind(result.cert.not_before.to_rfc3339())
    .bind(result.cert.not_after.to_rfc3339())
    .bind(&result.cert.serial)
    .bind(&result.cert.fingerprint_sha256)
    .bind(result.chain_valid)
    .bind(probed_at)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn store_probe_failure(
    state: &AppState,
    proxy_host_id: &str,
    domain: &str,
    probe_error: &ProbeError,
    probed_at: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO caddy_certificates
           (domain, proxy_host_id, issuer, subject, sans, not_before, not_after, serial,
            fingerprint_sha256, chain_valid, error, probed_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
           ON CONFLICT(domain) DO UPDATE SET
             proxy_host_id = excluded.proxy_host_id,
             issuer = NULL,
             subject = NULL,
             sans = NULL,
             not_before = NULL,
             not_after = NULL,
             serial = NULL,
             fingerprint_sha256 = NULL,
             chain_valid = NULL,
             error = excluded.error,
             probed_at = excluded.probed_at"#,
    )
    .bind(domain)
    .bind(proxy_host_id)
    .bind(probe_error.to_string())
    .bind(probed_at)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn delete_stale_certificates(
    state: &AppState,
    targets: &[(String, String)],
) -> Result<(), sqlx::Error> {
    if targets.is_empty() {
        sqlx::query("DELETE FROM caddy_certificates")
            .execute(&state.db)
            .await?;
        return Ok(());
    }

    let mut query =
        QueryBuilder::<Sqlite>::new("DELETE FROM caddy_certificates WHERE domain NOT IN (");
    {
        let mut domains = query.separated(", ");
        for (_, domain) in targets {
            domains.push_bind(domain);
        }
    }
    query.push(")").build().execute(&state.db).await?;
    Ok(())
}

async fn evaluate_expiry_alerts(state: &AppState) -> Result<usize, sqlx::Error> {
    let threshold_setting = get_setting(state, "caddy_cert_expiry_threshold_days").await;
    let threshold = effective_threshold(threshold_setting.as_deref());
    if threshold == 0 {
        return Ok(0);
    }

    let rows = sqlx::query(
        "SELECT domain, issuer, not_after FROM caddy_certificates \
         WHERE error IS NULL AND not_after IS NOT NULL ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await?;
    let mut created = 0;
    for row in rows {
        let domain: String = row.try_get("domain")?;
        let issuer: String = row.try_get("issuer")?;
        let not_after: String = row.try_get("not_after")?;
        let Ok(expires_at) = DateTime::parse_from_rfc3339(&not_after) else {
            continue;
        };
        let days_remaining = (expires_at.with_timezone(&Utc) - Utc::now()).num_days();
        if days_remaining >= threshold {
            continue;
        }

        let duplicate: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM alerts \
             WHERE type = 'certificate_expiring' \
               AND json_extract(details, '$.domain') = ? \
               AND created_at > datetime('now', '-1 day') LIMIT 1",
        )
        .bind(&domain)
        .fetch_optional(&state.db)
        .await?;
        if duplicate.is_some() {
            continue;
        }

        let message = if days_remaining < 0 {
            format!(
                "Certificate for {domain} expired {} days ago ({not_after})",
                days_remaining.abs()
            )
        } else {
            format!("Certificate for {domain} expires in {days_remaining} days ({not_after})")
        };
        let severity = if days_remaining < 0 {
            "CRITICAL"
        } else {
            "WARNING"
        };
        let details = serde_json::json!({
            "domain": domain,
            "not_after": not_after,
            "days_remaining": days_remaining,
            "issuer": issuer,
        });
        sqlx::query(
            "INSERT INTO alerts (id, type, message, details, severity, created_at) \
             VALUES (?, 'certificate_expiring', ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(message)
        .bind(details.to_string())
        .bind(severity)
        .bind(Utc::now().to_rfc3339())
        .execute(&state.db)
        .await?;

        state
            .ws_hub
            .broadcast("certificate_expiring", details.clone());
        crate::webhook::dispatch_webhook(&state.db, "certificate_expiring", details.clone());
        crate::email::dispatch_email(&state.db, "certificate_expiring", details);
        created += 1;
    }
    Ok(created)
}

pub fn start_cert_probe_task(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            let configured = get_setting(&state, "caddy_cert_probe_interval_secs").await;
            match effective_interval(configured.as_deref()) {
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

    async fn test_state() -> AppState {
        AppState::new(
            crate::db::init(":memory:").await.expect("database init"),
            crate::config::AppConfig::default(),
        )
    }

    #[test]
    fn parse_leaf_fixture() {
        let parsed = parse_leaf(include_bytes!("../tests/fixtures/probe-test.internal.der"))
            .expect("fixture certificate should parse");
        assert_eq!(parsed.issuer, "CN=probe-test.internal");
        assert_eq!(parsed.subject, "CN=probe-test.internal");
        assert_eq!(
            parsed.sans,
            ["probe-test.internal", "www.probe-test.internal"]
        );
        assert!(parsed.not_before < parsed.not_after);
        assert_eq!(parsed.not_after.to_rfc3339(), "2036-09-03T18:33:21+00:00");
        assert_eq!(
            parsed.serial,
            "38:3b:af:5a:54:9d:ee:83:15:02:a4:77:a0:90:00:e2:bc:9b:3f:be"
        );
        assert_eq!(
            parsed.fingerprint_sha256,
            "5e6632986d7beadabeaba7695318b7e40636dbe7f988f97832e5045f7cf39c3c"
        );
    }

    #[test]
    fn parse_leaf_rejects_garbage() {
        let error = parse_leaf(b"not a cert").expect_err("garbage must be rejected");
        assert!(matches!(error, ProbeError::Parse(_)));
        assert!(error.to_string().starts_with("certificate parse failed:"));
    }

    #[test]
    fn probe_error_display_contract() {
        assert_eq!(ProbeError::Connect("refused".into()).to_string(), "connect failed: refused");
        assert_eq!(ProbeError::Timeout(10).to_string(), "timed out after 10s");
        assert_eq!(
            ProbeError::Handshake("bad certificate".into()).to_string(),
            "handshake failed: bad certificate"
        );
        assert_eq!(ProbeError::NoCertificate.to_string(), "no certificate presented");
        assert_eq!(
            ProbeError::Parse("garbage".into()).to_string(),
            "certificate parse failed: garbage"
        );
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
            .expect("bind test listener");
        let port = listener.local_addr().expect("listener address").port();
        drop(listener);

        let error = probe_tls("127.0.0.1", port, "x.internal", Duration::from_secs(2))
            .await
            .expect_err("closed port should fail");
        assert!(matches!(error, ProbeError::Connect(_)));
        assert!(error.to_string().starts_with("connect failed:"));
    }

    #[tokio::test]
    async fn scheduler_skips_when_disabled() {
        let state = test_state().await;
        assert!(
            upsert_setting(&state, "caddy_cert_probe_interval_secs", "0")
                .await
                .is_ok(),
            "disabling the scheduler should succeed"
        );
        tokio::time::pause();
        start_cert_probe_task(state.clone());
        tokio::time::advance(Duration::from_secs(400)).await;
        tokio::task::yield_now().await;
        tokio::time::resume();

        let last_probe: Option<String> =
            sqlx::query_scalar("SELECT value FROM settings WHERE key = 'caddy_cert_last_probe_at'")
                .fetch_optional(&state.db)
                .await
                .expect("query last probe");
        assert!(last_probe.is_none());
    }

    #[tokio::test]
    async fn evaluate_expiry_alerts_dedupes_and_respects_threshold() {
        let state = test_state().await;
        for (domain, days) in [("one.test", 1), ("five.test", 5), ("sixty.test", 60)] {
            sqlx::query(
                "INSERT INTO caddy_certificates \
                 (domain, issuer, not_after, chain_valid, probed_at) VALUES (?, 'Test CA', ?, 1, ?)",
            )
            .bind(domain)
            .bind((Utc::now() + chrono::Duration::days(days)).to_rfc3339())
            .bind(Utc::now().to_rfc3339())
            .execute(&state.db)
            .await
            .expect("seed certificate");
        }

        assert_eq!(evaluate_expiry_alerts(&state).await.expect("evaluate"), 2);
        assert_eq!(evaluate_expiry_alerts(&state).await.expect("dedupe"), 0);
        assert_alert_domains(&state, &["five.test", "one.test"]).await;

        assert!(
            upsert_setting(&state, "caddy_cert_expiry_threshold_days", "3")
                .await
                .is_ok(),
            "setting the threshold should succeed"
        );
        sqlx::query("DELETE FROM alerts")
            .execute(&state.db)
            .await
            .expect("clear alerts");
        assert_eq!(evaluate_expiry_alerts(&state).await.expect("evaluate"), 1);
        assert_alert_domains(&state, &["one.test"]).await;

        assert!(
            upsert_setting(&state, "caddy_cert_expiry_threshold_days", "0")
                .await
                .is_ok(),
            "disabling alerts should succeed"
        );
        sqlx::query("DELETE FROM alerts")
            .execute(&state.db)
            .await
            .expect("clear alerts");
        assert_eq!(evaluate_expiry_alerts(&state).await.expect("disabled"), 0);
        assert_alert_domains(&state, &[]).await;
    }

    #[tokio::test]
    async fn target_load_failure_performs_no_database_writes() {
        let state = test_state().await;
        sqlx::query(
            "INSERT INTO caddy_certificates (domain, error, probed_at) \
             VALUES ('existing.test', 'old error', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .expect("seed cached certificate");
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES \
             ('caddy_cert_last_probe_at', '2026-01-01T00:00:00Z')",
        )
        .execute(&state.db)
        .await
        .expect("seed completion time");
        sqlx::query("DROP TABLE caddy_proxy_hosts")
            .execute(&state.db)
            .await
            .expect("force target load failure");

        let summary = run_probe_cycle(&state).await;
        assert_eq!(summary.probed, 0);
        let cached: (i64, String) = sqlx::query_as(
            "SELECT COUNT(*), MAX(probed_at) FROM caddy_certificates",
        )
        .fetch_one(&state.db)
        .await
        .expect("read cached certificate");
        assert_eq!(cached, (1, "2026-01-01T00:00:00Z".to_string()));
        assert_eq!(
            get_setting(&state, "caddy_cert_last_probe_at").await,
            Some("2026-01-01T00:00:00Z".to_string())
        );
        assert!(!state.caddy_probe.running.load(Ordering::SeqCst));
    }

    async fn assert_alert_domains(state: &AppState, expected: &[&str]) {
        let details: Vec<String> = sqlx::query_scalar(
            "SELECT details FROM alerts WHERE type = 'certificate_expiring' ORDER BY details",
        )
        .fetch_all(&state.db)
        .await
        .expect("query alerts");
        let mut domains: Vec<String> = details
            .iter()
            .map(|detail| {
                serde_json::from_str::<serde_json::Value>(detail).expect("alert details JSON")
                    ["domain"]
                    .as_str()
                    .expect("domain")
                    .to_string()
            })
            .collect();
        domains.sort();
        assert_eq!(
            domains,
            expected
                .iter()
                .map(|domain| (*domain).to_string())
                .collect::<Vec<_>>()
        );
    }
}
