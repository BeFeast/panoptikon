use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{info, warn};

use super::AppState;

/// An agent as returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub device_id: Option<String>,
    pub name: Option<String>,
    pub platform: Option<String>,
    pub version: Option<String>,
    pub is_online: bool,
    pub last_report_at: Option<String>,
    pub created_at: String,
}

/// Request body for registering a new agent.
#[derive(Debug, Deserialize)]
pub struct RegisterAgent {
    pub name: Option<String>,
}

/// Response after registering a new agent (includes the plaintext API key).
#[derive(Debug, Serialize)]
pub struct RegisterAgentResponse {
    pub id: String,
    pub api_key: String,
}

impl Agent {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            device_id: row.try_get("device_id")?,
            name: row.try_get("name")?,
            platform: row.try_get("platform")?,
            version: row.try_get("version")?,
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
            last_report_at: row.try_get("last_report_at")?,
            created_at: row.try_get("created_at")?,
        })
    }
}

/// GET /api/v1/agents — list all agents.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Agent>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, device_id, name, platform, version, is_online, last_report_at, created_at \
         FROM agents ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list agents: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let agents: Vec<Agent> = rows
        .into_iter()
        .filter_map(|r| Agent::from_row(r).ok())
        .collect();

    Ok(Json(agents))
}

/// GET /api/v1/agents/:id — get a single agent.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Agent>, StatusCode> {
    let row = sqlx::query(
        "SELECT id, device_id, name, platform, version, is_online, last_report_at, created_at \
         FROM agents WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get agent {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let agent = Agent::from_row(row).map_err(|e| {
        tracing::error!("Failed to parse agent row: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(agent))
}

/// POST /api/v1/agents — register a new agent, returns an API key.
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterAgent>,
) -> Result<(StatusCode, Json<RegisterAgentResponse>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let api_key = format!("pnk_{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
    let api_key_hash = bcrypt::hash(&api_key, bcrypt::DEFAULT_COST).map_err(|e| {
        tracing::error!("Failed to hash API key: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query("INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&api_key_hash)
        .bind(&body.name)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to register agent: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!(agent_id = %id, "New agent registered");

    Ok((
        StatusCode::CREATED,
        Json(RegisterAgentResponse { id, api_key }),
    ))
}

/// GET /api/v1/agent/ws — WebSocket endpoint for agent connections.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(handle_agent_ws)
}

/// Handle an individual agent WebSocket connection.
async fn handle_agent_ws(mut socket: WebSocket) {
    info!("Agent WebSocket connection opened");

    // TODO: Authenticate agent via first message, then enter report loop.
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(text)) => {
                info!(len = text.len(), "Received agent report");
                // TODO: Parse report JSON, validate, store in DB.
                if socket
                    .send(Message::Text("{\"status\":\"ok\"}".into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                info!("Agent WebSocket closed");
                break;
            }
            Ok(_) => {} // Ignore binary/ping/pong for now.
            Err(e) => {
                warn!("Agent WebSocket error: {e}");
                break;
            }
        }
    }

    info!("Agent WebSocket connection terminated");
    // TODO: Mark agent offline in DB.
}
