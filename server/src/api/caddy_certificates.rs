use std::sync::atomic::Ordering;

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::Row;
use tracing::error;

use super::settings::get_setting;
use super::{AppError, AppState};
use crate::caddy_probe::{
    cert_status, configured_probe_host, configured_probe_port, effective_interval,
    effective_threshold, try_start_probe_cycle,
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
    pub status: &'static str,
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

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<CaddyCertificatesResponse>, AppError> {
    let raw_interval = get_setting(&state, "caddy_cert_probe_interval_secs").await;
    let raw_threshold = get_setting(&state, "caddy_cert_expiry_threshold_days").await;
    let threshold_days = effective_threshold(raw_threshold.as_deref());
    // A zero threshold disables alert creation, but the inventory should
    // still identify certificates inside the normal 14-day warning window.
    let status_threshold = if threshold_days == 0 {
        14
    } else {
        threshold_days
    };
    let now = Utc::now();
    let rows = sqlx::query(
        "SELECT domain, proxy_host_id, issuer, subject, sans, not_before, not_after, \
         serial, fingerprint_sha256, chain_valid, error, probed_at \
         FROM caddy_certificates",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|error| {
        error!(%error, "Failed to list Caddy certificates");
        AppError::Internal(error.to_string())
    })?;

    let mut certificates = rows
        .into_iter()
        .map(|row| {
            let not_after: Option<String> = row.get("not_after");
            let probe_error: Option<String> = row.get("error");
            let days_remaining = not_after
                .as_deref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| (value.with_timezone(&Utc) - now).num_days());
            CaddyCertificate {
                domain: row.get("domain"),
                proxy_host_id: row.get("proxy_host_id"),
                issuer: row.get("issuer"),
                subject: row.get("subject"),
                sans: row
                    .get::<Option<String>, _>("sans")
                    .and_then(|value| serde_json::from_str(&value).ok())
                    .unwrap_or_default(),
                not_before: row.get("not_before"),
                not_after,
                serial: row.get("serial"),
                fingerprint_sha256: row.get("fingerprint_sha256"),
                chain_valid: row
                    .get::<Option<i64>, _>("chain_valid")
                    .map(|value| value != 0),
                days_remaining,
                status: cert_status(days_remaining, probe_error.as_deref(), status_threshold),
                error: probe_error,
                probed_at: row.get("probed_at"),
            }
        })
        .collect::<Vec<_>>();
    certificates.sort_by(|left, right| {
        status_rank(left.status)
            .cmp(&status_rank(right.status))
            .then_with(|| left.domain.cmp(&right.domain))
    });

    Ok(Json(CaddyCertificatesResponse {
        probe_running: state.caddy_probe.running.load(Ordering::Acquire),
        last_probe_at: get_setting(&state, "caddy_cert_last_probe_at").await,
        interval_secs: effective_interval(raw_interval.as_deref())
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
        probe_host: configured_probe_host(&state).await,
        probe_port: configured_probe_port(&state).await,
        threshold_days,
        certificates,
    }))
}

fn status_rank(status: &str) -> u8 {
    match status {
        "error" => 0,
        "expired" => 1,
        "expiring" => 2,
        _ => 3,
    }
}

pub async fn probe_now(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<ProbeStartedResponse>), AppError> {
    if !try_start_probe_cycle(state) {
        return Err(AppError::Conflict("probe already running".to_string()));
    }
    Ok((
        StatusCode::ACCEPTED,
        Json(ProbeStartedResponse { started: true }),
    ))
}
