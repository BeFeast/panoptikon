use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::{AppError, AppState};

/// Valid rule_type values.
const VALID_RULE_TYPES: &[&str] = &["device_offline", "bandwidth_threshold", "new_device"];

/// An alert rule as returned by the API.
#[derive(Debug, Serialize)]
pub struct AlertRule {
    pub id: String,
    pub rule_type: String,
    pub enabled: bool,
    pub threshold_value: Option<i64>,
    pub notify_telegram: bool,
    pub notify_email: bool,
    pub notify_in_app: bool,
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
}

/// Request body for updating an alert rule.
#[derive(Debug, Deserialize)]
pub struct UpdateAlertRuleRequest {
    pub enabled: Option<bool>,
    pub threshold_value: Option<i64>,
    pub notify_telegram: Option<bool>,
    pub notify_email: Option<bool>,
    pub notify_in_app: Option<bool>,
}

fn rule_from_row(row: sqlx::sqlite::SqliteRow) -> Result<AlertRule, sqlx::Error> {
    Ok(AlertRule {
        id: row.try_get("id")?,
        rule_type: row.try_get("rule_type")?,
        enabled: row.try_get::<i32, _>("enabled").unwrap_or(1) != 0,
        threshold_value: row.try_get("threshold_value").unwrap_or(None),
        notify_telegram: row.try_get::<i32, _>("notify_telegram").unwrap_or(1) != 0,
        notify_email: row.try_get::<i32, _>("notify_email").unwrap_or(0) != 0,
        notify_in_app: row.try_get::<i32, _>("notify_in_app").unwrap_or(1) != 0,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/alert-rules — list all alert rules.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<AlertRule>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, created_at, updated_at \
         FROM alert_rules ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list alert rules: {e}");
        AppError::Internal(e.to_string())
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
) -> Result<(StatusCode, Json<AlertRule>), AppError> {
    let rule_type = body.rule_type.trim();
    if !VALID_RULE_TYPES.contains(&rule_type) {
        return Err(AppError::Validation(format!(
            "invalid rule_type '{}'. Valid types: {}",
            rule_type,
            VALID_RULE_TYPES.join(", ")
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let enabled = body.enabled.unwrap_or(true);
    let notify_telegram = body.notify_telegram.unwrap_or(true);
    let notify_email = body.notify_email.unwrap_or(false);
    let notify_in_app = body.notify_in_app.unwrap_or(true);

    sqlx::query(
        "INSERT INTO alert_rules (id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(rule_type)
    .bind(enabled as i32)
    .bind(body.threshold_value)
    .bind(notify_telegram as i32)
    .bind(notify_email as i32)
    .bind(notify_in_app as i32)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create alert rule: {e}");
        AppError::Internal(format!("Database error: {e}"))
    })?;

    info!(rule_id = %id, rule_type = rule_type, "Alert rule created");

    let row = sqlx::query(
        "SELECT id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, created_at, updated_at \
         FROM alert_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created alert rule: {e}");
        AppError::Internal(format!("Database error: {e}"))
    })?;

    let rule =
        rule_from_row(row).map_err(|e| AppError::Internal(format!("Failed to parse row: {e}")))?;

    Ok((StatusCode::CREATED, Json(rule)))
}

/// PUT /api/v1/alert-rules/:id — update an alert rule.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAlertRuleRequest>,
) -> Result<Json<AlertRule>, AppError> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM alert_rules WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to check alert rule existence: {e}");
            AppError::Internal(e.to_string())
        })?
        .is_some();

    if !exists {
        return Err(AppError::NotFound);
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

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE alert_rules SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await.map_err(|e| {
        error!("Failed to update alert rule {id}: {e}");
        AppError::Internal(e.to_string())
    })?;

    info!(rule_id = %id, "Alert rule updated");

    let row = sqlx::query(
        "SELECT id, rule_type, enabled, threshold_value, notify_telegram, notify_email, notify_in_app, created_at, updated_at \
         FROM alert_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated alert rule: {e}");
        AppError::Internal(e.to_string())
    })?;

    let rule = rule_from_row(row).map_err(|e| {
        error!("Failed to parse alert rule row: {e}");
        AppError::Internal(e.to_string())
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
}
