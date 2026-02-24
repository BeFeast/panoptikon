use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use super::AppState;

// ─── Cloudflare API base URL ────────────────────────────────
const CF_API_BASE: &str = "https://api.cloudflare.com/client/v4";

// ─── DTOs ───────────────────────────────────────────────────

/// Cloudflare Tunnel status returned to the frontend.
#[derive(Debug, Serialize)]
pub struct TunnelStatus {
    pub configured: bool,
    pub connected: bool,
    pub tunnel_id: Option<String>,
    pub tunnel_name: Option<String>,
    pub created_at: Option<String>,
    pub connections: Vec<TunnelConnection>,
}

/// An active Cloudflare Tunnel connection (connector).
#[derive(Debug, Serialize)]
pub struct TunnelConnection {
    pub colo_name: Option<String>,
    pub is_pending_reconnect: bool,
    pub origin_ip: Option<String>,
    pub opened_at: Option<String>,
}

/// A tunnel route (hostname → service mapping).
#[derive(Debug, Serialize)]
pub struct TunnelRoute {
    pub hostname: String,
    pub service: String,
    pub path: Option<String>,
}

/// Response for the routes endpoint.
#[derive(Debug, Serialize)]
pub struct TunnelRoutesResponse {
    pub routes: Vec<TunnelRoute>,
}

/// Request body for adding a new tunnel route.
#[derive(Debug, Deserialize)]
pub struct AddRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Generic write response.
#[derive(Debug, Serialize)]
pub struct TunnelWriteResponse {
    pub success: bool,
    pub message: String,
}

// ─── Helpers ────────────────────────────────────────────────

/// Read a setting from the database.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Cloudflare config required for API calls.
struct CfConfig {
    api_token: String,
    account_id: String,
    tunnel_id: String,
}

/// Load Cloudflare configuration from settings.
async fn load_cf_config(state: &AppState) -> Option<CfConfig> {
    let api_token = get_setting(state, "cloudflare_api_token").await?;
    let account_id = get_setting(state, "cloudflare_account_id").await?;
    let tunnel_id = get_setting(state, "cloudflare_tunnel_id").await?;
    Some(CfConfig {
        api_token,
        account_id,
        tunnel_id,
    })
}

/// Build a reqwest client for Cloudflare API calls.
fn cf_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("cloudflare HTTP client")
}

// ─── Handlers ───────────────────────────────────────────────

/// GET /api/v1/cloudflare-tunnel/status
///
/// Returns tunnel status including whether it's connected and active connections.
pub async fn status(State(state): State<AppState>) -> Json<TunnelStatus> {
    let config = match load_cf_config(&state).await {
        Some(c) => c,
        None => {
            return Json(TunnelStatus {
                configured: false,
                connected: false,
                tunnel_id: None,
                tunnel_name: None,
                created_at: None,
                connections: vec![],
            });
        }
    };

    let client = cf_http_client();

    // Fetch tunnel details.
    let tunnel_url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}",
        config.account_id, config.tunnel_id
    );

    let tunnel_resp = client
        .get(&tunnel_url)
        .bearer_auth(&config.api_token)
        .send()
        .await;

    let (tunnel_name, created_at, connections) = match tunnel_resp {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let result = &body["result"];
            let name = result["name"].as_str().map(|s| s.to_string());
            let created = result["created_at"].as_str().map(|s| s.to_string());

            // Parse connections from the tunnel response.
            let conns = result["connections"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .map(|c| TunnelConnection {
                            colo_name: c["colo_name"].as_str().map(|s| s.to_string()),
                            is_pending_reconnect: c["is_pending_reconnect"]
                                .as_bool()
                                .unwrap_or(false),
                            origin_ip: c["origin_ip"].as_str().map(|s| s.to_string()),
                            opened_at: c["opened_at"].as_str().map(|s| s.to_string()),
                        })
                        .collect()
                })
                .unwrap_or_default();

            (name, created, conns)
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!("Cloudflare tunnel API returned HTTP {status}: {body}");
            (None, None, vec![])
        }
        Err(e) => {
            warn!("Failed to reach Cloudflare API: {e}");
            (None, None, vec![])
        }
    };

    let connected = !connections.is_empty();

    Json(TunnelStatus {
        configured: true,
        connected,
        tunnel_id: Some(config.tunnel_id),
        tunnel_name,
        created_at,
        connections,
    })
}

/// GET /api/v1/cloudflare-tunnel/routes
///
/// Returns the hostname → service mapping from the tunnel configuration.
pub async fn list_routes(
    State(state): State<AppState>,
) -> Result<Json<TunnelRoutesResponse>, StatusCode> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        StatusCode::BAD_REQUEST
    })?;

    let routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel routes: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(TunnelRoutesResponse { routes }))
}

/// POST /api/v1/cloudflare-tunnel/routes
///
/// Add a new hostname route to the tunnel configuration.
pub async fn add_route(
    State(state): State<AppState>,
    Json(body): Json<AddRouteRequest>,
) -> Result<(StatusCode, Json<TunnelWriteResponse>), StatusCode> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        StatusCode::BAD_REQUEST
    })?;

    // Fetch current configuration.
    let mut routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Check for duplicate hostname.
    if routes
        .iter()
        .any(|r| r.hostname.eq_ignore_ascii_case(&body.hostname))
    {
        return Ok((
            StatusCode::CONFLICT,
            Json(TunnelWriteResponse {
                success: false,
                message: format!("Route for hostname '{}' already exists", body.hostname),
            }),
        ));
    }

    // Add new route.
    routes.push(TunnelRoute {
        hostname: body.hostname.clone(),
        service: body.service.clone(),
        path: body.path.clone(),
    });

    // Write back to Cloudflare.
    write_ingress_routes(&config, &routes).await.map_err(|e| {
        error!("Failed to update tunnel config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(
        hostname = %body.hostname,
        service = %body.service,
        "Added Cloudflare Tunnel route"
    );

    Ok((
        StatusCode::CREATED,
        Json(TunnelWriteResponse {
            success: true,
            message: format!("Route for '{}' added successfully", body.hostname),
        }),
    ))
}

/// DELETE /api/v1/cloudflare-tunnel/routes/:hostname
///
/// Remove a hostname route from the tunnel configuration.
pub async fn delete_route(
    State(state): State<AppState>,
    Path(hostname): Path<String>,
) -> Result<Json<TunnelWriteResponse>, StatusCode> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        StatusCode::BAD_REQUEST
    })?;

    // Fetch current configuration.
    let mut routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let original_len = routes.len();
    routes.retain(|r| !r.hostname.eq_ignore_ascii_case(&hostname));

    if routes.len() == original_len {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("No route found for hostname '{hostname}'"),
        }));
    }

    // Write back to Cloudflare.
    write_ingress_routes(&config, &routes).await.map_err(|e| {
        error!("Failed to update tunnel config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(hostname = %hostname, "Removed Cloudflare Tunnel route");

    Ok(Json(TunnelWriteResponse {
        success: true,
        message: format!("Route for '{hostname}' removed successfully"),
    }))
}

// ─── Cloudflare API helpers ─────────────────────────────────

/// Fetch the ingress routes from the Cloudflare Tunnel configuration.
async fn fetch_ingress_routes(config: &CfConfig) -> anyhow::Result<Vec<TunnelRoute>> {
    let client = cf_http_client();
    let url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}/configurations",
        config.account_id, config.tunnel_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(&config.api_token)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Cloudflare API returned HTTP {status}: {body}");
    }

    let body: serde_json::Value = resp.json().await?;
    let ingress = body["result"]["config"]["ingress"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let routes: Vec<TunnelRoute> = ingress
        .iter()
        .filter_map(|entry| {
            // Skip the catch-all rule (no hostname).
            let hostname = entry["hostname"].as_str()?;
            let service = entry["service"].as_str().unwrap_or("").to_string();
            let path = entry["path"].as_str().map(|s| s.to_string());
            Some(TunnelRoute {
                hostname: hostname.to_string(),
                service,
                path,
            })
        })
        .collect();

    Ok(routes)
}

/// Write ingress routes back to the Cloudflare Tunnel configuration.
///
/// This rebuilds the full ingress array (user routes + catch-all) and PUTs
/// it to the Cloudflare API.
async fn write_ingress_routes(config: &CfConfig, routes: &[TunnelRoute]) -> anyhow::Result<()> {
    let client = cf_http_client();
    let url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}/configurations",
        config.account_id, config.tunnel_id
    );

    // Build ingress array: user routes + catch-all.
    let mut ingress: Vec<serde_json::Value> = routes
        .iter()
        .map(|r| {
            let mut entry = serde_json::json!({
                "hostname": r.hostname,
                "service": r.service,
            });
            if let Some(ref path) = r.path {
                entry["path"] = serde_json::json!(path);
            }
            entry
        })
        .collect();

    // The catch-all rule must always be last.
    ingress.push(serde_json::json!({
        "service": "http_status:404"
    }));

    let body = serde_json::json!({
        "config": {
            "ingress": ingress
        }
    });

    let resp = client
        .put(&url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("Cloudflare API returned HTTP {status}: {text}");
    }

    Ok(())
}
