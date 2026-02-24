use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;
use tracing::{error, info, warn};

use super::AppState;

// ── Cloudflare API base URL ──────────────────────────────────

const CF_API_BASE: &str = "https://api.cloudflare.com/client/v4";

// ── DTOs ─────────────────────────────────────────────────────

/// Tunnel status response returned to the frontend.
#[derive(Debug, Serialize)]
pub struct TunnelStatusResponse {
    pub configured: bool,
    pub tunnel_id: Option<String>,
    pub tunnel_name: Option<String>,
    pub status: Option<String>,
    pub connections: Vec<TunnelConnection>,
    pub routes: Vec<TunnelRoute>,
}

/// A single cloudflared connector connection.
#[derive(Debug, Serialize)]
pub struct TunnelConnection {
    pub id: String,
    pub origin_ip: Option<String>,
    pub opened_at: Option<String>,
    pub is_pending_reconnect: bool,
    pub colo_name: Option<String>,
}

/// An ingress route (hostname → service mapping).
#[derive(Debug, Serialize, Clone)]
pub struct TunnelRoute {
    pub hostname: Option<String>,
    pub service: String,
    pub path: Option<String>,
    pub latency_ms: Option<u64>,
}

/// Request body for adding a new tunnel route.
#[derive(Debug, Deserialize)]
pub struct AddRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Request body for removing a tunnel route.
#[derive(Debug, Deserialize)]
pub struct RemoveRouteRequest {
    pub hostname: String,
}

/// Generic write response.
#[derive(Debug, Serialize)]
pub struct TunnelWriteResponse {
    pub success: bool,
    pub message: String,
}

// ── Settings helpers ─────────────────────────────────────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

struct CfCredentials {
    api_token: String,
    account_id: String,
    tunnel_id: String,
}

async fn get_cf_credentials(state: &AppState) -> Option<CfCredentials> {
    let api_token = get_setting(state, "cloudflare_api_token").await?;
    let account_id = get_setting(state, "cloudflare_account_id").await?;
    let tunnel_id = get_setting(state, "cloudflare_tunnel_id").await?;
    Some(CfCredentials {
        api_token,
        account_id,
        tunnel_id,
    })
}

// ── Cloudflare API helpers ───────────────────────────────────

async fn cf_get(
    http: &reqwest::Client,
    creds: &CfCredentials,
    path: &str,
) -> Result<Value, String> {
    let url = format!(
        "{}/accounts/{}/cfd_tunnel/{}{}",
        CF_API_BASE, creds.account_id, creds.tunnel_id, path
    );

    let start = Instant::now();
    let resp = http
        .get(&url)
        .bearer_auth(&creds.api_token)
        .send()
        .await
        .map_err(|e| format!("Cloudflare API request failed: {e}"))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Cloudflare response: {e}"))?;
    let elapsed = start.elapsed();

    info!(
        path,
        http_status = %status,
        elapsed_ms = elapsed.as_millis() as u64,
        "Cloudflare API response"
    );

    if !status.is_success() {
        return Err(format!("Cloudflare API returned HTTP {status}: {body}"));
    }

    serde_json::from_str(&body).map_err(|e| format!("Failed to parse Cloudflare JSON: {e}"))
}

async fn cf_put(
    http: &reqwest::Client,
    creds: &CfCredentials,
    path: &str,
    body: &Value,
) -> Result<Value, String> {
    let url = format!(
        "{}/accounts/{}/cfd_tunnel/{}{}",
        CF_API_BASE, creds.account_id, creds.tunnel_id, path
    );

    let start = Instant::now();
    let resp = http
        .put(&url)
        .bearer_auth(&creds.api_token)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("Cloudflare API request failed: {e}"))?;

    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Cloudflare response: {e}"))?;
    let elapsed = start.elapsed();

    info!(
        path,
        http_status = %status,
        elapsed_ms = elapsed.as_millis() as u64,
        "Cloudflare API PUT response"
    );

    if !status.is_success() {
        return Err(format!(
            "Cloudflare API returned HTTP {status}: {body_text}"
        ));
    }

    serde_json::from_str(&body_text).map_err(|e| format!("Failed to parse Cloudflare JSON: {e}"))
}

// ── Parse helpers ────────────────────────────────────────────

fn parse_connections(val: &Value) -> Vec<TunnelConnection> {
    val.get("result")
        .and_then(|r| r.get("connections"))
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .map(|c| TunnelConnection {
                    id: c
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    origin_ip: c
                        .get("origin_ip")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    opened_at: c
                        .get("opened_at")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    is_pending_reconnect: c
                        .get("is_pending_reconnect")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    colo_name: c
                        .get("colo_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_ingress_routes(val: &Value) -> Vec<TunnelRoute> {
    val.get("result")
        .and_then(|r| r.get("config"))
        .and_then(|c| c.get("ingress"))
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .map(|entry| TunnelRoute {
                    hostname: entry
                        .get("hostname")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    service: entry
                        .get("service")
                        .and_then(|v| v.as_str())
                        .unwrap_or("http_status:404")
                        .to_string(),
                    path: entry
                        .get("path")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    latency_ms: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

// ── Handlers ─────────────────────────────────────────────────

/// GET /api/v1/cloudflare-tunnel/status — tunnel status + routes.
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<TunnelStatusResponse>, StatusCode> {
    let creds = match get_cf_credentials(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(TunnelStatusResponse {
                configured: false,
                tunnel_id: None,
                tunnel_name: None,
                status: None,
                connections: vec![],
                routes: vec![],
            }));
        }
    };

    let http = &state.cf_http;

    // Fetch tunnel details and configuration in parallel.
    let (tunnel_result, config_result) = tokio::join!(
        cf_get(http, &creds, ""),
        cf_get(http, &creds, "/configurations"),
    );

    // Parse tunnel details.
    let (tunnel_name, tunnel_status, connections) = match tunnel_result {
        Ok(ref val) => {
            let name = val
                .get("result")
                .and_then(|r| r.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let status = val
                .get("result")
                .and_then(|r| r.get("status"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let conns = parse_connections(val);
            (name, status, conns)
        }
        Err(ref e) => {
            warn!("Failed to fetch tunnel details: {e}");
            (None, Some("error".to_string()), vec![])
        }
    };

    // Parse ingress routes from configuration.
    let routes = match config_result {
        Ok(ref val) => parse_ingress_routes(val),
        Err(ref e) => {
            warn!("Failed to fetch tunnel configuration: {e}");
            vec![]
        }
    };

    Ok(Json(TunnelStatusResponse {
        configured: true,
        tunnel_id: Some(creds.tunnel_id),
        tunnel_name,
        status: tunnel_status,
        connections,
        routes,
    }))
}

/// POST /api/v1/cloudflare-tunnel/routes — add a new ingress route.
pub async fn add_route(
    State(state): State<AppState>,
    Json(body): Json<AddRouteRequest>,
) -> Result<Json<TunnelWriteResponse>, StatusCode> {
    let creds = get_cf_credentials(&state).await.ok_or_else(|| {
        error!("Cloudflare Tunnel not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let http = &state.cf_http;

    // Fetch current configuration.
    let config_val = cf_get(http, &creds, "/configurations").await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let mut ingress = config_val
        .get("result")
        .and_then(|r| r.get("config"))
        .and_then(|c| c.get("ingress"))
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();

    // Check for duplicate hostname.
    let already_exists = ingress.iter().any(|entry| {
        entry
            .get("hostname")
            .and_then(|v| v.as_str())
            .map(|h| h == body.hostname)
            .unwrap_or(false)
    });

    if already_exists {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("Route for hostname '{}' already exists", body.hostname),
        }));
    }

    // Build the new ingress entry.
    let mut new_entry = serde_json::json!({
        "hostname": body.hostname,
        "service": body.service,
    });
    if let Some(ref path) = body.path {
        new_entry["path"] = serde_json::json!(path);
    }

    // Insert before the catch-all rule (last element).
    let insert_pos = if ingress.is_empty() {
        0
    } else {
        ingress.len() - 1
    };
    ingress.insert(insert_pos, new_entry);

    // PUT the updated configuration.
    let updated_config = serde_json::json!({
        "config": {
            "ingress": ingress,
        }
    });

    cf_put(http, &creds, "/configurations", &updated_config)
        .await
        .map_err(|e| {
            error!("Failed to update tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    info!(hostname = %body.hostname, service = %body.service, "Added Cloudflare Tunnel route");

    Ok(Json(TunnelWriteResponse {
        success: true,
        message: format!("Route for '{}' added successfully", body.hostname),
    }))
}

/// POST /api/v1/cloudflare-tunnel/routes/remove — remove an ingress route.
pub async fn remove_route(
    State(state): State<AppState>,
    Json(body): Json<RemoveRouteRequest>,
) -> Result<Json<TunnelWriteResponse>, StatusCode> {
    let creds = get_cf_credentials(&state).await.ok_or_else(|| {
        error!("Cloudflare Tunnel not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let http = &state.cf_http;

    // Fetch current configuration.
    let config_val = cf_get(http, &creds, "/configurations").await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let mut ingress = config_val
        .get("result")
        .and_then(|r| r.get("config"))
        .and_then(|c| c.get("ingress"))
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();

    let original_len = ingress.len();

    // Remove all entries matching the hostname.
    ingress.retain(|entry| {
        entry
            .get("hostname")
            .and_then(|v| v.as_str())
            .map(|h| h != body.hostname)
            .unwrap_or(true)
    });

    if ingress.len() == original_len {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("No route found for hostname '{}'", body.hostname),
        }));
    }

    // PUT the updated configuration.
    let updated_config = serde_json::json!({
        "config": {
            "ingress": ingress,
        }
    });

    cf_put(http, &creds, "/configurations", &updated_config)
        .await
        .map_err(|e| {
            error!("Failed to update tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    info!(hostname = %body.hostname, "Removed Cloudflare Tunnel route");

    Ok(Json(TunnelWriteResponse {
        success: true,
        message: format!("Route for '{}' removed successfully", body.hostname),
    }))
}
