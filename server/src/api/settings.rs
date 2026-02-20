use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::webhook;

/// Settings object returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub webhook_url: Option<String>,
}

/// Request body for updating settings.
#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub webhook_url: Option<String>,
}

/// GET /api/v1/settings — return current settings.
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    let webhook_url = webhook::get_webhook_url(&state.db).await;

    Ok(Json(SettingsResponse { webhook_url }))
}

/// PATCH /api/v1/settings — update settings.
pub async fn update_settings(
    State(state): State<AppState>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    if let Some(ref url) = body.webhook_url {
        sqlx::query(
            r#"INSERT INTO settings (key, value) VALUES ('webhook_url', ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
        )
        .bind(url)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to save webhook_url: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        info!(webhook_url = %url, "Webhook URL updated");
    }

    // Return current state.
    let webhook_url = webhook::get_webhook_url(&state.db).await;
    Ok(Json(SettingsResponse { webhook_url }))
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
