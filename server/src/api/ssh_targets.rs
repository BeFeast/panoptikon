use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::{AppError, AppState};

// ─── Types ───────────────────────────────────────────────

/// An SSH target as returned by the API.
#[derive(Debug, Serialize)]
pub struct SshTarget {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    /// true if a password is stored (never expose the actual value).
    pub has_password: bool,
    /// true if a private key is stored.
    pub has_private_key: bool,
    pub poll_interval_secs: i32,
    pub enabled: bool,
    pub created_at: String,
    // From latest ssh_report (if any):
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub cpu_percent: Option<f64>,
    pub mem_total: Option<i64>,
    pub mem_used: Option<i64>,
    pub disk_total: Option<i64>,
    pub disk_used: Option<i64>,
    pub uptime_seconds: Option<i64>,
    pub last_report_at: Option<String>,
    pub is_online: bool,
}

/// Request body for creating / updating an SSH target.
#[derive(Debug, Deserialize)]
pub struct SshTargetRequest {
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: i32,
    pub username: String,
    #[serde(default = "default_auth_type")]
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_secs: i32,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_port() -> i32 {
    22
}
fn default_auth_type() -> String {
    "password".to_string()
}
fn default_poll_interval() -> i32 {
    60
}
fn default_enabled() -> bool {
    true
}

/// Single SSH report as returned by the reports history endpoint.
#[derive(Debug, Serialize)]
pub struct SshReportRow {
    pub id: i64,
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub cpu_percent: Option<f64>,
    pub mem_total: Option<i64>,
    pub mem_used: Option<i64>,
    pub disk_total: Option<i64>,
    pub disk_used: Option<i64>,
    pub uptime_seconds: Option<i64>,
    pub reported_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ReportsQuery {
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    100
}

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
}

// ─── Helpers ─────────────────────────────────────────────

/// Parse a row from the SSH targets + latest report join query.
fn target_from_row(row: sqlx::sqlite::SqliteRow) -> Result<SshTarget, sqlx::Error> {
    let password: Option<String> = row.try_get("password")?;
    let private_key: Option<String> = row.try_get("private_key")?;
    let last_report_at: Option<String> = row.try_get("last_report_at").ok().flatten();

    // Target is "online" if the last report was within 3x poll_interval_secs.
    let poll_interval: i32 = row.try_get("poll_interval_secs")?;
    let is_online = match &last_report_at {
        Some(ts) => {
            if let Ok(last) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S") {
                let now = chrono::Utc::now().naive_utc();
                let elapsed = (now - last).num_seconds();
                elapsed < (poll_interval as i64) * 3
            } else {
                false
            }
        }
        None => false,
    };

    Ok(SshTarget {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        host: row.try_get("host")?,
        port: row.try_get("port")?,
        username: row.try_get("username")?,
        auth_type: row.try_get("auth_type")?,
        has_password: password.is_some(),
        has_private_key: private_key.is_some(),
        poll_interval_secs: poll_interval,
        enabled: row.try_get::<i32, _>("enabled").unwrap_or(1) != 0,
        created_at: row.try_get("created_at")?,
        hostname: row.try_get("hostname").ok().flatten(),
        os_name: row.try_get("os_name").ok().flatten(),
        os_version: row.try_get("os_version").ok().flatten(),
        cpu_percent: row.try_get("cpu_percent").ok().flatten(),
        mem_total: row.try_get("mem_total").ok().flatten(),
        mem_used: row.try_get("mem_used").ok().flatten(),
        disk_total: row.try_get("disk_total").ok().flatten(),
        disk_used: row.try_get("disk_used").ok().flatten(),
        uptime_seconds: row.try_get("uptime_seconds").ok().flatten(),
        last_report_at,
        is_online,
    })
}

const LIST_QUERY: &str = "\
    SELECT t.id, t.name, t.host, t.port, t.username, t.auth_type, t.password, t.private_key, \
           t.poll_interval_secs, t.enabled, t.created_at, \
           r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used, \
           r.disk_total, r.disk_used, r.uptime_seconds, r.reported_at AS last_report_at \
    FROM ssh_targets t \
    LEFT JOIN ssh_reports r ON r.target_id = t.id \
      AND r.id = ( \
          SELECT sr.id FROM ssh_reports sr \
          WHERE sr.target_id = t.id \
          ORDER BY sr.reported_at DESC \
          LIMIT 1 \
      ) \
    ORDER BY t.created_at DESC";

const GET_ONE_QUERY: &str = "\
    SELECT t.id, t.name, t.host, t.port, t.username, t.auth_type, t.password, t.private_key, \
           t.poll_interval_secs, t.enabled, t.created_at, \
           r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used, \
           r.disk_total, r.disk_used, r.uptime_seconds, r.reported_at AS last_report_at \
    FROM ssh_targets t \
    LEFT JOIN ssh_reports r ON r.target_id = t.id \
      AND r.id = ( \
          SELECT sr.id FROM ssh_reports sr \
          WHERE sr.target_id = t.id \
          ORDER BY sr.reported_at DESC \
          LIMIT 1 \
      ) \
    WHERE t.id = ?";

// ─── Handlers ────────────────────────────────────────────

/// GET /api/v1/ssh-targets — list all SSH targets with latest report.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<SshTarget>>, StatusCode> {
    let rows = sqlx::query(LIST_QUERY)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to list SSH targets: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let targets: Vec<SshTarget> = rows
        .into_iter()
        .filter_map(|r| {
            target_from_row(r)
                .map_err(|e| error!("Failed to parse SSH target row: {e}"))
                .ok()
        })
        .collect();

    Ok(Json(targets))
}

/// GET /api/v1/ssh-targets/:id — get a single SSH target.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SshTarget>, AppError> {
    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let target = target_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse SSH target row: {e}")))?;

    Ok(Json(target))
}

/// POST /api/v1/ssh-targets — create a new SSH target.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<SshTargetRequest>,
) -> Result<(StatusCode, Json<SshTarget>), AppError> {
    // Validate
    if body.name.trim().is_empty() {
        return Err(AppError::Validation("name is required".to_string()));
    }
    if body.host.trim().is_empty() {
        return Err(AppError::Validation("host is required".to_string()));
    }
    if body.username.trim().is_empty() {
        return Err(AppError::Validation("username is required".to_string()));
    }
    if body.auth_type != "password" && body.auth_type != "key" {
        return Err(AppError::Validation(
            "auth_type must be 'password' or 'key'".to_string(),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO ssh_targets (id, name, host, port, username, auth_type, password, private_key, poll_interval_secs, enabled) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(body.name.trim())
    .bind(body.host.trim())
    .bind(body.port)
    .bind(body.username.trim())
    .bind(&body.auth_type)
    .bind(&body.password)
    .bind(&body.private_key)
    .bind(body.poll_interval_secs)
    .bind(body.enabled as i32)
    .execute(&state.db)
    .await?;

    info!(target_id = %id, name = body.name.trim(), "SSH target created");

    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_one(&state.db)
        .await?;

    let target = target_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse SSH target row: {e}")))?;

    Ok((StatusCode::CREATED, Json(target)))
}

/// PUT /api/v1/ssh-targets/:id — update an SSH target.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SshTargetRequest>,
) -> Result<Json<SshTarget>, AppError> {
    // Verify it exists.
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM ssh_targets WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .is_some();

    if !exists {
        return Err(AppError::NotFound);
    }

    // If password/key is None in the request, keep existing values.
    // If it's Some(""), clear it; if Some(value), update it.
    let mut query = String::from(
        "UPDATE ssh_targets SET name = ?, host = ?, port = ?, username = ?, auth_type = ?, \
         poll_interval_secs = ?, enabled = ?",
    );

    if body.password.is_some() {
        query.push_str(", password = ?");
    }
    if body.private_key.is_some() {
        query.push_str(", private_key = ?");
    }
    query.push_str(" WHERE id = ?");

    let mut q = sqlx::query(&query)
        .bind(body.name.trim())
        .bind(body.host.trim())
        .bind(body.port)
        .bind(body.username.trim())
        .bind(&body.auth_type)
        .bind(body.poll_interval_secs)
        .bind(body.enabled as i32);

    if let Some(ref pw) = body.password {
        q = q.bind(if pw.is_empty() { None } else { Some(pw) });
    }
    if let Some(ref key) = body.private_key {
        q = q.bind(if key.is_empty() { None } else { Some(key) });
    }
    q = q.bind(&id);

    q.execute(&state.db).await?;

    info!(target_id = %id, "SSH target updated");

    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_one(&state.db)
        .await?;

    let target = target_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse SSH target row: {e}")))?;

    Ok(Json(target))
}

/// DELETE /api/v1/ssh-targets/:id — delete an SSH target and its reports.
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM ssh_targets WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            info!(target_id = %id, "SSH target deleted");
            StatusCode::NO_CONTENT
        }
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete SSH target {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// GET /api/v1/ssh-targets/:id/reports?limit=N — get historical SSH reports.
pub async fn list_reports(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<ReportsQuery>,
) -> Result<Json<Vec<SshReportRow>>, StatusCode> {
    let limit = params.limit.clamp(1, 500);

    let rows = sqlx::query(
        "SELECT id, hostname, os_name, os_version, cpu_percent, mem_total, mem_used, \
         disk_total, disk_used, uptime_seconds, reported_at \
         FROM ssh_reports WHERE target_id = ? ORDER BY reported_at DESC LIMIT ?",
    )
    .bind(&id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list SSH reports for {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let reports: Vec<SshReportRow> = rows
        .into_iter()
        .filter_map(|row| {
            Some(SshReportRow {
                id: row.try_get("id").ok()?,
                hostname: row.try_get("hostname").ok().flatten(),
                os_name: row.try_get("os_name").ok().flatten(),
                os_version: row.try_get("os_version").ok().flatten(),
                cpu_percent: row.try_get("cpu_percent").ok().flatten(),
                mem_total: row.try_get("mem_total").ok().flatten(),
                mem_used: row.try_get("mem_used").ok().flatten(),
                disk_total: row.try_get("disk_total").ok().flatten(),
                disk_used: row.try_get("disk_used").ok().flatten(),
                uptime_seconds: row.try_get("uptime_seconds").ok().flatten(),
                reported_at: row.try_get("reported_at").ok()?,
            })
        })
        .collect();

    Ok(Json(reports))
}

/// POST /api/v1/ssh-targets/:id/test — test SSH connection immediately.
pub async fn test_connection(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TestConnectionResponse>, AppError> {
    let row = sqlx::query(
        "SELECT host, port, username, auth_type, password, private_key FROM ssh_targets WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let host: String = row.try_get("host")?;
    let port: i32 = row.try_get("port")?;
    let username: String = row.try_get("username")?;
    let auth_type: String = row.try_get("auth_type")?;
    let password: Option<String> = row.try_get("password")?;
    let private_key: Option<String> = row.try_get("private_key")?;

    // Run in blocking task since SSH is synchronous.
    let result = tokio::task::spawn_blocking(move || {
        match auth_type.as_str() {
            "key" => {
                if let Some(ref key) = private_key {
                    crate::ssh::collector::test_connection_key(&host, port as u16, &username, key)
                } else {
                    Err(anyhow::anyhow!("No private key configured"))
                }
            }
            _ => {
                if let Some(ref pw) = password {
                    crate::ssh::collector::test_connection_password(
                        &host,
                        port as u16,
                        &username,
                        pw,
                    )
                } else {
                    Err(anyhow::anyhow!("No password configured"))
                }
            }
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Task join error: {e}")))?;

    match result {
        Ok(()) => Ok(Json(TestConnectionResponse {
            success: true,
            message: "Connection successful".to_string(),
        })),
        Err(e) => Ok(Json(TestConnectionResponse {
            success: false,
            message: format!("Connection failed: {e}"),
        })),
    }
}

#[cfg(test)]
mod tests {
    use crate::db;

    /// Verify that the ssh_targets table accepts inserts and the schema is correct.
    #[tokio::test]
    async fn test_ssh_target_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO ssh_targets (id, name, host, port, username, auth_type, password) \
             VALUES (?, 'test-server', '192.168.1.100', 22, 'root', 'password', 'secret')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ssh_targets")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(count, 1);

        // Test report insert.
        sqlx::query(
            "INSERT INTO ssh_reports (target_id, hostname, cpu_percent, mem_total, mem_used) \
             VALUES (?, 'test-host', 25.5, 8000000000, 4000000000)",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Report insert failed");

        let report_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ssh_reports")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(report_count, 1);

        // Test cascade delete.
        sqlx::query("DELETE FROM ssh_targets WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Delete failed");

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ssh_reports")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(remaining, 0, "Reports should cascade-delete with target");
    }
}
