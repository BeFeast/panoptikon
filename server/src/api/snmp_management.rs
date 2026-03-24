use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;

/// SNMP configuration as returned by the API.
#[derive(Debug, Serialize)]
pub struct SnmpConfig {
    pub enabled: bool,
    pub community: String,
    pub version: String,
    pub port: u16,
    pub timeout_seconds: u64,
    pub retries: u64,
}

/// Request body for updating SNMP configuration.
#[derive(Debug, Deserialize)]
pub struct UpdateSnmpConfigRequest {
    pub enabled: Option<bool>,
    pub community: Option<String>,
    pub version: Option<String>,
    pub port: Option<u16>,
    pub timeout_seconds: Option<u64>,
    pub retries: Option<u64>,
}

/// SNMP query result for the status endpoint.
#[derive(Debug, Serialize)]
pub struct SnmpStatus {
    pub available: bool,
    pub config: SnmpConfig,
}

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

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
        error!("Failed to save SNMP setting '{key}': {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(())
}

async fn load_config(state: &AppState) -> SnmpConfig {
    let enabled = get_setting(state, "snmp_scan_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    let community = get_setting(state, "snmp_community")
        .await
        .unwrap_or_else(|| "public".to_string());
    let version = get_setting(state, "snmp_version")
        .await
        .unwrap_or_else(|| "2c".to_string());
    let port = get_setting(state, "snmp_port")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(161);
    let timeout_seconds = get_setting(state, "snmp_timeout_seconds")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);
    let retries = get_setting(state, "snmp_retries")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);

    SnmpConfig {
        enabled,
        community,
        version,
        port,
        timeout_seconds,
        retries,
    }
}

/// GET /api/v1/snmp/config — return SNMP configuration and availability.
pub async fn get_config(State(state): State<AppState>) -> Result<Json<SnmpStatus>, StatusCode> {
    let available = crate::scanner::snmp::is_available().await;
    let config = load_config(&state).await;

    Ok(Json(SnmpStatus { available, config }))
}

/// PATCH /api/v1/snmp/config — update SNMP configuration.
pub async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<UpdateSnmpConfigRequest>,
) -> Result<Json<SnmpStatus>, StatusCode> {
    if let Some(enabled) = body.enabled {
        upsert_setting(&state, "snmp_scan_enabled", if enabled { "1" } else { "0" }).await?;
        info!(snmp_enabled = enabled, "SNMP enabled toggle updated");
    }

    if let Some(ref community) = body.community {
        upsert_setting(&state, "snmp_community", community).await?;
        info!("SNMP community string updated");
    }

    if let Some(ref version) = body.version {
        let valid_versions = ["1", "2c", "3"];
        if !valid_versions.contains(&version.as_str()) {
            return Err(StatusCode::BAD_REQUEST);
        }
        upsert_setting(&state, "snmp_version", version).await?;
        info!(snmp_version = %version, "SNMP version updated");
    }

    if let Some(port) = body.port {
        upsert_setting(&state, "snmp_port", &port.to_string()).await?;
        info!(snmp_port = port, "SNMP port updated");
    }

    if let Some(timeout) = body.timeout_seconds {
        upsert_setting(&state, "snmp_timeout_seconds", &timeout.to_string()).await?;
        info!(snmp_timeout_seconds = timeout, "SNMP timeout updated");
    }

    if let Some(retries) = body.retries {
        upsert_setting(&state, "snmp_retries", &retries.to_string()).await?;
        info!(snmp_retries = retries, "SNMP retries updated");
    }

    let available = crate::scanner::snmp::is_available().await;
    let config = load_config(&state).await;

    Ok(Json(SnmpStatus { available, config }))
}
