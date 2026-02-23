use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::caddy::client::{self, CaddyProxyHost, CaddyStatus};

const DEFAULT_CADDY_ADMIN_URL: &str = "http://localhost:2019";

/// GET /api/v1/caddy/status — check if Caddy Admin API is reachable.
pub async fn status(State(state): State<AppState>) -> Json<CaddyStatus> {
    let admin_url = get_caddy_admin_url(&state).await;
    let mut status = client::check_status(&state.caddy_http, &admin_url).await;

    // Fill host count from DB.
    if status.reachable {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM caddy_proxy_hosts")
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
        status.host_count = Some(count as usize);
    }

    Json(status)
}

/// Response shape for a single proxy host.
#[derive(Debug, Serialize)]
pub struct ProxyHostResponse {
    pub id: String,
    pub domain: String,
    pub upstream: String,
    pub enabled: bool,
    pub ssl_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

/// GET /api/v1/caddy/proxy-hosts — list all proxy hosts from SQLite.
pub async fn list_proxy_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProxyHostResponse>>, StatusCode> {
    let rows = sqlx::query_as::<_, (String, String, String, bool, String, String, String)>(
        "SELECT id, domain, upstream, enabled, ssl_mode, created_at, updated_at \
         FROM caddy_proxy_hosts ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list Caddy proxy hosts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let hosts: Vec<ProxyHostResponse> = rows
        .into_iter()
        .map(
            |(id, domain, upstream, enabled, ssl_mode, created_at, updated_at)| ProxyHostResponse {
                id,
                domain,
                upstream,
                enabled,
                ssl_mode,
                created_at,
                updated_at,
            },
        )
        .collect();

    Ok(Json(hosts))
}

/// Request body for creating / updating a proxy host.
#[derive(Debug, Deserialize)]
pub struct ProxyHostRequest {
    pub domain: String,
    pub upstream: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_ssl_mode")]
    pub ssl_mode: String,
}

fn default_true() -> bool {
    true
}

fn default_ssl_mode() -> String {
    "disabled".to_string()
}

/// POST /api/v1/caddy/proxy-hosts — create a new proxy host.
pub async fn create_proxy_host(
    State(state): State<AppState>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<(StatusCode, Json<ProxyHostResponse>), (StatusCode, String)> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, upstream, enabled, ssl_mode) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.domain)
    .bind(&body.upstream)
    .bind(body.enabled)
    .bind(&body.ssl_mode)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create Caddy proxy host: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
    })?;

    info!(domain = %body.domain, upstream = %body.upstream, "Created Caddy proxy host");

    // Sync to Caddy.
    if let Err(e) = sync_all_to_caddy(&state).await {
        error!("Failed to sync to Caddy after create: {e}");
    }

    let row = sqlx::query_as::<_, (String, String, String, bool, String, String, String)>(
        "SELECT id, domain, upstream, enabled, ssl_mode, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created host: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
    })?;

    Ok((
        StatusCode::CREATED,
        Json(ProxyHostResponse {
            id: row.0,
            domain: row.1,
            upstream: row.2,
            enabled: row.3,
            ssl_mode: row.4,
            created_at: row.5,
            updated_at: row.6,
        }),
    ))
}

/// PUT /api/v1/caddy/proxy-hosts/:id — update an existing proxy host.
pub async fn update_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<ProxyHostResponse>, (StatusCode, String)> {
    let result = sqlx::query(
        "UPDATE caddy_proxy_hosts SET domain = ?, upstream = ?, enabled = ?, ssl_mode = ?, \
         updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.domain)
    .bind(&body.upstream)
    .bind(body.enabled)
    .bind(&body.ssl_mode)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update Caddy proxy host: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Proxy host not found".to_string()));
    }

    info!(id = %id, domain = %body.domain, "Updated Caddy proxy host");

    // Sync to Caddy.
    if let Err(e) = sync_all_to_caddy(&state).await {
        error!("Failed to sync to Caddy after update: {e}");
    }

    let row = sqlx::query_as::<_, (String, String, String, bool, String, String, String)>(
        "SELECT id, domain, upstream, enabled, ssl_mode, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated host: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
    })?;

    Ok(Json(ProxyHostResponse {
        id: row.0,
        domain: row.1,
        upstream: row.2,
        enabled: row.3,
        ssl_mode: row.4,
        created_at: row.5,
        updated_at: row.6,
    }))
}

/// DELETE /api/v1/caddy/proxy-hosts/:id — delete a proxy host.
pub async fn delete_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM caddy_proxy_hosts WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete Caddy proxy host: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
        })?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Proxy host not found".to_string()));
    }

    info!(id = %id, "Deleted Caddy proxy host");

    // Sync to Caddy.
    if let Err(e) = sync_all_to_caddy(&state).await {
        error!("Failed to sync to Caddy after delete: {e}");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Toggle request body.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// POST /api/v1/caddy/proxy-hosts/:id/toggle — enable/disable a proxy host.
pub async fn toggle_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        "UPDATE caddy_proxy_hosts SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle Caddy proxy host: {e}");
        (StatusCode::INTERNAL_SERVER_ERROR, format!("DB error: {e}"))
    })?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Proxy host not found".to_string()));
    }

    info!(id = %id, enabled = body.enabled, "Toggled Caddy proxy host");

    // Sync to Caddy.
    if let Err(e) = sync_all_to_caddy(&state).await {
        error!("Failed to sync to Caddy after toggle: {e}");
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/caddy/sync — force a full config sync to Caddy.
pub async fn force_sync(State(state): State<AppState>) -> Result<StatusCode, (StatusCode, String)> {
    sync_all_to_caddy(&state).await.map_err(|e| {
        error!("Caddy force sync failed: {e}");
        (StatusCode::BAD_GATEWAY, format!("Sync failed: {e}"))
    })?;
    Ok(StatusCode::NO_CONTENT)
}

/// Helper: read `caddy_admin_url` from settings or use default.
async fn get_caddy_admin_url(state: &AppState) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'caddy_admin_url'")
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CADDY_ADMIN_URL.to_string())
}

/// Fetch all hosts from DB and sync to Caddy.
async fn sync_all_to_caddy(state: &AppState) -> anyhow::Result<()> {
    let admin_url = get_caddy_admin_url(state).await;

    let rows = sqlx::query_as::<_, (String, String, String, bool, String, String, String)>(
        "SELECT id, domain, upstream, enabled, ssl_mode, created_at, updated_at \
         FROM caddy_proxy_hosts ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;

    let hosts: Vec<CaddyProxyHost> = rows
        .into_iter()
        .map(
            |(id, domain, upstream, enabled, ssl_mode, created_at, updated_at)| CaddyProxyHost {
                id,
                domain,
                upstream,
                enabled,
                ssl_mode,
                created_at,
                updated_at,
            },
        )
        .collect();

    client::sync_to_caddy(&state.caddy_http, &admin_url, &hosts).await
}
