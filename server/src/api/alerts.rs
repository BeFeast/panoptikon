use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

/// An alert as returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    #[serde(rename = "type")]
    pub alert_type: String,
    pub device_id: Option<String>,
    pub agent_id: Option<String>,
    pub message: String,
    pub details: Option<String>,
    pub is_read: bool,
    pub severity: String,
    pub acknowledged_at: Option<String>,
    pub acknowledged_by: Option<String>,
    pub created_at: String,
}

/// Query parameters for listing alerts.
#[derive(Debug, Deserialize)]
pub struct ListAlertsQuery {
    /// If true, only return unread alerts.
    pub unread_only: Option<bool>,
    /// Maximum number of alerts to return.
    pub limit: Option<i64>,
    /// Filter by status: active, acknowledged, all (default: all).
    pub status: Option<String>,
    /// Filter by severity: INFO, WARNING, CRITICAL.
    pub severity: Option<String>,
}

/// Request body for acknowledging an alert.
#[derive(Debug, Deserialize)]
pub struct AcknowledgeBody {
    pub note: Option<String>,
}

impl Alert {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            alert_type: row.try_get("type")?,
            device_id: row.try_get("device_id")?,
            agent_id: row.try_get("agent_id")?,
            message: row.try_get("message")?,
            details: row.try_get("details")?,
            is_read: row.try_get::<i32, _>("is_read").unwrap_or(0) != 0,
            severity: row
                .try_get::<String, _>("severity")
                .unwrap_or_else(|_| "WARNING".to_string()),
            acknowledged_at: row.try_get("acknowledged_at").unwrap_or(None),
            acknowledged_by: row.try_get("acknowledged_by").unwrap_or(None),
            created_at: row.try_get("created_at")?,
        })
    }
}

/// GET /api/v1/alerts — list alerts.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<ListAlertsQuery>,
) -> Result<Json<Vec<Alert>>, StatusCode> {
    let limit = params.limit.unwrap_or(50);
    let unread_only = params.unread_only.unwrap_or(false);

    // Build dynamic query with filters
    let mut conditions: Vec<String> = Vec::new();

    if unread_only {
        conditions.push("is_read = 0".to_string());
    }

    // Status filter
    match params.status.as_deref() {
        Some("active") => conditions.push("acknowledged_at IS NULL".to_string()),
        Some("acknowledged") => conditions.push("acknowledged_at IS NOT NULL".to_string()),
        _ => {} // "all" or default — no filter
    }

    // Severity filter
    if let Some(ref sev) = params.severity {
        let sev_upper = sev.to_uppercase();
        if matches!(sev_upper.as_str(), "INFO" | "WARNING" | "CRITICAL") {
            conditions.push(format!("severity = '{sev_upper}'"));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let query_str = format!(
        r#"SELECT id, type, device_id, agent_id, message, details, is_read, severity, acknowledged_at, acknowledged_by, created_at
         FROM alerts {where_clause} ORDER BY created_at DESC LIMIT ?"#
    );

    let rows = sqlx::query(&query_str)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list alerts: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let alerts: Vec<Alert> = rows
        .into_iter()
        .filter_map(|r| Alert::from_row(r).ok())
        .collect();

    Ok(Json(alerts))
}

/// POST /api/v1/alerts/:id/read — mark an alert as read.
pub async fn mark_read(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("UPDATE alerts SET is_read = 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to mark alert {id} as read: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/alerts/mark-all-read — mark all unread alerts as read.
pub async fn mark_all_read(State(state): State<AppState>) -> Result<StatusCode, StatusCode> {
    sqlx::query("UPDATE alerts SET is_read = 1 WHERE is_read = 0")
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to mark all alerts as read: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/alerts/:id/acknowledge — acknowledge an alert with an optional note.
pub async fn acknowledge(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AcknowledgeBody>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query(
        r#"UPDATE alerts SET acknowledged_at = datetime('now'), acknowledged_by = ?, is_read = 1 WHERE id = ?"#,
    )
    .bind(&body.note)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to acknowledge alert {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Query parameters for muting a device.
#[derive(Debug, Deserialize)]
pub struct MuteQuery {
    /// Hours to mute: 1, 8, 24, or 0 to unmute.
    pub hours: Option<i64>,
}

/// POST /api/v1/devices/:id/mute?hours=N — mute a device for N hours (0 to unmute).
pub async fn mute_device(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<MuteQuery>,
) -> Result<StatusCode, StatusCode> {
    let hours = params.hours.unwrap_or(1);

    let result = if hours <= 0 {
        // Unmute
        sqlx::query(r#"UPDATE devices SET muted_until = NULL WHERE id = ?"#)
            .bind(&id)
            .execute(&state.db)
            .await
    } else {
        sqlx::query(
            r#"UPDATE devices SET muted_until = datetime('now', '+' || ? || ' hours') WHERE id = ?"#,
        )
        .bind(hours)
        .bind(&id)
        .execute(&state.db)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to mute device {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Check if a device is currently muted (muted_until > now).
/// Returns true if the device is muted and alerts should be suppressed.
///
/// Accepts any sqlx executor — `&SqlitePool`, `&mut SqliteConnection`, or a
/// transaction reference (`&mut *tx`), so callers inside a transaction don't
/// need a separate pool connection.
pub async fn is_device_muted<'e, E>(executor: E, device_id: &str) -> bool
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    let result: Option<i64> = sqlx::query_scalar(
        r#"SELECT 1 FROM devices WHERE id = ? AND muted_until IS NOT NULL AND muted_until > datetime('now')"#,
    )
    .bind(device_id)
    .fetch_optional(executor)
    .await
    .unwrap_or(None);

    result.is_some()
}

/// Determine the severity level for an alert type.
pub fn severity_for_alert_type(alert_type: &str) -> &'static str {
    match alert_type {
        "new_device" => "INFO",
        "device_online" => "INFO",
        "device_offline" | "agent_offline" | "high_bandwidth" => "WARNING",
        _ => "WARNING",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> sqlx::SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: insert a test device and return its id.
    async fn insert_test_device(pool: &sqlx::SqlitePool, mac: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, first_seen_at, last_seen_at)
               VALUES (?, ?, 'test-device', ?, ?)"#,
        )
        .bind(&id)
        .bind(mac)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert a test alert and return its id.
    async fn insert_test_alert(
        pool: &sqlx::SqlitePool,
        device_id: &str,
        alert_type: &str,
        severity: &str,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO alerts (id, type, device_id, message, severity, created_at)
               VALUES (?, ?, ?, 'Test alert', ?, datetime('now'))"#,
        )
        .bind(&id)
        .bind(alert_type)
        .bind(device_id)
        .bind(severity)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[tokio::test]
    async fn test_acknowledge_alert() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:01").await;
        let alert_id = insert_test_alert(&pool, &device_id, "device_offline", "WARNING").await;

        // Acknowledge the alert
        sqlx::query(
            r#"UPDATE alerts SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?"#,
        )
        .bind("Fixed the issue")
        .bind(&alert_id)
        .execute(&pool)
        .await
        .unwrap();

        // Verify
        let row =
            sqlx::query(r#"SELECT acknowledged_at, acknowledged_by FROM alerts WHERE id = ?"#)
                .bind(&alert_id)
                .fetch_one(&pool)
                .await
                .unwrap();

        let ack_at: Option<String> = row.try_get("acknowledged_at").unwrap();
        let ack_by: Option<String> = row.try_get("acknowledged_by").unwrap();

        assert!(
            ack_at.is_some(),
            "acknowledged_at should be set after acknowledge"
        );
        assert_eq!(
            ack_by.as_deref(),
            Some("Fixed the issue"),
            "acknowledged_by should contain the note"
        );
    }

    #[tokio::test]
    async fn test_mute_device_suppresses_alerts() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:02").await;

        // Mute the device for 1 hour
        sqlx::query(r#"UPDATE devices SET muted_until = datetime('now', '+1 hours') WHERE id = ?"#)
            .bind(&device_id)
            .execute(&pool)
            .await
            .unwrap();

        // Check if device is muted
        let muted = is_device_muted(&pool, &device_id).await;
        assert!(
            muted,
            "Device should be muted after setting muted_until in the future"
        );
    }

    #[tokio::test]
    async fn test_mute_expired_allows_alerts() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:03").await;

        // Set muted_until in the past (expired)
        sqlx::query(r#"UPDATE devices SET muted_until = datetime('now', '-1 hours') WHERE id = ?"#)
            .bind(&device_id)
            .execute(&pool)
            .await
            .unwrap();

        // Check if device is muted — should NOT be
        let muted = is_device_muted(&pool, &device_id).await;
        assert!(
            !muted,
            "Device should NOT be muted when muted_until is in the past"
        );
    }

    #[tokio::test]
    async fn test_alert_severity_default() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:04").await;

        // Insert alert without specifying severity (uses DB default)
        let alert_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO alerts (id, type, device_id, message, created_at)
               VALUES (?, 'device_offline', ?, 'Test', datetime('now'))"#,
        )
        .bind(&alert_id)
        .bind(&device_id)
        .execute(&pool)
        .await
        .unwrap();

        let severity: String = sqlx::query_scalar(r#"SELECT severity FROM alerts WHERE id = ?"#)
            .bind(&alert_id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(severity, "WARNING", "Default severity should be 'WARNING'");
    }

    #[tokio::test]
    async fn test_filter_active_alerts() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:05").await;

        // Create two alerts
        let alert1 = insert_test_alert(&pool, &device_id, "device_offline", "WARNING").await;
        let _alert2 = insert_test_alert(&pool, &device_id, "new_device", "INFO").await;

        // Acknowledge alert1
        sqlx::query(
            r#"UPDATE alerts SET acknowledged_at = datetime('now'), acknowledged_by = 'test' WHERE id = ?"#,
        )
        .bind(&alert1)
        .execute(&pool)
        .await
        .unwrap();

        // Query active alerts (not acknowledged)
        let rows =
            sqlx::query(r#"SELECT id FROM alerts WHERE acknowledged_at IS NULL AND device_id = ?"#)
                .bind(&device_id)
                .fetch_all(&pool)
                .await
                .unwrap();

        assert_eq!(
            rows.len(),
            1,
            "Only one active (unacknowledged) alert should remain"
        );
        let active_id: String = rows[0].try_get("id").unwrap();
        assert_ne!(
            active_id, alert1,
            "The acknowledged alert should not appear in active filter"
        );
    }
}
