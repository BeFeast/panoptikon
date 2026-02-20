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
}

/// Request body for updating settings.
#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub webhook_url: Option<String>,
    pub vyos_url: Option<String>,
    pub vyos_api_key: Option<String>,
}

/// GET /api/v1/settings — return current settings.
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    let webhook_url = webhook::get_webhook_url(&state.db).await;

    let vyos_url: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_url'"#)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    let vyos_api_key_set: bool =
        sqlx::query_scalar::<_, String>(r#"SELECT value FROM settings WHERE key = 'vyos_api_key'"#)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .map(|v| !v.is_empty())
            .unwrap_or(false);

    Ok(Json(SettingsResponse {
        webhook_url,
        vyos_url,
        vyos_api_key_set,
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
