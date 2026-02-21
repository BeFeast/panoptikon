use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::{netflow, webhook};

/// Settings object returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub webhook_url: Option<String>,
    pub vyos_url: Option<String>,
    /// Masked API key — never return the full key to the frontend.
    pub vyos_api_key_set: bool,
    // --- Network Scanner ---
    pub scan_interval_seconds: Option<u64>,
    pub scan_subnets: Option<String>,
    pub ping_sweep_enabled: Option<bool>,
    // --- Data Retention ---
    pub retention_traffic_hours: Option<u64>,
    pub retention_alerts_days: Option<u64>,
    pub retention_agent_reports_days: Option<u64>,
}

/// Request body for updating settings.
#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub webhook_url: Option<String>,
    pub vyos_url: Option<String>,
    pub vyos_api_key: Option<String>,
    // --- Network Scanner ---
    pub scan_interval_seconds: Option<u64>,
    pub scan_subnets: Option<String>,
    pub ping_sweep_enabled: Option<bool>,
    // --- Data Retention ---
    pub retention_traffic_hours: Option<u64>,
    pub retention_alerts_days: Option<u64>,
    pub retention_agent_reports_days: Option<u64>,
}

/// Helper: read a string setting from the settings table.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// GET /api/v1/settings — return current settings.
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    let webhook_url = webhook::get_webhook_url(&state.db).await;

    let vyos_url = get_setting(&state, "vyos_url").await;

    let vyos_api_key_set = get_setting(&state, "vyos_api_key").await.is_some();

    // Network Scanner settings (fall back to config defaults).
    let scan_interval_seconds = get_setting(&state, "scan_interval_seconds")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.scanner.interval_seconds));

    let scan_subnets = get_setting(&state, "scan_subnets")
        .await
        .or_else(|| Some(state.config.scanner.subnets.join(",")));

    let ping_sweep_enabled = get_setting(&state, "ping_sweep_enabled")
        .await
        .map(|v| v == "true")
        .or(Some(true));

    // Data Retention settings (fall back to config defaults).
    let retention_traffic_hours = get_setting(&state, "retention_traffic_hours")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.traffic_samples_hours));

    let retention_alerts_days = get_setting(&state, "retention_alerts_days")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.alerts_days));

    let retention_agent_reports_days = get_setting(&state, "retention_agent_reports_days")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.agent_reports_days));

    Ok(Json(SettingsResponse {
        webhook_url,
        vyos_url,
        vyos_api_key_set,
        scan_interval_seconds,
        scan_subnets,
        ping_sweep_enabled,
        retention_traffic_hours,
        retention_alerts_days,
        retention_agent_reports_days,
    }))
}

/// PATCH /api/v1/settings — update settings.
pub async fn update_settings(
    State(state): State<AppState>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    if let Some(ref url) = body.webhook_url {
        upsert_setting(&state, "webhook_url", url).await?;
        info!(webhook_url = %url, "Webhook URL updated");
    }

    if let Some(ref url) = body.vyos_url {
        upsert_setting(&state, "vyos_url", url).await?;
        info!(vyos_url = %url, "VyOS URL updated");
    }

    if let Some(ref key) = body.vyos_api_key {
        // NOTE: The VyOS API key is stored unencrypted in SQLite.
        // This is intentional for a single-user self-hosted deployment where
        // the database file is protected by OS filesystem permissions and the
        // server requires authentication to read or modify settings.
        // TODO: Add at-rest encryption (e.g. AES-GCM with a server-generated
        // key stored outside the database) if multi-user or remote DB support
        // is added in the future.
        upsert_setting(&state, "vyos_api_key", key).await?;
        info!("VyOS API key updated");
    }

    // --- Network Scanner settings ---
    if let Some(interval) = body.scan_interval_seconds {
        upsert_setting(&state, "scan_interval_seconds", &interval.to_string()).await?;
        info!(scan_interval_seconds = interval, "Scan interval updated");
    }

    if let Some(ref subnets) = body.scan_subnets {
        upsert_setting(&state, "scan_subnets", subnets).await?;
        info!(scan_subnets = %subnets, "Scan subnets updated");
    }

    if let Some(enabled) = body.ping_sweep_enabled {
        upsert_setting(&state, "ping_sweep_enabled", &enabled.to_string()).await?;
        info!(ping_sweep_enabled = enabled, "Ping sweep toggle updated");
    }

    // --- Data Retention settings ---
    if let Some(hours) = body.retention_traffic_hours {
        upsert_setting(&state, "retention_traffic_hours", &hours.to_string()).await?;
        info!(retention_traffic_hours = hours, "Traffic retention updated");
    }

    if let Some(days) = body.retention_alerts_days {
        upsert_setting(&state, "retention_alerts_days", &days.to_string()).await?;
        info!(retention_alerts_days = days, "Alerts retention updated");
    }

    if let Some(days) = body.retention_agent_reports_days {
        upsert_setting(&state, "retention_agent_reports_days", &days.to_string()).await?;
        info!(
            retention_agent_reports_days = days,
            "Agent reports retention updated"
        );
    }

    // Return current state.
    get_settings(State(state)).await
}

/// POST /api/v1/settings/test-webhook — send a test webhook.
pub async fn test_webhook(
    State(state): State<AppState>,
) -> Result<StatusCode, (StatusCode, String)> {
    let url = webhook::get_webhook_url(&state.db).await.ok_or((
        StatusCode::BAD_REQUEST,
        "No webhook URL configured".to_string(),
    ))?;

    let payload = serde_json::json!({
        "type": "test",
        "data": {
            "message": "Panoptikon webhook test",
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    // For test, we actually await the result so we can report success/failure.
    webhook::send_webhook(&url, payload).await;

    Ok(StatusCode::NO_CONTENT)
}

/// Response for the netflow-status endpoint.
#[derive(Debug, Serialize)]
pub struct NetflowStatusResponse {
    pub enabled: bool,
    pub port: u16,
    pub flows_received: u64,
}

/// GET /api/v1/settings/netflow-status — return NetFlow collector status.
pub async fn netflow_status(State(state): State<AppState>) -> Json<NetflowStatusResponse> {
    Json(NetflowStatusResponse {
        enabled: state.config.scanner.netflow_enabled,
        port: state.config.scanner.netflow_port,
        flows_received: netflow::flows_received(),
    })
}

/// Response for the db-size endpoint.
#[derive(Debug, Serialize)]
pub struct DbSizeResponse {
    pub size_bytes: u64,
}

/// GET /api/v1/settings/db-size — return the current database file size.
pub async fn db_size(State(state): State<AppState>) -> Result<Json<DbSizeResponse>, StatusCode> {
    // Use SQLite's page_count * page_size to get the logical size.
    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get page_count: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get page_size: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let size_bytes = (page_count * page_size) as u64;
    Ok(Json(DbSizeResponse { size_bytes }))
}

/// POST /api/v1/settings/vacuum — manually trigger a database VACUUM.
pub async fn vacuum(State(state): State<AppState>) -> Result<StatusCode, (StatusCode, String)> {
    info!("Manual VACUUM requested");

    // Checkpoint WAL first.
    if let Err(e) = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&state.db)
        .await
    {
        error!("WAL checkpoint failed: {e}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("WAL checkpoint failed: {e}"),
        ));
    }

    // Run VACUUM.
    if let Err(e) = sqlx::query("VACUUM").execute(&state.db).await {
        error!("VACUUM failed: {e}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("VACUUM failed: {e}"),
        ));
    }

    // Update last_vacuum_at.
    let _ = sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES ('last_vacuum_at', datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = datetime('now')"#,
    )
    .execute(&state.db)
    .await;

    info!("Manual VACUUM completed successfully");
    Ok(StatusCode::NO_CONTENT)
}

/// Helper to upsert a key-value pair into the settings table.
async fn upsert_setting(state: &AppState, key: &str, value: &str) -> Result<(), StatusCode> {
    sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
    )
    .bind(key)
    .bind(value)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to save setting '{key}': {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(())
}
