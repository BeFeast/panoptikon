use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;
use crate::npm::client::{NpmClient, NpmConnectionStatus, NpmProxyHostPayload};

/// GET /api/v1/npm/status — check NPM connection health.
///
/// Returns whether NPM is configured and reachable, plus the number
/// of proxy hosts as a quick health signal.
pub async fn status(State(state): State<AppState>) -> Json<NpmConnectionStatus> {
    let client = match get_npm_client(&state).await {
        Some(c) => c,
        None => {
            return Json(NpmConnectionStatus {
                configured: false,
                reachable: false,
                host_count: None,
            });
        }
    };

    match client.test_connection().await {
        Ok(status) => Json(status),
        Err(e) => {
            error!("NPM connection test failed: {e}");
            Json(NpmConnectionStatus {
                configured: true,
                reachable: false,
                host_count: None,
            })
        }
    }
}

/// Response for the proxy hosts list endpoint.
#[derive(Debug, Serialize)]
pub struct ProxyHostSummary {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub ssl_forced: bool,
    pub certificate_id: Option<serde_json::Value>,
    pub hsts_enabled: bool,
    pub http2_support: bool,
    pub block_exploits: bool,
    pub allow_websocket_upgrade: bool,
    pub advanced_config: Option<String>,
}

/// GET /api/v1/npm/proxy-hosts — list all proxy hosts from NPM.
pub async fn proxy_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProxyHostSummary>>, StatusCode> {
    let client = get_npm_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let hosts = client.list_proxy_hosts().await.map_err(|e| {
        error!("NPM list proxy hosts failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let summaries: Vec<ProxyHostSummary> = hosts
        .into_iter()
        .map(|h| ProxyHostSummary {
            id: h.id,
            domain_names: h.domain_names,
            forward_host: h.forward_host,
            forward_port: h.forward_port,
            forward_scheme: h.forward_scheme,
            enabled: h.enabled,
            ssl_forced: h.ssl_forced,
            certificate_id: h.certificate_id,
            hsts_enabled: h.hsts_enabled,
            http2_support: h.http2_support,
            block_exploits: h.block_exploits,
            allow_websocket_upgrade: h.allow_websocket_upgrade,
            advanced_config: h.advanced_config,
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating / updating a proxy host.
#[derive(Debug, Deserialize)]
pub struct ProxyHostRequest {
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,
    #[serde(default)]
    pub certificate_id: serde_json::Value,
    #[serde(default)]
    pub ssl_forced: bool,
    #[serde(default)]
    pub hsts_enabled: bool,
    #[serde(default)]
    pub http2_support: bool,
    #[serde(default)]
    pub block_exploits: bool,
    #[serde(default)]
    pub allow_websocket_upgrade: bool,
    #[serde(default)]
    pub advanced_config: String,
}

fn default_scheme() -> String {
    "http".to_string()
}

impl From<ProxyHostRequest> for NpmProxyHostPayload {
    fn from(r: ProxyHostRequest) -> Self {
        Self {
            domain_names: r.domain_names,
            forward_host: r.forward_host,
            forward_port: r.forward_port,
            forward_scheme: r.forward_scheme,
            certificate_id: r.certificate_id,
            ssl_forced: r.ssl_forced,
            hsts_enabled: r.hsts_enabled,
            http2_support: r.http2_support,
            block_exploits: r.block_exploits,
            allow_websocket_upgrade: r.allow_websocket_upgrade,
            advanced_config: r.advanced_config,
        }
    }
}

/// JSON error body returned on NPM API failures.
#[derive(Serialize)]
pub struct ErrorBody {
    error: String,
}

fn error_response(status: StatusCode, msg: String) -> (StatusCode, Json<ErrorBody>) {
    (status, Json(ErrorBody { error: msg }))
}

/// POST /api/v1/npm/proxy-hosts — create a new proxy host.
pub async fn create_proxy_host(
    State(state): State<AppState>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<ProxyHostSummary>, (StatusCode, Json<ErrorBody>)> {
    let client = get_npm_client(&state)
        .await
        .ok_or_else(|| error_response(StatusCode::SERVICE_UNAVAILABLE, "NPM not configured".into()))?;

    let payload: NpmProxyHostPayload = body.into();
    let host = client.create_proxy_host(&payload).await.map_err(|e| {
        error!("NPM create proxy host failed: {e}");
        error_response(StatusCode::BAD_GATEWAY, e.to_string())
    })?;

    Ok(Json(ProxyHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_host: host.forward_host,
        forward_port: host.forward_port,
        forward_scheme: host.forward_scheme,
        enabled: host.enabled,
        ssl_forced: host.ssl_forced,
        certificate_id: host.certificate_id,
        hsts_enabled: host.hsts_enabled,
        http2_support: host.http2_support,
        block_exploits: host.block_exploits,
        allow_websocket_upgrade: host.allow_websocket_upgrade,
        advanced_config: host.advanced_config,
    }))
}

/// PUT /api/v1/npm/proxy-hosts/:id — update an existing proxy host.
pub async fn update_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<ProxyHostSummary>, (StatusCode, Json<ErrorBody>)> {
    let client = get_npm_client(&state)
        .await
        .ok_or_else(|| error_response(StatusCode::SERVICE_UNAVAILABLE, "NPM not configured".into()))?;

    let payload: NpmProxyHostPayload = body.into();
    let host = client.update_proxy_host(id, &payload).await.map_err(|e| {
        error!("NPM update proxy host {id} failed: {e}");
        error_response(StatusCode::BAD_GATEWAY, e.to_string())
    })?;

    Ok(Json(ProxyHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_host: host.forward_host,
        forward_port: host.forward_port,
        forward_scheme: host.forward_scheme,
        enabled: host.enabled,
        ssl_forced: host.ssl_forced,
        certificate_id: host.certificate_id,
        hsts_enabled: host.hsts_enabled,
        http2_support: host.http2_support,
        block_exploits: host.block_exploits,
        allow_websocket_upgrade: host.allow_websocket_upgrade,
        advanced_config: host.advanced_config,
    }))
}

/// DELETE /api/v1/npm/proxy-hosts/:id — delete a proxy host.
pub async fn delete_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let client = get_npm_client(&state)
        .await
        .ok_or_else(|| error_response(StatusCode::SERVICE_UNAVAILABLE, "NPM not configured".into()))?;

    client.delete_proxy_host(id).await.map_err(|e| {
        error!("NPM delete proxy host {id} failed: {e}");
        error_response(StatusCode::BAD_GATEWAY, e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Request body for enable/disable toggle.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// POST /api/v1/npm/proxy-hosts/:id/toggle — enable or disable a proxy host.
pub async fn toggle_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ToggleRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let client = get_npm_client(&state)
        .await
        .ok_or_else(|| error_response(StatusCode::SERVICE_UNAVAILABLE, "NPM not configured".into()))?;

    if body.enabled {
        client.enable_proxy_host(id).await
    } else {
        client.disable_proxy_host(id).await
    }
    .map_err(|e| {
        error!("NPM toggle proxy host {id} failed: {e}");
        error_response(StatusCode::BAD_GATEWAY, e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Build an [`NpmClient`] from current settings, or `None` if not configured.
async fn get_npm_client(state: &AppState) -> Option<NpmClient> {
    let url = get_setting(state, "npm_url").await?;
    let email = get_setting(state, "npm_email").await?;
    let password = get_setting(state, "npm_password").await?;

    Some(NpmClient::new(
        &url,
        &email,
        &password,
        state.npm_http.clone(),
    ))
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
