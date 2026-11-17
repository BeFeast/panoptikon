use std::sync::atomic::Ordering;

use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::Row;

use super::settings::get_setting;
use super::{AppError, AppState};
use crate::caddy_probe::{
    cert_status, effective_interval, effective_threshold, probe_target, run_claimed_probe_cycle,
};

#[derive(Debug, Serialize)]
pub struct CaddyCertificate {
    pub domain: String,
    pub proxy_host_id: Option<String>,
    pub issuer: Option<String>,
    pub subject: Option<String>,
    pub sans: Vec<String>,
    pub not_before: Option<String>,
    pub not_after: Option<String>,
    pub serial: Option<String>,
    pub fingerprint_sha256: Option<String>,
    pub chain_valid: Option<bool>,
    pub days_remaining: Option<i64>,
    pub status: String,
    pub error: Option<String>,
    pub probed_at: String,
}

#[derive(Debug, Serialize)]
pub struct CaddyCertificatesResponse {
    pub probe_running: bool,
    pub last_probe_at: Option<String>,
    pub interval_secs: u64,
    pub probe_host: String,
    pub probe_port: u16,
    pub threshold_days: i64,
    pub certificates: Vec<CaddyCertificate>,
}

#[derive(Debug, Serialize)]
pub struct ProbeStartedResponse {
    pub started: bool,
}

/// GET /api/v1/caddy/certificates — list the latest live TLS probe results.
pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<CaddyCertificatesResponse>, AppError> {
    let interval_setting = get_setting(&state, "caddy_cert_probe_interval_secs").await;
    let interval_secs = effective_interval(interval_setting.as_deref())
        .map(|interval| interval.as_secs())
        .unwrap_or(0);
    let threshold_setting = get_setting(&state, "caddy_cert_expiry_threshold_days").await;
    let threshold_days = effective_threshold(threshold_setting.as_deref());
    let last_probe_at = get_setting(&state, "caddy_cert_last_probe_at").await;
    let (probe_host, probe_port) = probe_target(&state).await;

    let rows = sqlx::query(
        r#"SELECT domain, proxy_host_id, issuer, subject, sans, not_before, not_after,
                  serial, fingerprint_sha256, chain_valid, error, probed_at
           FROM caddy_certificates"#,
    )
    .fetch_all(&state.db)
    .await?;
    let now = Utc::now();
    let mut certificates = Vec::with_capacity(rows.len());
    for row in rows {
        let not_after: Option<String> = row.try_get("not_after")?;
        let error: Option<String> = row.try_get("error")?;
        let days_remaining = not_after
            .as_deref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|expires_at| (expires_at.with_timezone(&Utc) - now).num_days());
        let status = cert_status(days_remaining, error.as_deref(), threshold_days).to_string();
        let sans_json: Option<String> = row.try_get("sans")?;
        let sans = sans_json
            .as_deref()
            .and_then(|value| serde_json::from_str(value).ok())
            .unwrap_or_default();
        let chain_valid = row
            .try_get::<Option<i64>, _>("chain_valid")?
            .map(|value| value != 0);

        certificates.push(CaddyCertificate {
            domain: row.try_get("domain")?,
            proxy_host_id: row.try_get("proxy_host_id")?,
            issuer: row.try_get("issuer")?,
            subject: row.try_get("subject")?,
            sans,
            not_before: row.try_get("not_before")?,
            not_after,
            serial: row.try_get("serial")?,
            fingerprint_sha256: row.try_get("fingerprint_sha256")?,
            chain_valid,
            days_remaining,
            status,
            error,
            probed_at: row.try_get("probed_at")?,
        });
    }
    certificates.sort_by(|left, right| {
        status_rank(&left.status)
            .cmp(&status_rank(&right.status))
            .then_with(|| left.domain.cmp(&right.domain))
    });

    Ok(Json(CaddyCertificatesResponse {
        probe_running: state.caddy_probe.running.load(Ordering::SeqCst),
        last_probe_at,
        interval_secs,
        probe_host,
        probe_port,
        threshold_days,
        certificates,
    }))
}

/// POST /api/v1/caddy/certificates/probe — start a probe cycle in the background.
pub async fn probe_now(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<ProbeStartedResponse>), AppError> {
    if !state.caddy_probe.try_start() {
        return Err(AppError::Conflict("probe already running".to_string()));
    }

    tokio::spawn(async move {
        run_claimed_probe_cycle(&state).await;
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(ProbeStartedResponse { started: true }),
    ))
}

fn status_rank(status: &str) -> u8 {
    match status {
        "error" => 0,
        "expired" => 1,
        "expiring" => 2,
        _ => 3,
    }
}
