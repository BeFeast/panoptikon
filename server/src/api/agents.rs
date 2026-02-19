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
use serde_json::json;
use sqlx::Row;
use tracing::{error, info, warn};

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

/// Agent report payload (matches the PRD).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AgentReport {
    pub agent_id: String,
    #[serde(default)]
    pub hostname: Option<String>,
    #[serde(default)]
    pub os: Option<AgentOsInfo>,
    #[serde(default)]
    pub uptime_seconds: Option<i64>,
    #[serde(default)]
    pub cpu: Option<AgentCpuInfo>,
    #[serde(default)]
    pub memory: Option<AgentMemInfo>,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AgentOsInfo {
    pub name: Option<String>,
    pub version: Option<String>,
    pub kernel: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AgentCpuInfo {
    pub count: Option<i32>,
    pub usage_percent: Option<f64>,
    pub load_avg: Option<Vec<f64>>,
}

#[derive(Debug, Deserialize)]
pub struct AgentMemInfo {
    pub total_bytes: Option<i64>,
    pub used_bytes: Option<i64>,
    pub swap_total_bytes: Option<i64>,
    pub swap_used_bytes: Option<i64>,
}

/// Agent WebSocket auth message (first message after connection).
#[derive(Debug, Deserialize)]
pub struct AgentAuthMessage {
    pub api_key: String,
    pub agent_id: String,
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
        error!("Failed to list agents: {e}");
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
        error!("Failed to get agent {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let agent = Agent::from_row(row).map_err(|e| {
        error!("Failed to parse agent row: {e}");
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
        error!("Failed to hash API key: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query("INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&api_key_hash)
        .bind(&body.name)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to register agent: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!(agent_id = %id, "New agent registered");

    Ok((
        StatusCode::CREATED,
        Json(RegisterAgentResponse { id, api_key }),
    ))
}

/// GET /api/v1/agent/ws — WebSocket endpoint for agent connections.
/// Agents authenticate via the first message (API key).
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_agent_ws(socket, state))
}

/// GET /api/v1/ws — WebSocket endpoint for UI live updates.
pub async fn ui_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ui_ws(socket, state))
}

/// Handle UI WebSocket — subscribes to broadcast events.
async fn handle_ui_ws(mut socket: WebSocket, state: AppState) {
    info!("UI WebSocket connection opened");
    let mut rx = state.ws_hub.subscribe_ui();

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(broadcast_msg) => {
                        let payload = json!({
                            "event": broadcast_msg.event,
                            "data": broadcast_msg.payload,
                        });
                        if socket.send(Message::Text(payload.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    info!("UI WebSocket connection closed");
}

/// Handle an individual agent WebSocket connection.
async fn handle_agent_ws(mut socket: WebSocket, state: AppState) {
    info!("Agent WebSocket connection opened");

    // Step 1: Wait for auth message.
    let agent_id = match wait_for_auth(&mut socket, &state).await {
        Some(id) => id,
        None => {
            warn!("Agent WebSocket: auth failed or timed out");
            let _ = socket
                .send(Message::Text(
                    json!({"error": "authentication failed"}).to_string(),
                ))
                .await;
            return;
        }
    };

    // Mark agent online in DB.
    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query("UPDATE agents SET is_online = 1, last_report_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&agent_id)
        .execute(&state.db)
        .await;

    // Register in hub.
    let mut cmd_rx = state.ws_hub.register_agent(&agent_id).await;

    // Broadcast agent online event.
    state.ws_hub.broadcast(
        "agent_online",
        json!({"agent_id": &agent_id}),
    );

    let _ = socket
        .send(Message::Text(
            json!({"status": "authenticated", "agent_id": &agent_id})
                .to_string(),
        ))
        .await;

    // Step 2: Enter report loop.
    loop {
        tokio::select! {
            // Commands from server → agent
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(command) => {
                        if socket.send(Message::Text(command)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            // Messages from agent → server
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(e) = handle_agent_report(&text, &agent_id, &state).await {
                            warn!(agent_id = %agent_id, "Failed to process agent report: {e}");
                        }
                        if socket.send(Message::Text(json!({"status":"ok"}).to_string())).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        info!(agent_id = %agent_id, "Agent WebSocket closed by client");
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Some(Ok(_)) => {} // Ignore binary/pong
                    Some(Err(e)) => {
                        warn!(agent_id = %agent_id, "Agent WebSocket error: {e}");
                        break;
                    }
                    None => break,
                }
            }
        }
    }

    // Agent disconnected — mark offline, create alert, broadcast.
    info!(agent_id = %agent_id, "Agent disconnected");
    let now = chrono::Utc::now().to_rfc3339();

    let _ = sqlx::query("UPDATE agents SET is_online = 0 WHERE id = ?")
        .bind(&agent_id)
        .execute(&state.db)
        .await;

    // Create alert for agent going offline.
    let alert_id = uuid::Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO alerts (id, type, agent_id, message, created_at) VALUES (?, 'agent_offline', ?, ?, ?)",
    )
    .bind(&alert_id)
    .bind(&agent_id)
    .bind(format!("Agent {} disconnected", &agent_id))
    .bind(&now)
    .execute(&state.db)
    .await;

    state.ws_hub.unregister_agent(&agent_id).await;
    state.ws_hub.broadcast(
        "agent_offline",
        json!({"agent_id": &agent_id}),
    );
}

/// Wait for the first message: an auth message containing the agent's API key.
async fn wait_for_auth(socket: &mut WebSocket, state: &AppState) -> Option<String> {
    // Give the agent 10 seconds to send auth.
    let timeout = tokio::time::Duration::from_secs(10);
    let msg = tokio::time::timeout(timeout, socket.recv()).await.ok()??;

    let text = match msg {
        Ok(Message::Text(t)) => t,
        _ => return None,
    };

    let auth: AgentAuthMessage = serde_json::from_str(&text).ok()?;

    // Verify the API key against the stored hash.
    let row = sqlx::query("SELECT api_key_hash FROM agents WHERE id = ?")
        .bind(&auth.agent_id)
        .fetch_optional(&state.db)
        .await
        .ok()??;

    let stored_hash: String = row.try_get("api_key_hash").ok()?;

    if bcrypt::verify(&auth.api_key, &stored_hash).unwrap_or(false) {
        Some(auth.agent_id)
    } else {
        warn!(agent_id = %auth.agent_id, "Agent API key verification failed");
        None
    }
}

/// Process an agent report message and store it in the database.
async fn handle_agent_report(
    text: &str,
    agent_id: &str,
    state: &AppState,
) -> anyhow::Result<()> {
    let report: AgentReport = serde_json::from_str(text)?;
    let now = chrono::Utc::now().to_rfc3339();

    // Update agent metadata.
    let _ = sqlx::query(
        "UPDATE agents SET last_report_at = ?, version = COALESCE(?, version) WHERE id = ?",
    )
    .bind(&now)
    .bind(&report.version)
    .bind(agent_id)
    .execute(&state.db)
    .await;

    // Insert into agent_reports.
    let os = report.os.as_ref();
    let cpu = report.cpu.as_ref();
    let mem = report.memory.as_ref();
    let load_avg = cpu.and_then(|c| c.load_avg.as_ref());

    sqlx::query(
        "INSERT INTO agent_reports \
         (agent_id, reported_at, hostname, os_name, os_version, kernel, arch, \
          uptime_secs, cpu_count, cpu_percent, load_1m, load_5m, load_15m, \
          mem_total, mem_used, swap_total, swap_used) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(agent_id)
    .bind(&now)
    .bind(&report.hostname)
    .bind(os.and_then(|o| o.name.as_deref()))
    .bind(os.and_then(|o| o.version.as_deref()))
    .bind(os.and_then(|o| o.kernel.as_deref()))
    .bind(os.and_then(|o| o.arch.as_deref()))
    .bind(report.uptime_seconds)
    .bind(cpu.and_then(|c| c.count))
    .bind(cpu.and_then(|c| c.usage_percent))
    .bind(load_avg.and_then(|l| l.first().copied()))
    .bind(load_avg.and_then(|l| l.get(1).copied()))
    .bind(load_avg.and_then(|l| l.get(2).copied()))
    .bind(mem.and_then(|m| m.total_bytes))
    .bind(mem.and_then(|m| m.used_bytes))
    .bind(mem.and_then(|m| m.swap_total_bytes))
    .bind(mem.and_then(|m| m.swap_used_bytes))
    .execute(&state.db)
    .await?;

    // Broadcast updated report to UI clients.
    state.ws_hub.broadcast(
        "agent_report",
        json!({
            "agent_id": agent_id,
            "hostname": report.hostname,
            "cpu_percent": cpu.and_then(|c| c.usage_percent),
            "mem_total": mem.and_then(|m| m.total_bytes),
            "mem_used": mem.and_then(|m| m.used_bytes),
        }),
    );

    Ok(())
}
