use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

use super::{AppError, AppState};

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

/// A single line in a unified diff.
#[derive(Debug, Clone, Serialize)]
pub struct DiffLine {
    /// "add", "remove", or "context"
    pub tag: String,
    /// The line content (without leading +/-/space).
    pub content: String,
}

/// Response for the improved diff endpoint — returns a unified diff.
#[derive(Debug, Serialize)]
pub struct ConfigDiffResponse {
    pub current: String,
    pub backup: String,
    pub backup_label: Option<String>,
    pub backup_created_at: String,
    /// Pre-computed unified diff lines for the frontend.
    pub diff_lines: Vec<DiffLine>,
    pub additions: usize,
    pub deletions: usize,
}

/// Response for the pending-changes endpoint.
#[derive(Debug, Serialize)]
pub struct PendingChangesResponse {
    pub has_changes: bool,
    pub diff_lines: Vec<DiffLine>,
    pub additions: usize,
    pub deletions: usize,
    /// The baseline (last committed / last snapshot) config text.
    pub baseline: String,
    /// The current candidate config text.
    pub candidate: String,
}

/// Response for commit / discard / restore operations.
#[derive(Debug, Serialize)]
pub struct ConfigActionResponse {
    pub success: bool,
    pub message: String,
    /// If a snapshot was auto-created, its id.
    pub snapshot_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RestoreRequest {
    /// Optional label for the auto-created pre-restore snapshot.
    pub snapshot_label: Option<String>,
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
) -> Result<Json<ConfigBackupListResponse>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM config_backups")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("config_backups count failed: {e}");
            AppError::Internal(e.to_string())
        })?;

    let rows = sqlx::query_as::<_, BackupSummaryRow>(
        "SELECT id, created_at, label, size_bytes, created_by \
         FROM config_backups ORDER BY id DESC LIMIT ? OFFSET ?",
    )
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups list failed: {e}");
        AppError::Internal(e.to_string())
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
) -> Result<Json<ConfigBackup>, AppError> {
    let row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM config_backups WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups get_one failed: {e}");
        AppError::Internal(e.to_string())
    })?
    .ok_or(AppError::NotFound)?;

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
///
/// Currently disabled — requires a supported router connection.
pub async fn create(
    State(_state): State<AppState>,
    Json(_body): Json<CreateBackupRequest>,
) -> Result<(StatusCode, Json<ConfigBackup>), AppError> {
    // Config backup creation requires a router connection.
    // This feature is currently disabled until router-agnostic config
    // backup support is implemented.
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// DELETE /api/v1/config-backups/:id — remove a backup snapshot.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM config_backups WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("config_backups delete failed: {e}");
            AppError::Internal(e.to_string())
        })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/config-backups/current — fetch current running config.
///
/// Currently disabled — requires a supported router connection.
pub async fn show_current(
    State(_state): State<AppState>,
) -> Result<Json<ShowConfigResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// GET /api/v1/config-backups/:id/diff — unified diff of backup vs current running config.
///
/// Currently disabled — requires a supported router connection.
pub async fn diff(
    State(_state): State<AppState>,
    Path(_id): Path<i64>,
) -> Result<Json<ConfigDiffResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// GET /api/v1/config-backups/pending — show pending (uncommitted) changes.
///
/// Currently disabled — requires a supported router connection.
pub async fn pending(
    State(_state): State<AppState>,
) -> Result<Json<PendingChangesResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// POST /api/v1/config-backups/commit — commit pending changes.
///
/// Currently disabled — requires a supported router connection.
pub async fn commit(
    State(_state): State<AppState>,
) -> Result<Json<ConfigActionResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// POST /api/v1/config-backups/discard — discard uncommitted candidate changes.
///
/// Currently disabled — requires a supported router connection.
pub async fn discard(
    State(_state): State<AppState>,
) -> Result<Json<ConfigActionResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

/// POST /api/v1/config-backups/:id/restore — roll back to a previous snapshot.
///
/// Currently disabled — requires a supported router connection.
pub async fn restore(
    State(_state): State<AppState>,
    Path(_id): Path<i64>,
    _body: Option<Json<RestoreRequest>>,
) -> Result<Json<ConfigActionResponse>, AppError> {
    Err(AppError::ServiceUnavailable("Not implemented".into()))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Compute a unified diff between two config texts.
///
/// Returns `(diff_lines, additions, deletions)`.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn compute_unified_diff(old: &str, new: &str) -> (Vec<DiffLine>, usize, usize) {
    let diff = TextDiff::from_lines(old, new);
    let mut lines = Vec::new();
    let mut additions = 0usize;
    let mut deletions = 0usize;

    for change in diff.iter_all_changes() {
        let (tag, content) = match change.tag() {
            ChangeTag::Equal => ("context", change.value()),
            ChangeTag::Insert => {
                additions += 1;
                ("add", change.value())
            }
            ChangeTag::Delete => {
                deletions += 1;
                ("remove", change.value())
            }
        };
        lines.push(DiffLine {
            tag: tag.to_string(),
            content: content.trim_end_matches('\n').to_string(),
        });
    }

    (lines, additions, deletions)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_unified_diff_no_changes() {
        let text = "line1\nline2\nline3\n";
        let (lines, additions, deletions) = compute_unified_diff(text, text);
        assert_eq!(additions, 0);
        assert_eq!(deletions, 0);
        assert!(lines.iter().all(|l| l.tag == "context"));
    }

    #[test]
    fn test_compute_unified_diff_additions() {
        let old = "line1\nline3\n";
        let new = "line1\nline2\nline3\n";
        let (lines, additions, deletions) = compute_unified_diff(old, new);
        assert_eq!(additions, 1);
        assert_eq!(deletions, 0);
        let added: Vec<_> = lines.iter().filter(|l| l.tag == "add").collect();
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].content, "line2");
    }

    #[test]
    fn test_compute_unified_diff_deletions() {
        let old = "line1\nline2\nline3\n";
        let new = "line1\nline3\n";
        let (lines, additions, deletions) = compute_unified_diff(old, new);
        assert_eq!(additions, 0);
        assert_eq!(deletions, 1);
        let removed: Vec<_> = lines.iter().filter(|l| l.tag == "remove").collect();
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].content, "line2");
    }

    #[test]
    fn test_compute_unified_diff_mixed() {
        let old = "a\nb\nc\n";
        let new = "a\nB\nc\n";
        let (lines, additions, deletions) = compute_unified_diff(old, new);
        assert_eq!(additions, 1);
        assert_eq!(deletions, 1);
        let tags: Vec<&str> = lines.iter().map(|l| l.tag.as_str()).collect();
        assert!(tags.contains(&"add"));
        assert!(tags.contains(&"remove"));
    }
}
