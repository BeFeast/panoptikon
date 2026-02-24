use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use super::AppState;

const CF_API_BASE: &str = "https://api.cloudflare.com/client/v4";

// ─── DTOs ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CloudflareTunnelStatus {
    pub configured: bool,
    pub tunnel_id: Option<String>,
    pub tunnel_name: Option<String>,
    pub status: Option<String>,
    pub connectors: Vec<TunnelConnector>,
    pub routes: Vec<TunnelRoute>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TunnelConnector {
    pub id: String,
    pub run_at: Option<String>,
    pub is_pending_reconnect: bool,
    pub origin_ip: Option<String>,
    pub opened_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TunnelRoute {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
    pub latency_ms: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct AddRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
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

/// Measure latency by sending a HEAD request to a hostname.
async fn measure_route_latency(http: &reqwest::Client, hostname: &str) -> Option<f64> {
    let url = format!("https://{hostname}");
    let start = std::time::Instant::now();
    match http
        .head(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(_) => {
            let elapsed = start.elapsed();
            Some(elapsed.as_secs_f64() * 1000.0)
        }
        Err(_) => None,
    }
}

// ─── Handlers ──────────────────────────────────────────────

/// GET /api/v1/cloudflare-tunnel/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<CloudflareTunnelStatus>, StatusCode> {
    let cfg = match load_cf_config(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(CloudflareTunnelStatus {
                configured: false,
                tunnel_id: None,
                tunnel_name: None,
                status: None,
                connectors: vec![],
                routes: vec![],
            }));
        }
    };

    let tunnel_url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}",
        cfg.account_id, cfg.tunnel_id
    );

    // Fetch tunnel details
    let tunnel_resp = state
        .cloudflare_http
        .get(&tunnel_url)
        .bearer_auth(&cfg.api_token)
        .send()
        .await
        .map_err(|e| {
            error!("Cloudflare tunnel request failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !tunnel_resp.status().is_success() {
        let status_code = tunnel_resp.status();
        let body = tunnel_resp.text().await.unwrap_or_default();
        warn!("Cloudflare API error {status_code}: {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let tunnel_json: serde_json::Value = tunnel_resp.json().await.map_err(|e| {
        error!("Failed to parse Cloudflare tunnel response: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result = &tunnel_json["result"];
    let tunnel_name = result["name"].as_str().map(String::from);
    let tunnel_status = result["status"].as_str().map(String::from);

    // Fetch active connections
    let connections_url = format!("{tunnel_url}/connections");
    let connectors = match state
        .cloudflare_http
        .get(&connections_url)
        .bearer_auth(&cfg.api_token)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            parse_connectors(&json)
        }
        _ => vec![],
    };

    // Fetch tunnel configuration (ingress rules)
    let config_url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}/configurations",
        cfg.account_id, cfg.tunnel_id
    );
    let mut routes = match state
        .cloudflare_http
        .get(&config_url)
        .bearer_auth(&cfg.api_token)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let json: serde_json::Value = resp.json().await.unwrap_or_default();
            parse_ingress_routes(&json)
        }
        _ => vec![],
    };

    // Measure latency for each route (in parallel)
    let mut handles = Vec::with_capacity(routes.len());
    for route in &routes {
        let hostname = route.hostname.clone();
        let http = state.cloudflare_http.clone();
        handles.push(tokio::spawn(async move {
            measure_route_latency(&http, &hostname).await
        }));
    }
    for (route, handle) in routes.iter_mut().zip(handles) {
        route.latency_ms = handle.await.ok().flatten();
    }

    Ok(Json(CloudflareTunnelStatus {
        configured: true,
        tunnel_id: Some(cfg.tunnel_id),
        tunnel_name,
        status: tunnel_status,
        connectors,
        routes,
    }))
}

/// POST /api/v1/cloudflare-tunnel/routes
pub async fn add_route(
    State(state): State<AppState>,
    Json(body): Json<AddRouteRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), StatusCode> {
    let cfg = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    // Get current configuration
    let config_url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}/configurations",
        cfg.account_id, cfg.tunnel_id
    );

    let resp = state
        .cloudflare_http
        .get(&config_url)
        .bearer_auth(&cfg.api_token)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        warn!("Cloudflare config fetch failed: {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let mut config_json: serde_json::Value = resp.json().await.map_err(|e| {
        error!("Failed to parse tunnel config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Add the new ingress rule (before the catch-all)
    let new_rule = serde_json::json!({
        "hostname": body.hostname,
        "service": body.service,
        "path": body.path.unwrap_or_default(),
    });

    let ingress = config_json["result"]["config"]["ingress"]
        .as_array_mut()
        .ok_or_else(|| {
            error!("No ingress array in tunnel config");
            StatusCode::BAD_GATEWAY
        })?;

    // Insert before the last entry (catch-all)
    let insert_pos = if !ingress.is_empty() {
        ingress.len() - 1
    } else {
        0
    };
    ingress.insert(insert_pos, new_rule);

    // Build the PUT body
    let put_body = serde_json::json!({
        "config": config_json["result"]["config"]
    });

    let put_resp = state
        .cloudflare_http
        .put(&config_url)
        .bearer_auth(&cfg.api_token)
        .json(&put_body)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to update tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !put_resp.status().is_success() {
        let body = put_resp.text().await.unwrap_or_default();
        warn!("Cloudflare config update failed: {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    info!(hostname = %body.hostname, service = %body.service, "Added Cloudflare tunnel route");

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "success": true, "message": "Route added" })),
    ))
}

/// DELETE /api/v1/cloudflare-tunnel/routes
pub async fn delete_route(
    State(state): State<AppState>,
    Json(body): Json<DeleteRouteRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let cfg = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let config_url = format!(
        "{CF_API_BASE}/accounts/{}/cfd_tunnel/{}/configurations",
        cfg.account_id, cfg.tunnel_id
    );

    let resp = state
        .cloudflare_http
        .get(&config_url)
        .bearer_auth(&cfg.api_token)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to fetch tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !resp.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }

    let mut config_json: serde_json::Value = resp.json().await.map_err(|e| {
        error!("Failed to parse tunnel config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Remove the matching ingress rule
    let ingress = config_json["result"]["config"]["ingress"]
        .as_array_mut()
        .ok_or_else(|| {
            error!("No ingress array in tunnel config");
            StatusCode::BAD_GATEWAY
        })?;

    let original_len = ingress.len();
    ingress.retain(|entry| entry["hostname"].as_str().unwrap_or("") != body.hostname);

    if ingress.len() == original_len {
        return Err(StatusCode::NOT_FOUND);
    }

    // Ensure there's still a catch-all
    if ingress.is_empty()
        || ingress
            .last()
            .and_then(|e| e["hostname"].as_str())
            .is_some()
    {
        ingress.push(serde_json::json!({ "service": "http_status:404" }));
    }

    let put_body = serde_json::json!({
        "config": config_json["result"]["config"]
    });

    let put_resp = state
        .cloudflare_http
        .put(&config_url)
        .bearer_auth(&cfg.api_token)
        .json(&put_body)
        .send()
        .await
        .map_err(|e| {
            error!("Failed to update tunnel config: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    if !put_resp.status().is_success() {
        let body = put_resp.text().await.unwrap_or_default();
        warn!("Cloudflare config update failed: {body}");
        return Err(StatusCode::BAD_GATEWAY);
    }

    info!(hostname = %body.hostname, "Removed Cloudflare tunnel route");

    Ok(Json(
        serde_json::json!({ "success": true, "message": "Route removed" }),
    ))
}

#[derive(Debug, Deserialize)]
pub struct DeleteRouteRequest {
    pub hostname: String,
}

// ─── Parsers ───────────────────────────────────────────────

fn parse_connectors(json: &serde_json::Value) -> Vec<TunnelConnector> {
    let Some(results) = json["result"].as_array() else {
        return vec![];
    };

    results
        .iter()
        .flat_map(|conn| {
            // Each result can have multiple connections (connectors)
            let conns = conn["connections"].as_array();
            let id = conn["id"].as_str().unwrap_or("unknown").to_string();
            let run_at = conn["run_at"].as_str().map(String::from);

            match conns {
                Some(connections) => connections
                    .iter()
                    .map(|c| TunnelConnector {
                        id: c["id"].as_str().unwrap_or(&id).to_string(),
                        run_at: run_at.clone(),
                        is_pending_reconnect: c["is_pending_reconnect"].as_bool().unwrap_or(false),
                        origin_ip: c["origin_ip"].as_str().map(String::from),
                        opened_at: c["opened_at"].as_str().map(String::from),
                    })
                    .collect::<Vec<_>>(),
                None => vec![TunnelConnector {
                    id,
                    run_at,
                    is_pending_reconnect: false,
                    origin_ip: None,
                    opened_at: None,
                }],
            }
        })
        .collect()
}

fn parse_ingress_routes(json: &serde_json::Value) -> Vec<TunnelRoute> {
    let Some(ingress) = json["result"]["config"]["ingress"].as_array() else {
        return vec![];
    };

    ingress
        .iter()
        .filter_map(|entry| {
            // Skip catch-all entries (no hostname)
            let hostname = entry["hostname"].as_str()?;
            let service = entry["service"].as_str().unwrap_or("").to_string();
            Some(TunnelRoute {
                hostname: hostname.to_string(),
                service,
                path: entry["path"]
                    .as_str()
                    .filter(|p| !p.is_empty())
                    .map(String::from),
                latency_ms: None,
            })
        })
        .collect()
}
