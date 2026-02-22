use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::AppState;

/// A single audit log entry.
#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogEntry {
    pub id: i64,
    pub created_at: String,
    pub action: String,
    pub description: String,
    pub vyos_commands: String,
    pub success: bool,
    pub error_msg: Option<String>,
}

/// Paginated response for the audit log list endpoint.
#[derive(Debug, Serialize)]
pub struct AuditLogListResponse {
    pub items: Vec<AuditLogEntry>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

/// Query parameters for listing audit logs.
#[derive(Debug, Deserialize)]
pub struct AuditLogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub action: Option<String>,
}

/// GET /api/v1/audit-log — list audit log entries with pagination and optional filter.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<AuditLogQuery>,
) -> Result<Json<AuditLogListResponse>, StatusCode> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let (items, total) = if let Some(ref action_filter) = params.action {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log WHERE action = ?")
            .bind(action_filter)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("audit_log count query failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let rows = sqlx::query_as::<_, AuditLogRow>(
            "SELECT id, created_at, action, description, vyos_commands, success, error_msg \
             FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .bind(action_filter)
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("audit_log list query failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        (rows, total)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("audit_log count query failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let rows = sqlx::query_as::<_, AuditLogRow>(
            "SELECT id, created_at, action, description, vyos_commands, success, error_msg \
             FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?",
        )
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("audit_log list query failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        (rows, total)
    };

    let entries: Vec<AuditLogEntry> = items
        .into_iter()
        .map(|row| AuditLogEntry {
            id: row.id,
            created_at: row.created_at,
            action: row.action,
            description: row.description,
            vyos_commands: row.vyos_commands,
            success: row.success != 0,
            error_msg: row.error_msg,
        })
        .collect();

    Ok(Json(AuditLogListResponse {
        items: entries,
        total,
        page,
        per_page,
    }))
}

/// GET /api/v1/audit-log/actions — list distinct action types for filter dropdown.
pub async fn actions(State(state): State<AppState>) -> Result<Json<Vec<String>>, StatusCode> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT DISTINCT action FROM audit_log ORDER BY action")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("audit_log actions query failed: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    Ok(Json(rows.into_iter().map(|(a,)| a).collect()))
}

/// Internal row type for sqlx deserialization.
#[derive(sqlx::FromRow)]
struct AuditLogRow {
    id: i64,
    created_at: String,
    action: String,
    description: String,
    vyos_commands: String,
    success: i32,
    error_msg: Option<String>,
}

// ── Audit log helper ─────────────────────────────────────────────────────────

/// Record a successful audit log entry. Fire-and-forget — errors are logged but
/// do not affect the caller.
pub async fn log_success(
    db: &SqlitePool,
    action: &str,
    description: &str,
    vyos_commands: &[String],
) {
    let commands_json = serde_json::to_string(vyos_commands).unwrap_or_else(|_| "[]".to_string());

    if let Err(e) = sqlx::query(
        "INSERT INTO audit_log (action, description, vyos_commands, success) VALUES (?, ?, ?, 1)",
    )
    .bind(action)
    .bind(description)
    .bind(&commands_json)
    .execute(db)
    .await
    {
        tracing::error!("Failed to write audit log: {e}");
    }
}

/// Record a failed audit log entry.
pub async fn log_failure(
    db: &SqlitePool,
    action: &str,
    description: &str,
    vyos_commands: &[String],
    error_msg: &str,
) {
    let commands_json = serde_json::to_string(vyos_commands).unwrap_or_else(|_| "[]".to_string());

    if let Err(e) = sqlx::query(
        "INSERT INTO audit_log (action, description, vyos_commands, success, error_msg) \
         VALUES (?, ?, ?, 0, ?)",
    )
    .bind(action)
    .bind(description)
    .bind(&commands_json)
    .bind(error_msg)
    .execute(db)
    .await
    {
        tracing::error!("Failed to write audit log: {e}");
    }
}
