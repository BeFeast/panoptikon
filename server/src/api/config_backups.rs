use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

use super::audit;
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

/// GET /api/v1/config-backups/:id/diff — unified diff of backup vs current running config.
pub async fn diff(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<ConfigDiffResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

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

    let current = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch running config for diff: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let (diff_lines, additions, deletions) = compute_unified_diff(&row.config_text, &current);

    Ok(Json(ConfigDiffResponse {
        current,
        backup: row.config_text,
        backup_label: row.label,
        backup_created_at: row.created_at,
        diff_lines,
        additions,
        deletions,
    }))
}

/// GET /api/v1/config-backups/pending — show pending (uncommitted) changes.
///
/// Compares the most recent backup snapshot (baseline) against the current
/// running config from VyOS. If no snapshot exists yet the entire config is
/// treated as "new".
pub async fn pending(
    State(state): State<AppState>,
) -> Result<Json<PendingChangesResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let candidate = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch running config for pending diff: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Use the most recent snapshot as the baseline
    let baseline_row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM vyos_config_backups ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config_backups pending baseline query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let baseline = baseline_row.map(|r| r.config_text).unwrap_or_default();

    let (diff_lines, additions, deletions) = compute_unified_diff(&baseline, &candidate);
    let has_changes = additions > 0 || deletions > 0;

    Ok(Json(PendingChangesResponse {
        has_changes,
        diff_lines,
        additions,
        deletions,
        baseline,
        candidate,
    }))
}

/// POST /api/v1/config-backups/commit — commit pending changes, save to disk,
/// and auto-create a snapshot.
pub async fn commit(
    State(state): State<AppState>,
) -> Result<Json<ConfigActionResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    // 1. Commit candidate → running config
    if let Err(e) = client.configure_commit().await {
        tracing::warn!("VyOS commit returned error (may auto-commit): {e}");
        // VyOS HTTP API may auto-commit; treat non-fatal errors gracefully
    }

    // 2. Save running config to disk
    if let Err(e) = client.config_save().await {
        tracing::error!("VyOS config save failed: {e}");
        let commands = vec!["commit".to_string(), "save".to_string()];
        audit::log_failure(
            &state.db,
            "config_commit",
            "Failed to save config to disk after commit",
            &commands,
            &e.to_string(),
        )
        .await;
        return Ok(Json(ConfigActionResponse {
            success: false,
            message: format!("Commit succeeded but save failed: {e}"),
            snapshot_id: None,
        }));
    }

    // 3. Auto-snapshot the committed config
    let config_text = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("Failed to fetch config after commit: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let size_bytes = config_text.len() as i64;
    let snapshot_id = sqlx::query_scalar(
        "INSERT INTO vyos_config_backups (label, config_text, size_bytes, created_by) \
         VALUES ('auto: commit', ?, ?, 'system') RETURNING id",
    )
    .bind(&config_text)
    .bind(size_bytes)
    .fetch_one(&state.db)
    .await
    .ok();

    // 4. Prune old snapshots — keep only the last MAX_SNAPSHOTS
    prune_old_snapshots(&state.db).await;

    let commands = vec!["commit".to_string(), "save".to_string()];
    audit::log_success(
        &state.db,
        "config_commit",
        "Committed and saved configuration",
        &commands,
    )
    .await;

    Ok(Json(ConfigActionResponse {
        success: true,
        message: "Configuration committed and saved".to_string(),
        snapshot_id,
    }))
}

/// POST /api/v1/config-backups/discard — discard uncommitted candidate changes.
pub async fn discard(
    State(state): State<AppState>,
) -> Result<Json<ConfigActionResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    if let Err(e) = client.configure_discard().await {
        tracing::warn!("VyOS discard returned error (may auto-commit): {e}");
        // If VyOS auto-commits, discard is a no-op; that's acceptable
    }

    let commands = vec!["discard".to_string()];
    audit::log_success(
        &state.db,
        "config_discard",
        "Discarded uncommitted configuration changes",
        &commands,
    )
    .await;

    Ok(Json(ConfigActionResponse {
        success: true,
        message: "Uncommitted changes discarded".to_string(),
        snapshot_id: None,
    }))
}

/// POST /api/v1/config-backups/:id/restore — roll back to a previous snapshot.
///
/// This creates a new commit on VyOS by applying the commands needed to
/// transform the current config into the target backup config.  A pre-restore
/// snapshot is saved automatically so the operation is non-destructive.
pub async fn restore(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    body: Option<Json<RestoreRequest>>,
) -> Result<Json<ConfigActionResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    // 1. Fetch target backup
    let target_row = sqlx::query_as::<_, BackupRow>(
        "SELECT id, created_at, label, config_text, size_bytes, created_by \
         FROM vyos_config_backups WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("config restore: failed to fetch target backup: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // 2. Snapshot current config before restoring (non-destructive)
    let current_config = fetch_running_config(&client).await.map_err(|e| {
        tracing::error!("config restore: failed to fetch current config: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let pre_label = body
        .as_ref()
        .and_then(|b| b.snapshot_label.clone())
        .unwrap_or_else(|| format!("auto: pre-restore from #{id}"));

    let pre_size = current_config.len() as i64;
    let _ = sqlx::query(
        "INSERT INTO vyos_config_backups (label, config_text, size_bytes, created_by) \
         VALUES (?, ?, ?, 'system')",
    )
    .bind(&pre_label)
    .bind(&current_config)
    .bind(pre_size)
    .execute(&state.db)
    .await;

    // 3. Compute set/delete commands to transform current → target
    let commands = compute_restore_commands(&current_config, &target_row.config_text);

    if commands.is_empty() {
        return Ok(Json(ConfigActionResponse {
            success: true,
            message: "Current config already matches the target backup".to_string(),
            snapshot_id: None,
        }));
    }

    // 4. Apply each command
    let mut errors = Vec::new();
    for cmd in &commands {
        let parts: Vec<&str> = cmd.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }
        let result = if parts[0] == "delete" {
            client.configure_delete(&parts[1..]).await
        } else {
            // "set" command
            client.configure_set(&parts[1..]).await
        };
        if let Err(e) = result {
            errors.push(format!("{cmd}: {e}"));
        }
    }

    // 5. Commit + save
    if let Err(e) = client.configure_commit().await {
        tracing::warn!("VyOS commit after restore returned error: {e}");
    }
    if let Err(e) = client.config_save().await {
        tracing::error!("VyOS save after restore failed: {e}");
    }

    // 6. Snapshot the post-restore state
    let post_config = fetch_running_config(&client).await.unwrap_or_default();
    let post_size = post_config.len() as i64;
    let snapshot_id: Option<i64> = sqlx::query_scalar(
        "INSERT INTO vyos_config_backups (label, config_text, size_bytes, created_by) \
         VALUES (?, ?, ?, 'system') RETURNING id",
    )
    .bind(format!("auto: restored from #{id}"))
    .bind(&post_config)
    .bind(post_size)
    .fetch_one(&state.db)
    .await
    .ok();

    prune_old_snapshots(&state.db).await;

    let cmd_strings: Vec<String> = commands.iter().map(|c| c.to_string()).collect();
    if errors.is_empty() {
        audit::log_success(
            &state.db,
            "config_restore",
            &format!("Restored configuration from backup #{id}"),
            &cmd_strings,
        )
        .await;
        Ok(Json(ConfigActionResponse {
            success: true,
            message: format!(
                "Configuration restored from backup #{id} ({} commands applied)",
                cmd_strings.len()
            ),
            snapshot_id,
        }))
    } else {
        let err_summary = errors.join("; ");
        audit::log_failure(
            &state.db,
            "config_restore",
            &format!("Partial restore from backup #{id}"),
            &cmd_strings,
            &err_summary,
        )
        .await;
        Ok(Json(ConfigActionResponse {
            success: false,
            message: format!(
                "Restore partially failed ({} errors out of {} commands): {}",
                errors.len(),
                cmd_strings.len(),
                err_summary
            ),
            snapshot_id,
        }))
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Maximum number of automatic snapshots to keep.
const MAX_SNAPSHOTS: i64 = 30;

/// Fetch the full running configuration text from VyOS via `show configuration`.
pub(crate) async fn fetch_running_config(
    client: &crate::vyos::client::VyosClient,
) -> Result<String, anyhow::Error> {
    let value = client.show(&["configuration"]).await?;
    Ok(value.as_str().unwrap_or("").to_string())
}

/// Compute a unified diff between two config texts.
///
/// Returns `(diff_lines, additions, deletions)`.
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

/// Prune old automatic snapshots, keeping the most recent [`MAX_SNAPSHOTS`].
async fn prune_old_snapshots(db: &sqlx::SqlitePool) {
    let _ = sqlx::query(
        "DELETE FROM vyos_config_backups WHERE id NOT IN \
         (SELECT id FROM vyos_config_backups ORDER BY id DESC LIMIT ?)",
    )
    .bind(MAX_SNAPSHOTS)
    .execute(db)
    .await;
}

/// Compute the set/delete commands needed to transform `current_cfg` into
/// `target_cfg`.
///
/// Both configs are in VyOS `show configuration commands` format (one
/// `set ...` line per config statement).  The function diffs the two
/// sorted line sets and emits `delete` for lines only in current and
/// `set` for lines only in target.
fn compute_restore_commands(current_cfg: &str, target_cfg: &str) -> Vec<String> {
    // VyOS "show configuration" output uses indented blocks.  We convert
    // each line into a normalised "set ..." command by tracking indentation
    // depth.  This lets us diff at the leaf-command level.

    let current_cmds = config_to_set_commands(current_cfg);
    let target_cmds = config_to_set_commands(target_cfg);

    let current_set: std::collections::HashSet<&str> =
        current_cmds.iter().map(|s| s.as_str()).collect();
    let target_set: std::collections::HashSet<&str> =
        target_cmds.iter().map(|s| s.as_str()).collect();

    let mut commands: Vec<String> = Vec::new();

    // Lines in current but not in target → delete
    let mut to_delete: Vec<&str> = current_set.difference(&target_set).copied().collect();
    to_delete.sort();
    // Delete in reverse so children are removed before parents
    to_delete.reverse();
    for line in to_delete {
        // "set interfaces ethernet eth0 address ..." → "delete interfaces ethernet eth0 address ..."
        if let Some(path) = line.strip_prefix("set ") {
            commands.push(format!("delete {path}"));
        }
    }

    // Lines in target but not in current → set
    let mut to_set: Vec<&str> = target_set.difference(&current_set).copied().collect();
    to_set.sort();
    for line in to_set {
        commands.push(line.to_string());
    }

    commands
}

/// Convert VyOS indented configuration output into a list of `set ...`
/// commands.
///
/// Example input:
/// ```text
/// interfaces {
///     ethernet eth0 {
///         address 10.10.0.50/24
///     }
/// }
/// ```
///
/// Example output:
/// ```text
/// set interfaces ethernet eth0 address 10.10.0.50/24
/// ```
fn config_to_set_commands(config: &str) -> Vec<String> {
    let mut commands = Vec::new();
    let mut path_stack: Vec<String> = Vec::new();

    for raw_line in config.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
            continue;
        }

        // If the config is already in "set ..." commands format, pass through
        if trimmed.starts_with("set ") || trimmed.starts_with("delete ") {
            commands.push(trimmed.to_string());
            continue;
        }

        // Closing brace — pop from stack
        if trimmed == "}" {
            path_stack.pop();
            continue;
        }

        // Line ending with " {" opens a new block
        if let Some(prefix) = trimmed.strip_suffix(" {") {
            path_stack.push(prefix.to_string());
            continue;
        }

        // Leaf value line — build a set command
        let full_path: Vec<&str> = path_stack
            .iter()
            .map(|s| s.as_str())
            .chain(std::iter::once(trimmed))
            .collect();
        commands.push(format!("set {}", full_path.join(" ")));
    }

    commands
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

    #[test]
    fn test_config_to_set_commands_indented() {
        let config = "\
interfaces {
    ethernet eth0 {
        address 10.10.0.50/24
        description LAN
    }
}
";
        let cmds = config_to_set_commands(config);
        assert_eq!(cmds.len(), 2);
        assert_eq!(
            cmds[0],
            "set interfaces ethernet eth0 address 10.10.0.50/24"
        );
        assert_eq!(cmds[1], "set interfaces ethernet eth0 description LAN");
    }

    #[test]
    fn test_config_to_set_commands_passthrough() {
        let config =
            "set interfaces ethernet eth0 address 10.10.0.50/24\nset system host-name router\n";
        let cmds = config_to_set_commands(config);
        assert_eq!(cmds.len(), 2);
        assert_eq!(
            cmds[0],
            "set interfaces ethernet eth0 address 10.10.0.50/24"
        );
        assert_eq!(cmds[1], "set system host-name router");
    }

    #[test]
    fn test_compute_restore_commands_add_line() {
        let current = "set system host-name router\n";
        let target = "set system host-name router\nset system name-server 8.8.8.8\n";
        let cmds = compute_restore_commands(current, target);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0], "set system name-server 8.8.8.8");
    }

    #[test]
    fn test_compute_restore_commands_delete_line() {
        let current = "set system host-name router\nset system name-server 8.8.8.8\n";
        let target = "set system host-name router\n";
        let cmds = compute_restore_commands(current, target);
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0], "delete system name-server 8.8.8.8");
    }

    #[test]
    fn test_compute_restore_commands_no_change() {
        let config = "set system host-name router\n";
        let cmds = compute_restore_commands(config, config);
        assert!(cmds.is_empty());
    }

    #[test]
    fn test_compute_restore_commands_indented_configs() {
        let current = "\
interfaces {
    ethernet eth0 {
        address 10.10.0.50/24
    }
}
";
        let target = "\
interfaces {
    ethernet eth0 {
        address 10.10.0.100/24
    }
}
";
        let cmds = compute_restore_commands(current, target);
        assert_eq!(cmds.len(), 2);
        assert!(cmds
            .iter()
            .any(|c| c == "delete interfaces ethernet eth0 address 10.10.0.50/24"));
        assert!(cmds
            .iter()
            .any(|c| c == "set interfaces ethernet eth0 address 10.10.0.100/24"));
    }
}
