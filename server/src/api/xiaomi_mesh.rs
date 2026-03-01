use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;

/// Response for the Xiaomi Mesh test-connection endpoint.
#[derive(Debug, Serialize)]
pub struct XiaomiMeshTestConnectionResponse {
    pub success: bool,
    pub message: String,
    pub router_model: Option<String>,
    pub hardware: Option<String>,
    pub firmware: Option<String>,
    pub router_name: Option<String>,
}

/// Body for test-connection — allows testing before saving settings.
#[derive(Debug, Deserialize)]
pub struct TestConnectionRequest {
    pub ip: Option<String>,
}

/// Helper: read a setting from the DB.
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
/// to verify connectivity and retrieve basic router info.
pub async fn test_connection(
    State(state): State<AppState>,
    Json(body): Json<TestConnectionRequest>,
) -> Json<XiaomiMeshTestConnectionResponse> {
    // Use the IP from the request body if provided, otherwise fall back to saved setting.
    let ip = match body.ip.filter(|s| !s.is_empty()) {
        Some(ip) => ip,
        None => match get_setting(&state, "xiaomi_mesh_ip").await {
            Some(ip) => ip,
            None => {
                return Json(XiaomiMeshTestConnectionResponse {
                    success: false,
                    message: "No router IP configured. Enter an IP and save first.".to_string(),
                    router_model: None,
                    hardware: None,
                    firmware: None,
                    router_name: None,
                });
            }
        },
    };

    // Use proxy host if configured, otherwise connect directly to the router IP.
    let proxy_host = get_setting(&state, "xiaomi_mesh_proxy_host").await;
    let target = proxy_host.as_deref().unwrap_or(&ip);
    let url = format!("http://{target}/cgi-bin/luci/api/xqsystem/init_info");

    match state.xiaomi_mesh_http.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body_text = resp.text().await.unwrap_or_default();
            // Parse the JSON response to extract router info.
            match serde_json::from_str::<serde_json::Value>(&body_text) {
                Ok(json) => {
                    let router_model = json
                        .get("routerId")
                        .or_else(|| json.get("routername"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let hardware = json
                        .get("hardware")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let firmware = json
                        .get("romversion")
                        .or_else(|| json.get("rom"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let router_name = json
                        .get("displayName")
                        .or_else(|| json.get("routername"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    Json(XiaomiMeshTestConnectionResponse {
                        success: true,
                        message: format!("Connected to Xiaomi router at {ip}"),
                        router_model,
                        hardware,
                        firmware,
                        router_name,
                    })
                }
                Err(_) => Json(XiaomiMeshTestConnectionResponse {
                    success: false,
                    message: format!(
                        "Connected to {ip} but response is not valid Xiaomi router JSON."
                    ),
                    router_model: None,
                    hardware: None,
                    firmware: None,
                    router_name: None,
                }),
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            Json(XiaomiMeshTestConnectionResponse {
                success: false,
                message: format!("Router at {ip} responded with HTTP {status}: {body_text}"),
                router_model: None,
                hardware: None,
                firmware: None,
                router_name: None,
            })
        }
        Err(e) => {
            error!("Xiaomi Mesh test connection failed for {ip}: {e}");
            Json(XiaomiMeshTestConnectionResponse {
                success: false,
                message: format!("Failed to reach Xiaomi router at {ip}: {e}"),
                router_model: None,
                hardware: None,
                firmware: None,
                router_name: None,
            })
        }
    }
}
