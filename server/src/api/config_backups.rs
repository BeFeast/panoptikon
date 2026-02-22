use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConfigBackup {
    pub id: i64,
    pub created_at: String,
    pub label: Option<String>,
    pub config_text: String,
    pub size_bytes: i64,
    pub created_by: String,
}

#[derive(Debug, Serialize)]
pub struct ConfigBackupSummary {
    pub id: i64,
    pub created_at: String,
    pub label: Option<String>,
    pub size_bytes: i64,
    pub created_by: String,
}

#[derive(Debug, Serialize)]
pub struct ConfigBackupListResponse {
    pub items: Vec<ConfigBackupSummary>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBackupRequest {
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ShowConfigResponse {
    pub config_text: String,
}

#[derive(Debug, Serialize)]
pub struct ConfigDiffResponse {
    pub current: String,
    pub backup: String,
    pub backup_label: Option<String>,
    pub backup_created_at: String,
}

// ── sqlx row types ───────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BackupSummaryRow {
    id: i64,
    created_at: String,
    label: Option<String>,
    size_bytes: i64,
    created_by: String,
}

#[derive(sqlx::FromRow)]
struct BackupRow {
    id: i64,
    created_at: String,
    label: Option<String>,
    config_text: String,
    size_bytes: i64,
    created_by: String,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/v1/config-backups — list backup snapshots (without config text).
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<ConfigBackupListResponse>, StatusCode> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vyos_config_backups")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("config_backups count failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let rows = sqlx::query_as::<_, BackupSummaryRow>(
        "SELECT id, created_at, label, size_bytes, created_by \
         FROM vyos_config_backups ORDER BY id DESC LIMIT ? OFFSET ?",
    )
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups list failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let items = rows
        .into_iter()
        .map(|r| ConfigBackupSummary {
            id: r.id,
            created_at: r.created_at,
            label: r.label,
            size_bytes: r.size_bytes,
            created_by: r.created_by,
        })
        .collect();

    Ok(Json(ConfigBackupListResponse { items, total }))
}

/// GET /api/v1/config-backups/:id — get a single backup (with config text).
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ConfigBackup>, StatusCode> {
    let row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM vyos_config_backups WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups get_one failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(ConfigBackup {
        id: row.id,
        created_at: row.created_at,
        label: row.label,
        config_text: row.config_text,
        size_bytes: row.size_bytes,
        created_by: row.created_by,
    }))
}

/// POST /api/v1/config-backups — snapshot the current running config into DB.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBackupRequest>,
) -> Result<(StatusCode, Json<ConfigBackup>), StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let config_text = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch running config for backup: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let size_bytes = config_text.len() as i64;

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO vyos_config_backups (label, config_text, size_bytes, created_by) \
         VALUES (?, ?, ?, 'user') RETURNING id",
    )
    .bind(&body.label)
    .bind(&config_text)
    .bind(size_bytes)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups insert failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM vyos_config_backups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups fetch after insert failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((
        StatusCode::CREATED,
        Json(ConfigBackup {
            id: row.id,
            created_at: row.created_at,
            label: row.label,
            config_text: row.config_text,
            size_bytes: row.size_bytes,
            created_by: row.created_by,
        }),
    ))
}

/// DELETE /api/v1/config-backups/:id — remove a backup snapshot.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM vyos_config_backups WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("config_backups delete failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/config-backups/current — fetch current running config from VyOS.
pub async fn show_current(
    State(state): State<AppState>,
) -> Result<Json<ShowConfigResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let config_text = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch running config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(ShowConfigResponse { config_text }))
}

/// GET /api/v1/config-backups/:id/diff — diff backup against current running config.
pub async fn diff(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ConfigDiffResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    // Fetch the backup from DB
    let row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM vyos_config_backups WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups diff query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Fetch current running config
    let current = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch running config for diff: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(ConfigDiffResponse {
        current,
        backup: row.config_text,
        backup_label: row.label,
        backup_created_at: row.created_at,
    }))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Fetch the full running configuration text from VyOS via `show configuration`.
async fn fetch_running_config(
    client: &crate::vyos::client::VyosClient,
) -> Result<String, anyhow::Error> {
    let value = client.show(&["configuration"]).await?;
    Ok(value.as_str().unwrap_or("").to_string())
}
