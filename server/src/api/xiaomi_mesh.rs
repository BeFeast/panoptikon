use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::warn;

use super::AppState;

/// Response from the Xiaomi Mesh test-connection endpoint.
#[derive(Debug, Serialize)]
pub struct XiaomiTestConnectionResponse {
    pub success: bool,
    pub message: String,
    pub model: Option<String>,
    pub hardware: Option<String>,
    pub firmware: Option<String>,
    pub router_name: Option<String>,
}

/// Optional request body — allows testing with an IP before saving.
#[derive(Debug, Deserialize)]
pub struct XiaomiTestConnectionRequest {
    pub ip: Option<String>,
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

/// POST /api/v1/xiaomi-mesh/test-connection
///
/// Calls the Xiaomi router's `api/xqsystem/init_info` endpoint (no auth required)
/// and returns router metadata on success.
pub async fn test_connection(
    State(state): State<AppState>,
    Json(body): Json<XiaomiTestConnectionRequest>,
) -> Result<Json<XiaomiTestConnectionResponse>, StatusCode> {
    // Use the IP from the request body, or fall back to stored setting.
    let ip = body.ip.filter(|s| !s.is_empty()).or_else(|| {
        // Block on the stored setting (we're already in an async context).
        None
    });

    let ip = match ip {
        Some(ip) => ip,
        None => match get_setting(&state, "xiaomi_mesh_ip").await {
            Some(ip) => ip,
            None => {
                return Ok(Json(XiaomiTestConnectionResponse {
                    success: false,
                    message: "No router IP configured.".into(),
                    model: None,
                    hardware: None,
                    firmware: None,
                    router_name: None,
                }));
            }
        },
    };

    let url = format!("http://{}/api/xqsystem/init_info", ip);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    match client.get(&url).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return Ok(Json(XiaomiTestConnectionResponse {
                    success: false,
                    message: format!("HTTP {} from {}", resp.status(), ip),
                    model: None,
                    hardware: None,
                    firmware: None,
                    router_name: None,
                }));
            }

            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    let model = json.get("model").and_then(|v| v.as_str()).map(String::from);
                    let hardware = json
                        .get("hardware")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let firmware = json
                        .get("romversion")
                        .or_else(|| json.get("rom"))
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let router_name = json
                        .get("routername")
                        .or_else(|| json.get("router_name"))
                        .and_then(|v| v.as_str())
                        .map(String::from);

                    Ok(Json(XiaomiTestConnectionResponse {
                        success: true,
                        message: "Connection successful".into(),
                        model,
                        hardware,
                        firmware,
                        router_name,
                    }))
                }
                Err(e) => {
                    warn!("Xiaomi Mesh test: failed to parse JSON from {ip}: {e}");
                    Ok(Json(XiaomiTestConnectionResponse {
                        success: false,
                        message: format!("Invalid JSON response from {ip}"),
                        model: None,
                        hardware: None,
                        firmware: None,
                        router_name: None,
                    }))
                }
            }
        }
        Err(e) => {
            warn!("Xiaomi Mesh test: connection failed to {ip}: {e}");
            Ok(Json(XiaomiTestConnectionResponse {
                success: false,
                message: format!("Connection failed: {e}"),
                model: None,
                hardware: None,
                firmware: None,
                router_name: None,
            }))
        }
    }
}
