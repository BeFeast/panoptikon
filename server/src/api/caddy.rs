use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

use super::AppState;

// ─── DTOs ──────────────────────────────────────────────────

/// A Caddy proxy host as returned to the frontend.
#[derive(Debug, Serialize)]
pub struct CaddyProxyHost {
    pub id: String,
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub tls_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating / updating a proxy host.
#[derive(Debug, Deserialize)]
pub struct CaddyProxyHostRequest {
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,
    #[serde(default)]
    pub tls_enabled: bool,
}

fn default_scheme() -> String {
    "http".to_string()
}

/// Status response for Caddy connection check.
#[derive(Debug, Serialize)]
pub struct CaddyStatus {
    pub configured: bool,
    pub reachable: bool,
}

/// Response for the "Test Connection" button.
#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
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

/// Get the Caddy admin API base URL from settings, defaulting to localhost:2019.
async fn caddy_admin_url(state: &AppState) -> String {
    get_setting(state, "caddy_admin_url")
        .await
        .unwrap_or_else(|| "http://localhost:2019".to_string())
}

/// Sync proxy hosts to Caddy on server startup (fire-and-forget).
pub fn start_caddy_sync_task(state: AppState) {
    tokio::spawn(async move {
        // Small delay to let Caddy finish starting if launched alongside Panoptikon.
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        info!("Running initial Caddy config sync");
        sync_to_caddy(&state).await;
    });
}

/// Build Caddy JSON config from all enabled proxy hosts and PATCH it to the admin API.
///
/// Called after every CRUD mutation and once at startup to ensure
/// Caddy's live config always reflects the SQLite source of truth.
pub async fn sync_to_caddy(state: &AppState) {
    let hosts: Vec<(String, String, i64, String, i64)> = match sqlx::query_as(
        "SELECT domain, forward_host, forward_port, forward_scheme, tls_enabled \
         FROM caddy_proxy_hosts WHERE enabled = 1 ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            error!("Failed to load proxy hosts for Caddy sync: {e}");
            return;
        }
    };

    // Build Caddy route objects.
    let routes: Vec<serde_json::Value> = hosts
        .iter()
        .map(
            |(domain, forward_host, forward_port, forward_scheme, tls_enabled)| {
                let upstream = format!("{forward_scheme}://{forward_host}:{forward_port}");
                let mut route = serde_json::json!({
                    "match": [{ "host": [domain] }],
                    "handle": [{
                        "handler": "reverse_proxy",
                        "upstreams": [{ "dial": format!("{forward_host}:{forward_port}") }]
                    }]
                });

                // Add transport if HTTPS upstream
                if forward_scheme == "https" {
                    if let Some(handlers) = route["handle"].as_array_mut() {
                        if let Some(handler) = handlers.first_mut() {
                            handler["transport"] = serde_json::json!({
                                "protocol": "http",
                                "tls": {}
                            });
                        }
                    }
                }

                // If TLS is enabled, Caddy will auto-provision certs via the domain match.
                let _ = (upstream, *tls_enabled);

                route
            },
        )
        .collect();

    // Build the full HTTP app config.
    // If TLS is needed, Caddy handles it automatically through the host matcher.
    let http_app = serde_json::json!({
        "servers": {
            "proxy": {
                "listen": [":443", ":80"],
                "routes": routes
            }
        }
    });

    let admin_url = caddy_admin_url(state).await;
    let route_count = routes.len();

    // Try PATCH first (works when /config/apps/http already exists).
    // If that fails (e.g. fresh Caddy with no apps config), fall back to
    // POST /config/apps which creates the intermediate path.
    let patch_url = format!("{admin_url}/config/apps/http");
    let patched = matches!(
        state
            .caddy_http
            .patch(&patch_url)
            .header("Content-Type", "application/json")
            .json(&http_app)
            .send()
            .await,
        Ok(resp) if resp.status().is_success()
    );

    if patched {
        info!("Caddy config synced successfully ({route_count} routes)");
        return;
    }

    // Fallback: POST the full apps object (creates the /config/apps path).
    let apps_payload = serde_json::json!({ "http": http_app });
    let post_url = format!("{admin_url}/config/apps");

    match state
        .caddy_http
        .post(&post_url)
        .header("Content-Type", "application/json")
        .json(&apps_payload)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            info!("Caddy config synced via POST fallback ({route_count} routes)");
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!("Caddy sync failed: HTTP {status} — {body}");
        }
        Err(e) => {
            warn!("Caddy sync request failed: {e}");
        }
    }
}

// ─── Handlers ──────────────────────────────────────────────

/// GET /api/v1/caddy/status — check if Caddy admin API is reachable.
pub async fn status(State(state): State<AppState>) -> Json<CaddyStatus> {
    let admin_url = caddy_admin_url(&state).await;
    let url = format!("{admin_url}/config/");

    match state.caddy_http.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => Json(CaddyStatus {
            configured: true,
            reachable: true,
        }),
        Ok(_) => Json(CaddyStatus {
            configured: true,
            reachable: false,
        }),
        Err(_) => Json(CaddyStatus {
            configured: true,
            reachable: false,
        }),
    }
}

/// GET /api/v1/caddy/proxy-hosts — list all proxy hosts from SQLite.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<CaddyProxyHost>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, tls_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list caddy proxy hosts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let hosts: Vec<CaddyProxyHost> = rows
        .into_iter()
        .map(|r| CaddyProxyHost {
            id: r.get("id"),
            domain: r.get("domain"),
            forward_host: r.get("forward_host"),
            forward_port: r.get::<i32, _>("forward_port") as u16,
            forward_scheme: r.get("forward_scheme"),
            enabled: r.get::<i32, _>("enabled") != 0,
            tls_enabled: r.get::<i32, _>("tls_enabled") != 0,
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(hosts))
}

/// POST /api/v1/caddy/proxy-hosts — create a new proxy host.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CaddyProxyHostRequest>,
) -> Result<(StatusCode, Json<CaddyProxyHost>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, forward_host, forward_port, forward_scheme, tls_enabled) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i32)
    .bind(&body.forward_scheme)
    .bind(body.tls_enabled as i32)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create caddy proxy host: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Sync to Caddy after insert.
    sync_to_caddy(&state).await;

    let host = fetch_host_by_id(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(host)))
}

/// PUT /api/v1/caddy/proxy-hosts/:id — update a proxy host.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CaddyProxyHostRequest>,
) -> Result<Json<CaddyProxyHost>, StatusCode> {
    let affected = sqlx::query(
        "UPDATE caddy_proxy_hosts \
         SET domain = ?, forward_host = ?, forward_port = ?, forward_scheme = ?, \
             tls_enabled = ?, updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i32)
    .bind(&body.forward_scheme)
    .bind(body.tls_enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update caddy proxy host: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    sync_to_caddy(&state).await;

    let host = fetch_host_by_id(&state, &id).await?;
    Ok(Json(host))
}

/// DELETE /api/v1/caddy/proxy-hosts/:id — delete a proxy host.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let affected = sqlx::query("DELETE FROM caddy_proxy_hosts WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete caddy proxy host: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    sync_to_caddy(&state).await;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/caddy/proxy-hosts/:id/toggle — enable/disable a proxy host.
pub async fn toggle(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<CaddyProxyHost>, StatusCode> {
    let affected = sqlx::query(
        "UPDATE caddy_proxy_hosts SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle caddy proxy host: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    sync_to_caddy(&state).await;

    let host = fetch_host_by_id(&state, &id).await?;
    Ok(Json(host))
}

/// POST /api/v1/caddy/sync — force a sync from SQLite to Caddy.
pub async fn sync(State(state): State<AppState>) -> StatusCode {
    sync_to_caddy(&state).await;
    StatusCode::NO_CONTENT
}

/// POST /api/v1/caddy/test-connection — ping Caddy Admin API and return detailed result.
pub async fn test_connection(State(state): State<AppState>) -> Json<TestConnectionResponse> {
    let admin_url = caddy_admin_url(&state).await;
    let url = format!("{admin_url}/config/");

    match state.caddy_http.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body = resp.text().await.unwrap_or_default();
            let version_hint = if body.contains("apps") {
                " (config loaded)"
            } else {
                ""
            };
            Json(TestConnectionResponse {
                success: true,
                message: format!("Connected to Caddy Admin API at {admin_url}{version_hint}"),
            })
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Json(TestConnectionResponse {
                success: false,
                message: format!("Caddy responded with HTTP {status}: {body}"),
            })
        }
        Err(e) => Json(TestConnectionResponse {
            success: false,
            message: format!("Failed to reach Caddy at {admin_url}: {e}"),
        }),
    }
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// Helper: fetch a single proxy host by ID.
async fn fetch_host_by_id(state: &AppState, id: &str) -> Result<CaddyProxyHost, StatusCode> {
    let row = sqlx::query(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, tls_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch caddy proxy host: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(CaddyProxyHost {
        id: row.get("id"),
        domain: row.get("domain"),
        forward_host: row.get("forward_host"),
        forward_port: row.get::<i32, _>("forward_port") as u16,
        forward_scheme: row.get("forward_scheme"),
        enabled: row.get::<i32, _>("enabled") != 0,
        tls_enabled: row.get::<i32, _>("tls_enabled") != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}
