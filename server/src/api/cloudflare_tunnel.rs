use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, warn};

use super::AppState;

// ─── DTOs ──────────────────────────────────────────────────

/// Overall tunnel status returned to the frontend.
#[derive(Debug, Serialize)]
pub struct CfTunnelOverview {
    pub configured: bool,
    pub id: String,
    pub name: String,
    /// "healthy", "degraded", "down", or "inactive"
    pub status: String,
    pub created_at: String,
    pub connections: Vec<CfTunnelConnection>,
    pub routes: Vec<CfTunnelRoute>,
}

/// A single cloudflared connector connection.
#[derive(Debug, Serialize)]
pub struct CfTunnelConnection {
    pub id: String,
    pub origin_ip: String,
    pub opened_at: String,
    pub is_pending_reconnect: bool,
    pub colo_name: String,
}

/// A hostname → service route from the tunnel ingress config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfTunnelRoute {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: String,
    /// Measured latency in milliseconds (HEAD request to hostname), null if not measured.
    #[serde(skip_deserializing)]
    pub latency_ms: Option<u64>,
}

/// Request to add a new tunnel route.
#[derive(Debug, Deserialize)]
pub struct AddRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: String,
}

/// Generic response for mutations.
#[derive(Debug, Serialize)]
pub struct CfTunnelMutationResponse {
    pub success: bool,
    pub message: String,
}

// ─── Helpers ────────────────────────────────────────────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

struct CfConfig {
    api_token: String,
    account_id: String,
    tunnel_id: String,
}

async fn cf_config(state: &AppState) -> Option<CfConfig> {
    let api_token = get_setting(state, "cloudflare_api_token").await?;
    let account_id = get_setting(state, "cloudflare_account_id").await?;
    let tunnel_id = get_setting(state, "cloudflare_tunnel_id").await?;
    Some(CfConfig {
        api_token,
        account_id,
        tunnel_id,
    })
}

fn cf_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("cloudflare HTTP client")
}

/// Make an authenticated GET to the Cloudflare API.
async fn cf_get(
    client: &reqwest::Client,
    cfg: &CfConfig,
    path: &str,
) -> Result<serde_json::Value, StatusCode> {
    let url = format!("https://api.cloudflare.com/client/v4{path}");
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", cfg.api_token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| {
            error!("Cloudflare API request failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        warn!("Cloudflare API error: HTTP {status} — {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    resp.json::<serde_json::Value>().await.map_err(|e| {
        error!("Failed to parse Cloudflare response: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// Make an authenticated PUT to the Cloudflare API.
async fn cf_put(
    client: &reqwest::Client,
    cfg: &CfConfig,
    path: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, StatusCode> {
    let url = format!("https://api.cloudflare.com/client/v4{path}");
    let resp = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", cfg.api_token))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| {
            error!("Cloudflare API request failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        warn!("Cloudflare API error: HTTP {status} — {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    resp.json::<serde_json::Value>().await.map_err(|e| {
        error!("Failed to parse Cloudflare response: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// Parse tunnel connections from the API response.
fn parse_connections(data: &serde_json::Value) -> Vec<CfTunnelConnection> {
    let conns = match data["result"]["connections"].as_array() {
        Some(arr) => arr,
        None => {
            // Try top-level result as array (connections endpoint)
            match data["result"].as_array() {
                Some(arr) => arr,
                None => return vec![],
            }
        }
    };

    conns
        .iter()
        .map(|c| CfTunnelConnection {
            id: c["id"].as_str().unwrap_or("").to_string(),
            origin_ip: c["origin_ip"].as_str().unwrap_or("").to_string(),
            opened_at: c["opened_at"].as_str().unwrap_or("").to_string(),
            is_pending_reconnect: c["is_pending_reconnect"].as_bool().unwrap_or(false),
            colo_name: c["colo_name"].as_str().unwrap_or("").to_string(),
        })
        .collect()
}

/// Parse ingress routes from the tunnel configuration response.
fn parse_routes(data: &serde_json::Value) -> Vec<CfTunnelRoute> {
    let ingress = match data["result"]["config"]["ingress"].as_array() {
        Some(arr) => arr,
        None => return vec![],
    };

    ingress
        .iter()
        .filter_map(|r| {
            let hostname = r["hostname"].as_str().unwrap_or("").to_string();
            let service = r["service"].as_str().unwrap_or("").to_string();
            let path = r["path"].as_str().unwrap_or("").to_string();
            // Skip the catch-all rule (empty hostname with http_status:404)
            if hostname.is_empty() {
                return None;
            }
            Some(CfTunnelRoute {
                hostname,
                service,
                path,
                latency_ms: None,
            })
        })
        .collect()
}

/// Measure latency to a hostname via HTTP HEAD request.
async fn measure_latency(client: &reqwest::Client, hostname: &str) -> Option<u64> {
    let url = format!("https://{hostname}");
    let start = std::time::Instant::now();
    match client
        .head(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(_) => Some(start.elapsed().as_millis() as u64),
        Err(_) => None,
    }
}

// ─── Handlers ──────────────────────────────────────────────

/// GET /api/v1/cf-tunnel/status — tunnel overview with status, connections, and routes.
pub async fn status(State(state): State<AppState>) -> Result<Json<CfTunnelOverview>, StatusCode> {
    let cfg = cf_config(&state).await.ok_or_else(|| {
        // Return a "not configured" response instead of an error
        StatusCode::OK
    });

    let cfg = match cfg {
        Ok(c) => c,
        Err(_) => {
            return Ok(Json(CfTunnelOverview {
                configured: false,
                id: String::new(),
                name: String::new(),
                status: "not_configured".to_string(),
                created_at: String::new(),
                connections: vec![],
                routes: vec![],
            }));
        }
    };

    let client = cf_client();
    let account_id = &cfg.account_id;
    let tunnel_id = &cfg.tunnel_id;

    // Fetch tunnel details and configuration in parallel.
    let tunnel_path = format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}");
    let config_path = format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations");
    let (tunnel_res, config_res) = tokio::join!(
        cf_get(&client, &cfg, &tunnel_path),
        cf_get(&client, &cfg, &config_path),
    );

    let tunnel_data = tunnel_res?;
    let config_data = config_res.unwrap_or_else(|_| serde_json::json!({}));

    let name = tunnel_data["result"]["name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let status_str = tunnel_data["result"]["status"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let created_at = tunnel_data["result"]["created_at"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let connections = parse_connections(&tunnel_data);
    let mut routes = parse_routes(&config_data);

    // Measure latency for each route in parallel using tokio::spawn.
    let latency_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut handles = Vec::new();
    for route in &routes {
        let hostname = route.hostname.clone();
        let client = latency_client.clone();
        handles.push(tokio::spawn(async move {
            measure_latency(&client, &hostname).await
        }));
    }
    for (i, handle) in handles.into_iter().enumerate() {
        if let Ok(latency) = handle.await {
            routes[i].latency_ms = latency;
        }
    }

    Ok(Json(CfTunnelOverview {
        configured: true,
        id: tunnel_id.to_string(),
        name,
        status: status_str,
        created_at,
        connections,
        routes,
    }))
}

/// GET /api/v1/cf-tunnel/routes — list ingress routes only.
pub async fn list_routes(
    State(state): State<AppState>,
) -> Result<Json<Vec<CfTunnelRoute>>, StatusCode> {
    let cfg = cf_config(&state).await.ok_or(StatusCode::BAD_REQUEST)?;
    let client = cf_client();
    let account_id = &cfg.account_id;
    let tunnel_id = &cfg.tunnel_id;

    let config_data = cf_get(
        &client,
        &cfg,
        &format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"),
    )
    .await?;

    let routes = parse_routes(&config_data);
    Ok(Json(routes))
}

/// POST /api/v1/cf-tunnel/routes — add a new ingress route.
pub async fn add_route(
    State(state): State<AppState>,
    Json(body): Json<AddRouteRequest>,
) -> Result<Json<CfTunnelMutationResponse>, StatusCode> {
    let cfg = cf_config(&state).await.ok_or(StatusCode::BAD_REQUEST)?;
    let client = cf_client();
    let account_id = &cfg.account_id;
    let tunnel_id = &cfg.tunnel_id;

    // Fetch current config.
    let config_data = cf_get(
        &client,
        &cfg,
        &format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"),
    )
    .await?;

    let mut ingress = config_data["result"]["config"]["ingress"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    // Check for duplicate hostname.
    for rule in &ingress {
        if rule["hostname"].as_str() == Some(&body.hostname) {
            return Ok(Json(CfTunnelMutationResponse {
                success: false,
                message: format!("Route for hostname '{}' already exists", body.hostname),
            }));
        }
    }

    // Build new ingress rule.
    let mut new_rule = serde_json::json!({
        "hostname": body.hostname,
        "service": body.service,
    });
    if !body.path.is_empty() {
        new_rule["path"] = serde_json::Value::String(body.path);
    }

    // Insert before the catch-all rule (last entry).
    let insert_pos = if ingress.is_empty() {
        0
    } else {
        ingress.len() - 1
    };
    ingress.insert(insert_pos, new_rule);

    // Build the full config object, preserving existing non-ingress settings.
    let mut config = config_data["result"]["config"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    config.insert("ingress".to_string(), serde_json::Value::Array(ingress));

    let put_body = serde_json::json!({ "config": config });

    cf_put(
        &client,
        &cfg,
        &format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"),
        &put_body,
    )
    .await?;

    Ok(Json(CfTunnelMutationResponse {
        success: true,
        message: format!("Route for '{}' added successfully", body.hostname),
    }))
}

/// DELETE /api/v1/cf-tunnel/routes/:hostname — remove an ingress route by hostname.
pub async fn delete_route(
    State(state): State<AppState>,
    Path(hostname): Path<String>,
) -> Result<Json<CfTunnelMutationResponse>, StatusCode> {
    let cfg = cf_config(&state).await.ok_or(StatusCode::BAD_REQUEST)?;
    let client = cf_client();
    let account_id = &cfg.account_id;
    let tunnel_id = &cfg.tunnel_id;

    // Fetch current config.
    let config_data = cf_get(
        &client,
        &cfg,
        &format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"),
    )
    .await?;

    let mut ingress = config_data["result"]["config"]["ingress"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let initial_len = ingress.len();
    ingress.retain(|rule| rule["hostname"].as_str() != Some(&hostname));

    if ingress.len() == initial_len {
        return Ok(Json(CfTunnelMutationResponse {
            success: false,
            message: format!("Route for hostname '{}' not found", hostname),
        }));
    }

    // Preserve existing non-ingress settings.
    let mut config = config_data["result"]["config"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    config.insert("ingress".to_string(), serde_json::Value::Array(ingress));

    let put_body = serde_json::json!({ "config": config });

    cf_put(
        &client,
        &cfg,
        &format!("/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations"),
        &put_body,
    )
    .await?;

    Ok(Json(CfTunnelMutationResponse {
        success: true,
        message: format!("Route for '{}' removed successfully", hostname),
    }))
}
