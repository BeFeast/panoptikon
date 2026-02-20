use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use super::AppState;

/// Status response for the router.
#[derive(Debug, Serialize)]
pub struct RouterStatus {
    pub configured: bool,
    pub reachable: bool,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub hostname: Option<String>,
}

/// GET /api/v1/vyos/status — check if VyOS is configured and reachable.
pub async fn status(State(state): State<AppState>) -> Json<RouterStatus> {
    let client = match get_vyos_client_from_db(&state.db, &state.config).await {
        Some(c) => c,
        None => {
            return Json(RouterStatus {
                configured: false,
                reachable: false,
                version: None,
                uptime: None,
                hostname: None,
            });
        }
    };

    // Try to fetch version and uptime
    let version = client.show(&["version"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            // Extract "Version: VyOS xxx" line
            s.lines()
                .find(|l| l.starts_with("Version:"))
                .map(|l| l.trim_start_matches("Version:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let uptime = client.show(&["system", "uptime"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            s.lines()
                .find(|l| l.starts_with("Uptime:"))
                .map(|l| l.trim_start_matches("Uptime:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let hostname = client
        .show(&["host", "name"])
        .await
        .ok()
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()));

    let reachable = version.is_some() || uptime.is_some();

    Json(RouterStatus {
        configured: true,
        reachable,
        version,
        uptime,
        hostname,
    })
}

/// GET /api/v1/vyos/interfaces — fetch VyOS interface information (operational).
pub async fn interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client.show(&["interfaces"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS interfaces query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/routes — fetch VyOS routing table.
pub async fn routes(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client.show(&["ip", "route"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS routes query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/dhcp-leases — fetch DHCP server leases from VyOS.
pub async fn dhcp_leases(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .show(&["dhcp", "server", "leases"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS DHCP leases query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

/// GET /api/v1/vyos/firewall — fetch firewall config from VyOS.
pub async fn firewall(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    // Firewall may not be configured — that's OK, return empty object
    match client.retrieve(&["firewall"]).await {
        Ok(data) => Ok(Json(data)),
        Err(e) => {
            let msg = e.to_string();
            // VyOS returns error when path is empty (no firewall configured)
            if msg.contains("empty") || msg.contains("does not exist") {
                Ok(Json(serde_json::json!({})))
            } else {
                tracing::error!("VyOS firewall query failed: {e}");
                Err(StatusCode::BAD_GATEWAY)
            }
        }
    }
}

/// GET /api/v1/vyos/config-interfaces — fetch interface configuration (structured).
pub async fn config_interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .retrieve(&["interfaces"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS config-interfaces query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

// ── Helpers ─────────────────────────────────────────────────────────

/// Read VyOS URL and API key from the settings table, falling back to config file values.
async fn get_vyos_settings(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> (Option<String>, Option<String>) {
    let db_url: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_url'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    let db_key: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_api_key'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    // DB values take priority, fall back to config file
    let url = db_url
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.url.clone());
    let key = db_key
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.api_key.clone());

    (url, key)
}

/// Try to construct a VyOS client from DB settings + config. Returns None if not configured.
async fn get_vyos_client_from_db(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> Option<crate::vyos::client::VyosClient> {
    let (url, key) = get_vyos_settings(db, config).await;
    match (url, key) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => {
            Some(crate::vyos::client::VyosClient::new(&u, &k))
        }
        _ => None,
    }
}

/// Get VyOS client or return 503 SERVICE_UNAVAILABLE if not configured.
async fn get_vyos_client_or_503(
    state: &AppState,
) -> Result<crate::vyos::client::VyosClient, StatusCode> {
    get_vyos_client_from_db(&state.db, &state.config)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)
}
