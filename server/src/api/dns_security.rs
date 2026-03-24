//! DNS Security endpoints — DNS-over-TLS (DoT) upstream management and DNSSEC settings.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::AppState;

// ─── DTOs ──────────────────────────────────────────────────

/// A DNS-over-TLS upstream server.
#[derive(Debug, Serialize)]
pub struct DotUpstream {
    pub id: String,
    pub name: String,
    pub address: String,
    pub port: i64,
    pub tls_hostname: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating/updating a DoT upstream.
#[derive(Debug, Deserialize)]
pub struct DotUpstreamRequest {
    pub name: String,
    pub address: String,
    #[serde(default = "default_dot_port")]
    pub port: i64,
    #[serde(default)]
    pub tls_hostname: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_dot_port() -> i64 {
    853
}

fn default_true() -> bool {
    true
}

/// Toggle request body.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// DNSSEC configuration.
#[derive(Debug, Serialize)]
pub struct DnssecConfig {
    pub enabled: bool,
}

/// Request body for updating DNSSEC config.
#[derive(Debug, Deserialize)]
pub struct DnssecConfigRequest {
    pub enabled: bool,
}

/// Combined DNS security settings response.
#[derive(Debug, Serialize)]
pub struct DnsSecurityStatus {
    pub dot_upstreams: i64,
    pub dot_enabled: i64,
    pub dnssec_enabled: bool,
}

// ─── Handlers: DoT Upstream CRUD ───────────────────────────

/// GET /api/v1/dns-security/dot-upstreams — list all DoT upstream servers.
pub async fn list_dot_upstreams(
    State(state): State<AppState>,
) -> Result<Json<Vec<DotUpstream>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, name, address, port, tls_hostname, enabled, created_at, updated_at \
         FROM dns_dot_upstreams ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list DoT upstreams: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entries: Vec<DotUpstream> = rows
        .into_iter()
        .map(|r| DotUpstream {
            id: r.get("id"),
            name: r.get("name"),
            address: r.get("address"),
            port: r.get("port"),
            tls_hostname: r.get("tls_hostname"),
            enabled: r.get::<i32, _>("enabled") != 0,
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(entries))
}

/// POST /api/v1/dns-security/dot-upstreams — create a new DoT upstream.
pub async fn create_dot_upstream(
    State(state): State<AppState>,
    Json(body): Json<DotUpstreamRequest>,
) -> Result<(StatusCode, Json<DotUpstream>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO dns_dot_upstreams (id, name, address, port, tls_hostname, enabled) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.address)
    .bind(body.port)
    .bind(&body.tls_hostname)
    .bind(body.enabled as i32)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create DoT upstream: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(id = %id, name = %body.name, address = %body.address, "Created DoT upstream");

    let entry = fetch_dot_upstream_by_id(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(entry)))
}

/// PUT /api/v1/dns-security/dot-upstreams/:id — update a DoT upstream.
pub async fn update_dot_upstream(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<DotUpstreamRequest>,
) -> Result<Json<DotUpstream>, StatusCode> {
    let result = sqlx::query(
        "UPDATE dns_dot_upstreams SET \
         name = ?, address = ?, port = ?, tls_hostname = ?, \
         enabled = ?, updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.address)
    .bind(body.port)
    .bind(&body.tls_hostname)
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update DoT upstream {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, "Updated DoT upstream");

    let entry = fetch_dot_upstream_by_id(&state, &id).await?;
    Ok(Json(entry))
}

/// DELETE /api/v1/dns-security/dot-upstreams/:id — delete a DoT upstream.
pub async fn delete_dot_upstream(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM dns_dot_upstreams WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete DoT upstream {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, "Deleted DoT upstream");
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/dns-security/dot-upstreams/:id/toggle — toggle enabled state.
pub async fn toggle_dot_upstream(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<DotUpstream>, StatusCode> {
    let result = sqlx::query(
        "UPDATE dns_dot_upstreams SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle DoT upstream {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, enabled = body.enabled, "Toggled DoT upstream");

    let entry = fetch_dot_upstream_by_id(&state, &id).await?;
    Ok(Json(entry))
}

// ─── Handlers: DNSSEC ──────────────────────────────────────

/// GET /api/v1/dns-security/dnssec — get DNSSEC configuration.
pub async fn get_dnssec(State(state): State<AppState>) -> Result<Json<DnssecConfig>, StatusCode> {
    let enabled = get_setting(&state, "dnssec_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    Ok(Json(DnssecConfig { enabled }))
}

/// PATCH /api/v1/dns-security/dnssec — update DNSSEC configuration.
pub async fn update_dnssec(
    State(state): State<AppState>,
    Json(body): Json<DnssecConfigRequest>,
) -> Result<Json<DnssecConfig>, StatusCode> {
    upsert_setting(
        &state,
        "dnssec_enabled",
        if body.enabled { "1" } else { "0" },
    )
    .await?;

    info!(dnssec_enabled = body.enabled, "DNSSEC setting updated");

    Ok(Json(DnssecConfig {
        enabled: body.enabled,
    }))
}

// ─── Handlers: Status ──────────────────────────────────────

/// GET /api/v1/dns-security/status — overview of DNS security settings.
pub async fn status(State(state): State<AppState>) -> Result<Json<DnsSecurityStatus>, StatusCode> {
    let dot_upstreams: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dns_dot_upstreams")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count DoT upstreams: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let dot_enabled: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_dot_upstreams WHERE enabled = 1")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to count enabled DoT upstreams: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let dnssec_enabled = get_setting(&state, "dnssec_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    Ok(Json(DnsSecurityStatus {
        dot_upstreams,
        dot_enabled,
        dnssec_enabled,
    }))
}

// ─── Helpers ──────────────────────────────────────────────

/// Fetch a single DoT upstream by ID.
async fn fetch_dot_upstream_by_id(state: &AppState, id: &str) -> Result<DotUpstream, StatusCode> {
    let r = sqlx::query(
        "SELECT id, name, address, port, tls_hostname, enabled, created_at, updated_at \
         FROM dns_dot_upstreams WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch DoT upstream {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(DotUpstream {
        id: r.get("id"),
        name: r.get("name"),
        address: r.get("address"),
        port: r.get("port"),
        tls_hostname: r.get("tls_hostname"),
        enabled: r.get::<i32, _>("enabled") != 0,
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    })
}

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

/// Upsert a key-value pair into the settings table.
async fn upsert_setting(state: &AppState, key: &str, value: &str) -> Result<(), StatusCode> {
    sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
    )
    .bind(key)
    .bind(value)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to save setting '{key}': {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(())
}
