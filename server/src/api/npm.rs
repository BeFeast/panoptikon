use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;
use crate::npm::client::{NpmClient, NpmConnectionStatus, NpmRedirectionHostPayload};

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
        })
        .collect();

    Ok(Json(summaries))
}

// ─── Redirection Hosts ──────────────────────────────────

/// Summary returned by the redirection hosts list endpoint.
#[derive(Debug, Serialize)]
pub struct RedirectionHostSummary {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    pub preserve_path: bool,
    pub ssl_forced: bool,
    pub block_exploits: bool,
    pub enabled: bool,
}

/// GET /api/v1/npm/redirection-hosts — list all redirection hosts from NPM.
pub async fn redirection_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<RedirectionHostSummary>>, StatusCode> {
    let client = get_npm_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let hosts = client.list_redirection_hosts().await.map_err(|e| {
        error!("NPM list redirection hosts failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let summaries: Vec<RedirectionHostSummary> = hosts
        .into_iter()
        .map(|h| RedirectionHostSummary {
            id: h.id,
            domain_names: h.domain_names,
            forward_http_code: h.forward_http_code,
            forward_scheme: h.forward_scheme,
            forward_domain_name: h.forward_domain_name,
            preserve_path: h.preserve_path,
            ssl_forced: h.ssl_forced,
            block_exploits: h.block_exploits,
            enabled: h.enabled,
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating / updating a redirection host.
#[derive(Debug, Deserialize)]
pub struct RedirectionHostRequest {
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    #[serde(default)]
    pub preserve_path: bool,
    #[serde(default)]
    pub ssl_forced: bool,
    #[serde(default)]
    pub block_exploits: bool,
    pub enabled: Option<bool>,
}

/// JSON error body to match the project's pattern.
#[derive(Serialize)]
pub struct NpmError {
    pub error: String,
}

/// POST /api/v1/npm/redirection-hosts — create a new redirection host.
pub async fn create_redirection_host(
    State(state): State<AppState>,
    Json(body): Json<RedirectionHostRequest>,
) -> Result<Json<RedirectionHostSummary>, (StatusCode, Json<NpmError>)> {
    let client = get_npm_client(&state).await.ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        Json(NpmError {
            error: "NPM not configured".to_string(),
        }),
    ))?;

    let payload = NpmRedirectionHostPayload {
        domain_names: body.domain_names,
        forward_http_code: body.forward_http_code,
        forward_scheme: body.forward_scheme,
        forward_domain_name: body.forward_domain_name,
        preserve_path: body.preserve_path,
        certificate_id: serde_json::Value::Number(0.into()),
        ssl_forced: body.ssl_forced,
        block_exploits: body.block_exploits,
        enabled: body.enabled,
        meta: serde_json::json!({}),
    };

    let host = client
        .create_redirection_host(&payload)
        .await
        .map_err(|e| {
            error!("NPM create redirection host failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(NpmError {
                    error: format!("{e}"),
                }),
            )
        })?;

    Ok(Json(RedirectionHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_http_code: host.forward_http_code,
        forward_scheme: host.forward_scheme,
        forward_domain_name: host.forward_domain_name,
        preserve_path: host.preserve_path,
        ssl_forced: host.ssl_forced,
        block_exploits: host.block_exploits,
        enabled: host.enabled,
    }))
}

/// PUT /api/v1/npm/redirection-hosts/:id — update a redirection host.
pub async fn update_redirection_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<RedirectionHostRequest>,
) -> Result<Json<RedirectionHostSummary>, (StatusCode, Json<NpmError>)> {
    let client = get_npm_client(&state).await.ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        Json(NpmError {
            error: "NPM not configured".to_string(),
        }),
    ))?;

    let payload = NpmRedirectionHostPayload {
        domain_names: body.domain_names,
        forward_http_code: body.forward_http_code,
        forward_scheme: body.forward_scheme,
        forward_domain_name: body.forward_domain_name,
        preserve_path: body.preserve_path,
        certificate_id: serde_json::Value::Number(0.into()),
        ssl_forced: body.ssl_forced,
        block_exploits: body.block_exploits,
        enabled: body.enabled,
        meta: serde_json::json!({}),
    };

    let host = client
        .update_redirection_host(id, &payload)
        .await
        .map_err(|e| {
            error!("NPM update redirection host {id} failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(NpmError {
                    error: format!("{e}"),
                }),
            )
        })?;

    Ok(Json(RedirectionHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_http_code: host.forward_http_code,
        forward_scheme: host.forward_scheme,
        forward_domain_name: host.forward_domain_name,
        preserve_path: host.preserve_path,
        ssl_forced: host.ssl_forced,
        block_exploits: host.block_exploits,
        enabled: host.enabled,
    }))
}

/// DELETE /api/v1/npm/redirection-hosts/:id — delete a redirection host.
pub async fn delete_redirection_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<NpmError>)> {
    let client = get_npm_client(&state).await.ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        Json(NpmError {
            error: "NPM not configured".to_string(),
        }),
    ))?;

    client.delete_redirection_host(id).await.map_err(|e| {
        error!("NPM delete redirection host {id} failed: {e}");
        (
            StatusCode::BAD_GATEWAY,
            Json(NpmError {
                error: format!("{e}"),
            }),
        )
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
