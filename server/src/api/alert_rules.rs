use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::AppState;

/// Valid rule_type values.
const VALID_RULE_TYPES: &[&str] = &["device_offline", "bandwidth_threshold", "new_device"];

/// An alert rule as returned by the API.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlertRule {
    pub id: String,
    pub rule_type: String,
    pub enabled: bool,
    pub threshold_value: Option<i64>,
    pub notify_telegram: bool,
    pub notify_email: bool,
    pub notify_in_app: bool,
    pub position: i64,
    pub hit_count: i64,
    pub schedule_days: Option<String>,
    pub schedule_start_time: Option<String>,
    pub schedule_end_time: Option<String>,
    pub connection_limit: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating an alert rule.
#[derive(Debug, Deserialize)]
pub struct CreateAlertRuleRequest {
    pub rule_type: String,
    pub enabled: Option<bool>,
    pub threshold_value: Option<i64>,
    pub notify_telegram: Option<bool>,
    pub notify_email: Option<bool>,
    pub notify_in_app: Option<bool>,
    pub schedule_days: Option<String>,
    pub schedule_start_time: Option<String>,
    pub schedule_end_time: Option<String>,
    pub connection_limit: Option<i64>,
}

/// Request body for updating an alert rule.
#[derive(Debug, Deserialize)]
pub struct UpdateAlertRuleRequest {
    pub enabled: Option<bool>,
    pub threshold_value: Option<i64>,
    pub notify_telegram: Option<bool>,
    pub notify_email: Option<bool>,
    pub notify_in_app: Option<bool>,
    pub schedule_days: Option<String>,
    pub schedule_start_time: Option<String>,
    pub schedule_end_time: Option<String>,
    pub connection_limit: Option<i64>,
}

/// Request body for reordering alert rules.
#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub rule_ids: Vec<String>,
}

const SELECT_COLS: &str = "id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, position, hit_count, schedule_days, schedule_start_time, schedule_end_time, connection_limit, created_at, updated_at";

fn rule_from_row(row: sqlx::sqlite::SqliteRow) -> Result<AlertRule, sqlx::Error> {
    Ok(AlertRule {
        id: row.try_get("id")?,
        rule_type: row.try_get("rule_type")?,
        enabled: row.try_get::<i32, _>("enabled").unwrap_or(1) != 0,
        threshold_value: row.try_get("threshold_value").unwrap_or(None),
        notify_telegram: row.try_get::<i32, _>("notify_telegram").unwrap_or(1) != 0,
        notify_email: row.try_get::<i32, _>("notify_email").unwrap_or(0) != 0,
        notify_in_app: row.try_get::<i32, _>("notify_in_app").unwrap_or(1) != 0,
        position: row.try_get::<i64, _>("position").unwrap_or(0),
        hit_count: row.try_get::<i64, _>("hit_count").unwrap_or(0),
        schedule_days: row.try_get("schedule_days").unwrap_or(None),
        schedule_start_time: row.try_get("schedule_start_time").unwrap_or(None),
        schedule_end_time: row.try_get("schedule_end_time").unwrap_or(None),
        connection_limit: row.try_get("connection_limit").unwrap_or(None),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/alert-rules — list all alert rules.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<AlertRule>>, StatusCode> {
    let sql = format!(
        "SELECT {} FROM alert_rules ORDER BY position ASC, created_at ASC",
        SELECT_COLS
    );
    let rows = sqlx::query(&sql).fetch_all(&state.db).await.map_err(|e| {
        error!("Failed to list alert rules: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rules: Vec<AlertRule> = rows
        .into_iter()
        .filter_map(|r| rule_from_row(r).ok())
        .collect();

    Ok(Json(rules))
}

/// POST /api/v1/alert-rules — create a new alert rule.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateAlertRuleRequest>,
) -> Result<(StatusCode, Json<AlertRule>), (StatusCode, String)> {
    let rule_type = body.rule_type.trim();
    if !VALID_RULE_TYPES.contains(&rule_type) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "invalid rule_type '{}'. Valid types: {}",
                rule_type,
                VALID_RULE_TYPES.join(", ")
            ),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let enabled = body.enabled.unwrap_or(true);
    let notify_telegram = body.notify_telegram.unwrap_or(true);
    let notify_email = body.notify_email.unwrap_or(false);
    let notify_in_app = body.notify_in_app.unwrap_or(true);

    // Assign position as max(position) + 1
    let max_pos: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(position), -1) FROM alert_rules")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let position = max_pos + 1;

    sqlx::query(
        "INSERT INTO alert_rules (id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, position, schedule_days, schedule_start_time, schedule_end_time, connection_limit) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(rule_type)
    .bind(enabled as i32)
    .bind(body.threshold_value)
    .bind(notify_telegram as i32)
    .bind(notify_email as i32)
    .bind(notify_in_app as i32)
    .bind(position)
    .bind(&body.schedule_days)
    .bind(&body.schedule_start_time)
    .bind(&body.schedule_end_time)
    .bind(body.connection_limit)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create alert rule: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    info!(rule_id = %id, rule_type = rule_type, "Alert rule created");

    let sql = format!("SELECT {} FROM alert_rules WHERE id = ?", SELECT_COLS);
    let row = sqlx::query(&sql)
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to fetch created alert rule: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?;

    let rule = rule_from_row(row).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse row: {e}"),
        )
    })?;

    Ok((StatusCode::CREATED, Json(rule)))
}

/// PUT /api/v1/alert-rules/:id — update an alert rule.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAlertRuleRequest>,
) -> Result<Json<AlertRule>, StatusCode> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM alert_rules WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to check alert rule existence: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .is_some();

    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(enabled) = body.enabled {
        sets.push("enabled = ?".to_string());
        binds.push((enabled as i32).to_string());
    }
    if let Some(threshold) = body.threshold_value {
        sets.push("threshold_value = ?".to_string());
        binds.push(threshold.to_string());
    }
    if let Some(telegram) = body.notify_telegram {
        sets.push("notify_telegram = ?".to_string());
        binds.push((telegram as i32).to_string());
    }
    if let Some(email) = body.notify_email {
        sets.push("notify_email = ?".to_string());
        binds.push((email as i32).to_string());
    }
    if let Some(in_app) = body.notify_in_app {
        sets.push("notify_in_app = ?".to_string());
        binds.push((in_app as i32).to_string());
    }
    if let Some(ref days) = body.schedule_days {
        sets.push("schedule_days = ?".to_string());
        binds.push(days.clone());
    }
    if let Some(ref start) = body.schedule_start_time {
        sets.push("schedule_start_time = ?".to_string());
        binds.push(start.clone());
    }
    if let Some(ref end) = body.schedule_end_time {
        sets.push("schedule_end_time = ?".to_string());
        binds.push(end.clone());
    }
    if let Some(limit) = body.connection_limit {
        sets.push("connection_limit = ?".to_string());
        binds.push(limit.to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE alert_rules SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await.map_err(|e| {
        error!("Failed to update alert rule {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!(rule_id = %id, "Alert rule updated");

    let select_sql = format!("SELECT {} FROM alert_rules WHERE id = ?", SELECT_COLS);
    let row = sqlx::query(&select_sql)
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to fetch updated alert rule: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let rule = rule_from_row(row).map_err(|e| {
        error!("Failed to parse alert rule row: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rule))
}

/// DELETE /api/v1/alert-rules/:id — delete an alert rule.
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM alert_rules WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            info!(rule_id = %id, "Alert rule deleted");
            StatusCode::NO_CONTENT
        }
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete alert rule {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// PUT /api/v1/alert-rules/reorder — reorder alert rules by position.
pub async fn reorder(
    State(state): State<AppState>,
    Json(body): Json<ReorderRequest>,
) -> Result<Json<Vec<AlertRule>>, StatusCode> {
    for (i, id) in body.rule_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE alert_rules SET position = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(i as i64)
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to reorder alert rule {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    info!(count = body.rule_ids.len(), "Alert rules reordered");

    let sql = format!(
        "SELECT {} FROM alert_rules ORDER BY position ASC, created_at ASC",
        SELECT_COLS
    );
    let rows = sqlx::query(&sql).fetch_all(&state.db).await.map_err(|e| {
        error!("Failed to list alert rules after reorder: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rules: Vec<AlertRule> = rows
        .into_iter()
        .filter_map(|r| rule_from_row(r).ok())
        .collect();

    Ok(Json(rules))
}

/// GET /api/v1/alert-rules/export — export all rules as JSON.
pub async fn export(State(state): State<AppState>) -> Result<Json<Vec<AlertRule>>, StatusCode> {
    list(State(state)).await
}

/// POST /api/v1/alert-rules/import — import rules from JSON (replaces all).
pub async fn import(
    State(state): State<AppState>,
    Json(body): Json<Vec<CreateAlertRuleRequest>>,
) -> Result<Json<Vec<AlertRule>>, StatusCode> {
    // Validate all rule types first
    for req in &body {
        let rule_type = req.rule_type.trim();
        if !VALID_RULE_TYPES.contains(&rule_type) {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    // Delete existing rules
    sqlx::query("DELETE FROM alert_rules")
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to clear alert rules for import: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Insert imported rules
    for (i, req) in body.iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        let enabled = req.enabled.unwrap_or(true);
        let notify_telegram = req.notify_telegram.unwrap_or(true);
        let notify_email = req.notify_email.unwrap_or(false);
        let notify_in_app = req.notify_in_app.unwrap_or(true);

        sqlx::query(
            "INSERT INTO alert_rules (id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, position, schedule_days, schedule_start_time, schedule_end_time, connection_limit) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(req.rule_type.trim())
        .bind(enabled as i32)
        .bind(req.threshold_value)
        .bind(notify_telegram as i32)
        .bind(notify_email as i32)
        .bind(notify_in_app as i32)
        .bind(i as i64)
        .bind(&req.schedule_days)
        .bind(&req.schedule_start_time)
        .bind(&req.schedule_end_time)
        .bind(req.connection_limit)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to import alert rule: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    info!(count = body.len(), "Alert rules imported");

    list(State(state)).await
}

#[cfg(test)]
mod tests {
    use crate::db;

    #[tokio::test]
    async fn test_alert_rule_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO alert_rules (id, rule_type, enabled, threshold_value, notify_telegram, notify_in_app) \
             VALUES (?, 'device_offline', 1, 5, 1, 1)",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM alert_rules")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(count, 1);

        // Update
        sqlx::query("UPDATE alert_rules SET threshold_value = 10, updated_at = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Update failed");

        let threshold: i64 =
            sqlx::query_scalar("SELECT threshold_value FROM alert_rules WHERE id = ?")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .expect("Query failed");
        assert_eq!(threshold, 10);

        // Delete
        sqlx::query("DELETE FROM alert_rules WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Delete failed");

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM alert_rules")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn test_alert_rule_types_constraint() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        // Valid types should work
        for rule_type in &["device_offline", "bandwidth_threshold", "new_device"] {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO alert_rules (id, rule_type) VALUES (?, ?)")
                .bind(&id)
                .bind(rule_type)
                .execute(&pool)
                .await
                .unwrap_or_else(|e| panic!("Insert for type '{rule_type}' should succeed: {e}"));
        }

        // Invalid type should fail
        let result =
            sqlx::query("INSERT INTO alert_rules (id, rule_type) VALUES ('bad', 'invalid_type')")
                .execute(&pool)
                .await;

        assert!(
            result.is_err(),
            "Invalid rule_type should fail CHECK constraint"
        );
    }

    #[tokio::test]
    async fn test_alert_rule_position_and_hit_count() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO alert_rules (id, rule_type, position, hit_count) VALUES (?, 'device_offline', 5, 42)",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let position: i64 = sqlx::query_scalar("SELECT position FROM alert_rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(position, 5);

        let hit_count: i64 = sqlx::query_scalar("SELECT hit_count FROM alert_rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(hit_count, 42);
    }

    #[tokio::test]
    async fn test_alert_rule_schedule_fields() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO alert_rules (id, rule_type, schedule_days, schedule_start_time, schedule_end_time, connection_limit) \
             VALUES (?, 'device_offline', '[\"mon\",\"tue\"]', '09:00', '17:00', 100)",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let days: String = sqlx::query_scalar("SELECT schedule_days FROM alert_rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(days, "[\"mon\",\"tue\"]");

        let limit: i64 =
            sqlx::query_scalar("SELECT connection_limit FROM alert_rules WHERE id = ?")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .expect("Query failed");
        assert_eq!(limit, 100);
    }
}
