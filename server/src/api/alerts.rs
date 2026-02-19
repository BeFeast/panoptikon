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
    pub created_at: String,
}

/// Query parameters for listing alerts.
#[derive(Debug, Deserialize)]
pub struct ListAlertsQuery {
    /// If true, only return unread alerts.
    pub unread_only: Option<bool>,
    /// Maximum number of alerts to return.
    pub limit: Option<i64>,
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

    let rows = if unread_only {
        sqlx::query(
            "SELECT id, type, device_id, agent_id, message, details, is_read, created_at \
             FROM alerts WHERE is_read = 0 ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query(
            "SELECT id, type, device_id, agent_id, message, details, is_read, created_at \
             FROM alerts ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&state.db)
        .await
    }
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
