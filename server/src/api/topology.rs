use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;

/// A single node's persisted position.
#[derive(Debug, Serialize, Deserialize)]
pub struct NodePosition {
    pub node_id: String,
    pub x: f64,
    pub y: f64,
    pub pinned: bool,
}

/// GET /api/v1/topology/positions — return all saved node positions.
pub async fn get_positions(
    State(state): State<AppState>,
) -> Result<Json<Vec<NodePosition>>, StatusCode> {
    let rows = sqlx::query_as::<_, (String, f64, f64, i32)>(
        "SELECT node_id, x, y, pinned FROM topology_positions",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch topology positions: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let positions = rows
        .into_iter()
        .map(|(node_id, x, y, pinned)| NodePosition {
            node_id,
            x,
            y,
            pinned: pinned != 0,
        })
        .collect();

    Ok(Json(positions))
}

/// Request body for saving positions — a list of node positions.
#[derive(Debug, Deserialize)]
pub struct SavePositionsRequest {
    pub positions: Vec<NodePosition>,
}

/// PUT /api/v1/topology/positions — save (upsert) node positions.
pub async fn save_positions(
    State(state): State<AppState>,
    Json(body): Json<SavePositionsRequest>,
) -> Result<StatusCode, StatusCode> {
    for pos in &body.positions {
        sqlx::query(
            "INSERT INTO topology_positions (node_id, x, y, pinned) VALUES (?, ?, ?, ?)
             ON CONFLICT(node_id) DO UPDATE SET x = excluded.x, y = excluded.y, pinned = excluded.pinned",
        )
        .bind(&pos.node_id)
        .bind(pos.x)
        .bind(pos.y)
        .bind(pos.pinned as i32)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to save topology position for '{}': {e}", pos.node_id);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/topology/positions — clear all saved positions (reset layout).
pub async fn delete_positions(State(state): State<AppState>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM topology_positions")
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to clear topology positions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
