use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use tracing::error;

use super::AppState;
use crate::npm::client::{NpmClient, NpmConnectionStatus};

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
