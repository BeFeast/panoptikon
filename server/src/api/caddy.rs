use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::caddy::client::{self, CaddyConnectionStatus, CaddyProxyHost};

// ─── Helpers ────────────────────────────────────────────

/// Read a string setting from the settings table.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Get the configured Caddy admin URL, or None if not set.
async fn caddy_url(state: &AppState) -> Option<String> {
    get_setting(state, "caddy_url").await
}

/// Load all proxy hosts from SQLite.
async fn load_all_hosts(state: &AppState) -> Result<Vec<CaddyProxyHost>, StatusCode> {
    let rows = sqlx::query_as::<_, HostRow>(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, ssl_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts ORDER BY created_at",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to load caddy proxy hosts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Sync all hosts from DB to Caddy. Logs errors but does not fail the request.
async fn sync_hosts_to_caddy(state: &AppState) {
    let url = match caddy_url(state).await {
        Some(u) => u,
        None => return, // Caddy not configured — skip sync.
    };

    let hosts = match load_all_hosts(state).await {
        Ok(h) => h,
        Err(_) => return,
    };

    if let Err(e) = client::sync_to_caddy(&state.caddy_http, &url, &hosts).await {
        error!("Caddy sync failed: {e}");
    }
}

// ─── DB row mapping ─────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
struct HostRow {
    id: String,
    domain: String,
    forward_host: String,
    forward_port: i64,
    forward_scheme: String,
    enabled: bool,
    ssl_enabled: bool,
    created_at: String,
    updated_at: String,
}

impl From<HostRow> for CaddyProxyHost {
    fn from(r: HostRow) -> Self {
        Self {
            id: r.id,
            domain: r.domain,
            forward_host: r.forward_host,
            forward_port: r.forward_port as u16,
            forward_scheme: r.forward_scheme,
            enabled: r.enabled,
            ssl_enabled: r.ssl_enabled,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

// ─── DTOs ───────────────────────────────────────────────

#[derive(Serialize)]
pub struct ErrorBody {
    error: String,
}

fn error_response(status: StatusCode, msg: String) -> (StatusCode, Json<ErrorBody>) {
    (status, Json(ErrorBody { error: msg }))
}

/// Request body for creating / updating a proxy host.
#[derive(Debug, Deserialize)]
pub struct ProxyHostRequest {
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,
    #[serde(default)]
    pub ssl_enabled: bool,
}

fn default_scheme() -> String {
    "http".to_string()
}

/// Toggle request body.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

// ─── Handlers ───────────────────────────────────────────

/// GET /api/v1/caddy/status — check Caddy connection health.
pub async fn status(State(state): State<AppState>) -> Json<CaddyConnectionStatus> {
    let url = match caddy_url(&state).await {
        Some(u) => u,
        None => {
            return Json(CaddyConnectionStatus {
                configured: false,
                reachable: false,
                version: None,
            });
        }
    };

    match client::test_connection(&state.caddy_http, &url).await {
        Ok(status) => Json(status),
        Err(e) => {
            error!("Caddy connection test failed: {e}");
            Json(CaddyConnectionStatus {
                configured: true,
                reachable: false,
                version: None,
            })
        }
    }
}

/// GET /api/v1/caddy/proxy-hosts — list all proxy hosts from SQLite.
pub async fn list_proxy_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<CaddyProxyHost>>, StatusCode> {
    let hosts = load_all_hosts(&state).await?;
    Ok(Json(hosts))
}

/// POST /api/v1/caddy/proxy-hosts — create a new proxy host.
pub async fn create_proxy_host(
    State(state): State<AppState>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<CaddyProxyHost>, (StatusCode, Json<ErrorBody>)> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, forward_host, forward_port, forward_scheme, ssl_enabled) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i64)
    .bind(&body.forward_scheme)
    .bind(body.ssl_enabled)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create caddy proxy host: {e}");
        error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    info!(id = %id, domain = %body.domain, "Created Caddy proxy host");

    // Sync to Caddy in background.
    sync_hosts_to_caddy(&state).await;

    // Fetch the newly created row.
    let row = sqlx::query_as::<_, HostRow>(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, ssl_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created proxy host: {e}");
        error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(row.into()))
}

/// PUT /api/v1/caddy/proxy-hosts/:id — update an existing proxy host.
pub async fn update_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<CaddyProxyHost>, (StatusCode, Json<ErrorBody>)> {
    let result = sqlx::query(
        "UPDATE caddy_proxy_hosts SET domain = ?, forward_host = ?, forward_port = ?, \
         forward_scheme = ?, ssl_enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i64)
    .bind(&body.forward_scheme)
    .bind(body.ssl_enabled)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update caddy proxy host {id}: {e}");
        error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if result.rows_affected() == 0 {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            format!("Proxy host {id} not found"),
        ));
    }

    info!(id = %id, domain = %body.domain, "Updated Caddy proxy host");

    sync_hosts_to_caddy(&state).await;

    let row = sqlx::query_as::<_, HostRow>(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, ssl_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated proxy host: {e}");
        error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(row.into()))
}

/// DELETE /api/v1/caddy/proxy-hosts/:id — delete a proxy host.
pub async fn delete_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let result = sqlx::query("DELETE FROM caddy_proxy_hosts WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete caddy proxy host {id}: {e}");
            error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    if result.rows_affected() == 0 {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            format!("Proxy host {id} not found"),
        ));
    }

    info!(id = %id, "Deleted Caddy proxy host");

    sync_hosts_to_caddy(&state).await;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/caddy/proxy-hosts/:id/toggle — enable or disable a proxy host.
pub async fn toggle_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let result = sqlx::query(
        "UPDATE caddy_proxy_hosts SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle caddy proxy host {id}: {e}");
        error_response(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    if result.rows_affected() == 0 {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            format!("Proxy host {id} not found"),
        ));
    }

    info!(id = %id, enabled = body.enabled, "Toggled Caddy proxy host");

    sync_hosts_to_caddy(&state).await;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/caddy/sync — force a full sync from DB to Caddy.
pub async fn sync(
    State(state): State<AppState>,
) -> Result<StatusCode, (StatusCode, Json<ErrorBody>)> {
    let url = caddy_url(&state).await.ok_or_else(|| {
        error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "Caddy not configured".into(),
        )
    })?;

    let hosts = load_all_hosts(&state).await.map_err(|_| {
        error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to load hosts".into(),
        )
    })?;

    client::sync_to_caddy(&state.caddy_http, &url, &hosts)
        .await
        .map_err(|e| {
            error!("Caddy sync failed: {e}");
            error_response(StatusCode::BAD_GATEWAY, e.to_string())
        })?;

    info!("Caddy config synced successfully");
    Ok(StatusCode::NO_CONTENT)
}
