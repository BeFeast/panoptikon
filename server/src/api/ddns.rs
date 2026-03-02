//! Dynamic DNS (DDNS) client management endpoints.
//!
//! Manages DDNS entries stored in SQLite with CRUD operations,
//! plus router-side configuration via MikroTik APIs.

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

/// A Dynamic DNS entry as returned to the frontend.
#[derive(Debug, Serialize)]
pub struct DdnsEntry {
    pub id: String,
    pub provider: String,
    pub hostname: String,
    pub username: Option<String>,
    pub has_password: bool,
    pub has_api_token: bool,
    pub zone: Option<String>,
    pub interface_name: Option<String>,
    pub ip_source: String,
    pub protocol: String,
    pub enabled: bool,
    pub router_type: String,
    pub last_status: String,
    pub last_ip: Option<String>,
    pub last_updated_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating/updating a DDNS entry.
#[derive(Debug, Deserialize)]
pub struct DdnsEntryRequest {
    pub provider: String,
    pub hostname: String,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub api_token: Option<String>,
    #[serde(default)]
    pub zone: Option<String>,
    #[serde(default)]
    pub interface_name: Option<String>,
    #[serde(default = "default_ip_source")]
    pub ip_source: String,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_router_type")]
    pub router_type: String,
}

fn default_ip_source() -> String {
    "wan".to_string()
}

fn default_protocol() -> String {
    "ipv4".to_string()
}

fn default_true() -> bool {
    true
}

fn default_router_type() -> String {
    "mikrotik".to_string()
}

/// Toggle request body.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// DDNS status summary.
#[derive(Debug, Serialize)]
pub struct DdnsStatus {
    pub total: i64,
    pub enabled: i64,
    pub healthy: i64,
    pub failing: i64,
    pub mikrotik_configured: bool,
}

// ─── Handlers: DDNS CRUD ─────────────────────────────────

/// GET /api/v1/ddns — list all DDNS entries.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<DdnsEntry>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, provider, hostname, username, password, api_token, zone, \
         interface_name, ip_source, protocol, enabled, router_type, \
         last_status, last_ip, last_updated_at, last_error, \
         created_at, updated_at \
         FROM ddns_entries ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list DDNS entries: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entries: Vec<DdnsEntry> = rows
        .into_iter()
        .map(|r| {
            let password: Option<String> = r.get("password");
            let api_token: Option<String> = r.get("api_token");
            DdnsEntry {
                id: r.get("id"),
                provider: r.get("provider"),
                hostname: r.get("hostname"),
                username: r.get("username"),
                has_password: password.is_some(),
                has_api_token: api_token.is_some(),
                zone: r.get("zone"),
                interface_name: r.get("interface_name"),
                ip_source: r.get("ip_source"),
                protocol: r.get("protocol"),
                enabled: r.get::<i32, _>("enabled") != 0,
                router_type: r.get("router_type"),
                last_status: r.get("last_status"),
                last_ip: r.get("last_ip"),
                last_updated_at: r.get("last_updated_at"),
                last_error: r.get("last_error"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }
        })
        .collect();

    Ok(Json(entries))
}

/// POST /api/v1/ddns — create a new DDNS entry.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<DdnsEntryRequest>,
) -> Result<(StatusCode, Json<DdnsEntry>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO ddns_entries \
         (id, provider, hostname, username, password, api_token, zone, \
          interface_name, ip_source, protocol, enabled, router_type) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.provider)
    .bind(&body.hostname)
    .bind(&body.username)
    .bind(&body.password)
    .bind(&body.api_token)
    .bind(&body.zone)
    .bind(&body.interface_name)
    .bind(&body.ip_source)
    .bind(&body.protocol)
    .bind(body.enabled as i32)
    .bind(&body.router_type)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create DDNS entry: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(id = %id, provider = %body.provider, hostname = %body.hostname, "Created DDNS entry");

    let entry = fetch_by_id(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(entry)))
}

/// PUT /api/v1/ddns/:id — update a DDNS entry.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<DdnsEntryRequest>,
) -> Result<Json<DdnsEntry>, StatusCode> {
    // Build dynamic update — only set password/api_token if provided
    let result = sqlx::query(
        "UPDATE ddns_entries SET \
         provider = ?, hostname = ?, username = ?, zone = ?, \
         interface_name = ?, ip_source = ?, protocol = ?, \
         enabled = ?, router_type = ?, \
         updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(&body.provider)
    .bind(&body.hostname)
    .bind(&body.username)
    .bind(&body.zone)
    .bind(&body.interface_name)
    .bind(&body.ip_source)
    .bind(&body.protocol)
    .bind(body.enabled as i32)
    .bind(&body.router_type)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update DDNS entry {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Update password if provided
    if let Some(ref pw) = body.password {
        sqlx::query("UPDATE ddns_entries SET password = ? WHERE id = ?")
            .bind(pw)
            .bind(&id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to update DDNS password for {id}: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }

    // Update api_token if provided
    if let Some(ref token) = body.api_token {
        sqlx::query("UPDATE ddns_entries SET api_token = ? WHERE id = ?")
            .bind(token)
            .bind(&id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to update DDNS api_token for {id}: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
    }

    info!(id = %id, "Updated DDNS entry");

    let entry = fetch_by_id(&state, &id).await?;
    Ok(Json(entry))
}

/// DELETE /api/v1/ddns/:id — delete a DDNS entry.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM ddns_entries WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete DDNS entry {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, "Deleted DDNS entry");
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/ddns/:id/toggle — toggle enabled state.
pub async fn toggle(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<DdnsEntry>, StatusCode> {
    let result = sqlx::query(
        "UPDATE ddns_entries SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle DDNS entry {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    info!(id = %id, enabled = body.enabled, "Toggled DDNS entry");

    let entry = fetch_by_id(&state, &id).await?;
    Ok(Json(entry))
}

/// GET /api/v1/ddns/status — aggregate status summary.
pub async fn status(State(state): State<AppState>) -> Result<Json<DdnsStatus>, StatusCode> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ddns_entries")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count DDNS entries: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let enabled: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ddns_entries WHERE enabled = 1")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count enabled DDNS entries: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let healthy: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ddns_entries WHERE enabled = 1 AND last_status = 'success'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to count healthy DDNS entries: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let failing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ddns_entries WHERE enabled = 1 AND last_status = 'error'",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to count failing DDNS entries: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Check if MikroTik is configured
    let mikrotik_enabled: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'mikrotik_enabled'")
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
    let mikrotik_configured = mikrotik_enabled
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    Ok(Json(DdnsStatus {
        total,
        enabled,
        healthy,
        failing,
        mikrotik_configured,
    }))
}

// ─── Helpers ──────────────────────────────────────────────

/// Fetch a single DDNS entry by ID (for returning after create/update).
async fn fetch_by_id(state: &AppState, id: &str) -> Result<DdnsEntry, StatusCode> {
    let r = sqlx::query(
        "SELECT id, provider, hostname, username, password, api_token, zone, \
         interface_name, ip_source, protocol, enabled, router_type, \
         last_status, last_ip, last_updated_at, last_error, \
         created_at, updated_at \
         FROM ddns_entries WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch DDNS entry {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let password: Option<String> = r.get("password");
    let api_token: Option<String> = r.get("api_token");

    Ok(DdnsEntry {
        id: r.get("id"),
        provider: r.get("provider"),
        hostname: r.get("hostname"),
        username: r.get("username"),
        has_password: password.is_some(),
        has_api_token: api_token.is_some(),
        zone: r.get("zone"),
        interface_name: r.get("interface_name"),
        ip_source: r.get("ip_source"),
        protocol: r.get("protocol"),
        enabled: r.get::<i32, _>("enabled") != 0,
        router_type: r.get("router_type"),
        last_status: r.get("last_status"),
        last_ip: r.get("last_ip"),
        last_updated_at: r.get("last_updated_at"),
        last_error: r.get("last_error"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    })
}
