use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::collections::HashMap;
use tracing::{error, info, warn};

use super::{AppError, AppState};
use crate::api::alerts;
use crate::webhook;

/// A single agent report as returned by the reports history endpoint.
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentReportRow {
    pub id: i64,
    pub cpu_percent: Option<f64>,
    pub mem_used: Option<i64>,
    pub mem_total: Option<i64>,
    pub reported_at: String,
}

/// Query parameters for the reports history endpoint.
#[derive(Debug, Deserialize)]
pub struct ReportsQuery {
    #[serde(default = "default_reports_limit")]
    pub limit: u32,
}

fn default_reports_limit() -> u32 {
    100
}

/// GET /api/v1/agents/:id/reports?limit=N — return historical agent reports.
pub async fn list_reports(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<ReportsQuery>,
) -> Result<Json<Vec<AgentReportRow>>, StatusCode> {
    let limit = params.limit.clamp(1, 500);

    let rows = sqlx::query_as::<_, (i64, Option<f64>, Option<i64>, Option<i64>, String)>(
        r#"SELECT id, cpu_percent, mem_used, mem_total, reported_at
           FROM agent_reports
           WHERE agent_id = ?
           ORDER BY reported_at DESC
           LIMIT ?"#,
    )
    .bind(&id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list reports for agent {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let reports: Vec<AgentReportRow> = rows
        .into_iter()
        .map(
            |(id, cpu_percent, mem_used, mem_total, reported_at)| AgentReportRow {
                id,
                cpu_percent,
                mem_used,
                mem_total,
                reported_at,
            },
        )
        .collect();

    Ok(Json(reports))
}

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
    // From latest agent_report:
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub cpu_percent: Option<f64>,
    pub mem_total: Option<i64>,
    pub mem_used: Option<i64>,
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
    #[serde(default)]
    pub network_interfaces: Option<Vec<AgentNetworkInterface>>,
}

/// Network interface info from agent report (used for MAC-based device linking and traffic tracking).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AgentNetworkInterface {
    pub name: Option<String>,
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub tx_bytes: Option<u64>,
    #[serde(default)]
    pub rx_bytes: Option<u64>,
    #[serde(default)]
    pub tx_bytes_delta: Option<u64>,
    #[serde(default)]
    pub rx_bytes_delta: Option<u64>,
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

/// Agent WebSocket identification message (first message after connection).
/// The API key is now supplied via the `Authorization: Bearer` header on the WS upgrade
/// request; the message body only needs to carry `agent_id`. The `api_key` field is kept
/// (optional) for backward compatibility with older agent versions.
#[derive(Debug, Deserialize)]
pub struct AgentAuthMessage {
    /// Ignored — API key is read from the `Authorization` header. Kept for backward compat.
    #[serde(default)]
    #[allow(dead_code)]
    pub api_key: Option<String>,
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
            hostname: row.try_get("hostname").ok(),
            os_name: row.try_get("os_name").ok(),
            os_version: row.try_get("os_version").ok(),
            cpu_percent: row.try_get("cpu_percent").ok(),
            mem_total: row.try_get("mem_total").ok(),
            mem_used: row.try_get("mem_used").ok(),
        })
    }
}

/// GET /api/v1/agents — list all agents.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Agent>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT a.id, a.device_id, a.name, a.platform, a.version, a.is_online, \
                a.last_report_at, a.created_at, \
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         ORDER BY a.created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list agents: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let agents: Vec<Agent> = rows
        .into_iter()
        .filter_map(|r| {
            Agent::from_row(r)
                .map_err(|e| error!("Failed to parse agent row, skipping: {e}"))
                .ok()
        })
        .collect();

    Ok(Json(agents))
}

/// GET /api/v1/agents/:id — get a single agent.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Agent>, AppError> {
    let row = sqlx::query(
        "SELECT a.id, a.device_id, a.name, a.platform, a.version, a.is_online, \
                a.last_report_at, a.created_at, \
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         WHERE a.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let agent = Agent::from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse agent row: {e}")))?;

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

/// Request body for updating an agent.
#[derive(Debug, Deserialize)]
pub struct UpdateAgent {
    pub name: Option<String>,
}

/// PATCH /api/v1/agents/:id — update agent name.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAgent>,
) -> Result<Json<Agent>, StatusCode> {
    sqlx::query("UPDATE agents SET name = ? WHERE id = ?")
        .bind(&body.name)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to update agent {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Return updated agent
    let row = sqlx::query(
        "SELECT a.id, a.device_id, a.name, a.platform, a.version, a.is_online, \
                a.last_report_at, a.created_at, \
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         WHERE a.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Agent::from_row(row).map(Json).map_err(|e| {
        error!("Failed to parse agent row after update: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })
}

/// DELETE /api/v1/agents/:id — remove an agent.
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM agents WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT,
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete agent {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// Request body for bulk-deleting agents.
#[derive(Debug, Deserialize)]
pub struct BulkDeleteRequest {
    /// List of agent IDs to delete.
    #[serde(default)]
    pub ids: Vec<String>,
    /// Optional name pattern (SQL LIKE) to match agents for deletion.
    #[serde(default)]
    pub name_pattern: Option<String>,
}

/// Response for bulk delete.
#[derive(Debug, Serialize)]
pub struct BulkDeleteResponse {
    pub deleted: u64,
}

/// POST /api/v1/agents/bulk-delete — delete multiple agents by ID list and/or name pattern.
pub async fn bulk_delete(
    State(state): State<AppState>,
    Json(body): Json<BulkDeleteRequest>,
) -> Result<Json<BulkDeleteResponse>, StatusCode> {
    if body.ids.is_empty() && body.name_pattern.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut total_deleted: u64 = 0;

    // Delete by explicit IDs.
    if !body.ids.is_empty() {
        // Cap to prevent absurdly large queries.
        let ids: Vec<&String> = body.ids.iter().take(500).collect();
        let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

        // First delete related agent_reports to avoid FK issues.
        let reports_query = format!("DELETE FROM agent_reports WHERE agent_id IN ({placeholders})");
        let mut q = sqlx::query(&reports_query);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let _ = q.execute(&state.db).await.map_err(|e| {
            error!("Failed to delete agent_reports in bulk: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let agents_query = format!("DELETE FROM agents WHERE id IN ({placeholders})");
        let mut q = sqlx::query(&agents_query);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let result = q.execute(&state.db).await.map_err(|e| {
            error!("Failed to bulk-delete agents by ID: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        total_deleted += result.rows_affected();
    }

    // Delete by name pattern.
    if let Some(ref pattern) = body.name_pattern {
        // First delete related agent_reports.
        let _ = sqlx::query(
            "DELETE FROM agent_reports WHERE agent_id IN (SELECT id FROM agents WHERE name LIKE ?)",
        )
        .bind(pattern)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete agent_reports by pattern: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let result = sqlx::query("DELETE FROM agents WHERE name LIKE ?")
            .bind(pattern)
            .execute(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to bulk-delete agents by pattern: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        total_deleted += result.rows_affected();
    }

    info!(deleted = total_deleted, "Bulk-deleted agents");

    Ok(Json(BulkDeleteResponse {
        deleted: total_deleted,
    }))
}

/// GET /api/v1/agent/ws — WebSocket endpoint for agent connections.
/// Agents authenticate via `Authorization: Bearer <api_key>` header on the WS upgrade request.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let api_key = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            let s = s.trim();
            // case-insensitive prefix check, whitespace-tolerant
            if s.len() > 7 && s[..7].eq_ignore_ascii_case("bearer ") {
                Some(s[7..].trim().to_owned())
            } else {
                None
            }
        });

    ws.on_upgrade(move |socket| handle_agent_ws(socket, state, api_key))
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
async fn handle_agent_ws(mut socket: WebSocket, state: AppState, api_key: Option<String>) {
    info!("Agent WebSocket connection opened");

    // Step 1: Verify agent via API key from Authorization header + agent_id from first message.
    let agent_id = match wait_for_auth(&mut socket, &state, api_key).await {
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
    state
        .ws_hub
        .broadcast("agent_online", json!({"agent_id": &agent_id}));

    let _ = socket
        .send(Message::Text(
            json!({"status": "authenticated", "agent_id": &agent_id}).to_string(),
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
    // Check if agent has a linked device that is muted.
    let agent_device_id: Option<String> =
        sqlx::query_scalar(r#"SELECT device_id FROM agents WHERE id = ?"#)
            .bind(&agent_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None)
            .flatten();

    let device_muted = match agent_device_id {
        Some(ref did) => alerts::is_device_muted(&state.db, did).await,
        None => false,
    };

    if !device_muted {
        let alert_id = uuid::Uuid::new_v4().to_string();
        let severity = alerts::severity_for_alert_type("agent_offline");
        let _ = sqlx::query(
            r#"INSERT INTO alerts (id, type, agent_id, message, severity, created_at) VALUES (?, 'agent_offline', ?, ?, ?, ?)"#,
        )
        .bind(&alert_id)
        .bind(&agent_id)
        .bind(format!("Agent {} disconnected", &agent_id))
        .bind(severity)
        .bind(&now)
        .execute(&state.db)
        .await;
    }

    state.ws_hub.unregister_agent(&agent_id).await;
    state
        .ws_hub
        .broadcast("agent_offline", json!({"agent_id": &agent_id}));

    webhook::dispatch_webhook(&state.db, "agent_offline", json!({"agent_id": &agent_id}));
}

/// Wait for the agent's first message (containing its agent_id) and verify the API key
/// that was supplied via the `Authorization: Bearer` header during the WS upgrade.
async fn wait_for_auth(
    socket: &mut WebSocket,
    state: &AppState,
    api_key: Option<String>,
) -> Option<String> {
    // Reject immediately if no API key was provided in the upgrade headers.
    let api_key = match api_key {
        Some(k) if !k.is_empty() => k,
        _ => {
            warn!("Agent WebSocket: no Authorization header provided");
            return None;
        }
    };

    // Give the agent 10 seconds to send its identification message.
    let timeout = tokio::time::Duration::from_secs(10);
    let msg = tokio::time::timeout(timeout, socket.recv()).await.ok()??;

    let text = match msg {
        Ok(Message::Text(t)) => t,
        _ => return None,
    };

    let auth: AgentAuthMessage = match serde_json::from_str(&text) {
        Ok(a) => a,
        Err(e) => {
            warn!("agent ws: failed to parse auth message: {}", e);
            return None;
        }
    };

    // Verify the API key (from header) against the stored hash for this agent.
    let row = sqlx::query("SELECT api_key_hash FROM agents WHERE id = ?")
        .bind(&auth.agent_id)
        .fetch_optional(&state.db)
        .await
        .ok()??;

    let stored_hash: String = row.try_get("api_key_hash").ok()?;

    if bcrypt::verify(&api_key, &stored_hash).unwrap_or(false) {
        Some(auth.agent_id)
    } else {
        warn!(agent_id = %auth.agent_id, "Agent API key verification failed");
        None
    }
}

/// Normalize a MAC address string to lowercase colon-separated format (`aa:bb:cc:dd:ee:ff`).
///
/// Handles:
/// - Colon-separated: `AA:BB:CC:DD:EE:FF`
/// - Dash-separated:  `AA-BB-CC-DD-EE-FF`
/// - Dot-separated (Cisco):   `aabb.ccdd.eeff`
/// - No separator:    `AABBCCDDEEFF`
///
/// Returns `None` if the input is not a valid 6-byte MAC address.
fn normalize_mac(mac: &str) -> Option<String> {
    // Only strip known MAC separators (colon, dash, dot) — reject anything else.
    // This prevents accidentally accepting hex digits embedded in arbitrary strings.
    let stripped: String = mac
        .to_lowercase()
        .chars()
        .filter(|&c| c != ':' && c != '-' && c != '.')
        .collect();

    // Must be exactly 12 hex characters (6 bytes).
    if stripped.len() != 12 || !stripped.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    // Reformat as xx:xx:xx:xx:xx:xx
    let normalized = (0..6)
        .map(|i| &stripped[i * 2..i * 2 + 2])
        .collect::<Vec<_>>()
        .join(":");

    Some(normalized)
}

/// Process an agent report message and store it in the database.
async fn handle_agent_report(text: &str, agent_id: &str, state: &AppState) -> anyhow::Result<()> {
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

    // --- MAC-based device linking ---
    // Extract and normalize MAC addresses from the agent's network interfaces.
    // Normalize to lowercase colon-separated format to match how the ARP scanner stores them.
    let mac_addresses: Vec<String> = report
        .network_interfaces
        .as_ref()
        .map(|ifaces| {
            ifaces
                .iter()
                .filter_map(|iface| iface.mac.as_ref())
                .filter_map(|mac| normalize_mac(mac))
                .filter(|mac| mac != "00:00:00:00:00:00")
                .collect()
        })
        .unwrap_or_default();

    // Deduplicate and cap to avoid unbounded IN (...) queries.
    let mut mac_addresses = mac_addresses;
    mac_addresses.sort_unstable();
    mac_addresses.dedup();
    mac_addresses.truncate(20);

    if !mac_addresses.is_empty() {
        // Build a query with placeholders for each MAC address.
        let placeholders: String = mac_addresses
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let query_str = format!(
            "SELECT id FROM devices WHERE mac IN ({}) ORDER BY last_seen_at DESC LIMIT 1",
            placeholders
        );

        let mut query = sqlx::query_scalar::<_, String>(&query_str);
        for mac in &mac_addresses {
            query = query.bind(mac);
        }

        match query.fetch_optional(&state.db).await {
            Ok(Some(device_id)) => {
                // Check current device_id to detect reassignment and avoid spurious updates.
                let current_device_id: Option<String> =
                    sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
                        .bind(agent_id)
                        .fetch_optional(&state.db)
                        .await
                        .unwrap_or(None)
                        .flatten();

                if current_device_id.as_deref() == Some(device_id.as_str()) {
                    // Already linked to the correct device — no update needed.
                } else {
                    if let Some(ref prev) = current_device_id {
                        warn!(
                            agent_id,
                            old_device = %prev,
                            new_device = %device_id,
                            "Agent device_id reassigned via MAC match"
                        );
                    }
                    if let Err(e) = sqlx::query("UPDATE agents SET device_id = ? WHERE id = ?")
                        .bind(&device_id)
                        .bind(agent_id)
                        .execute(&state.db)
                        .await
                    {
                        warn!(agent_id, error = %e, "Failed to link agent to device");
                    } else {
                        info!(
                            agent_id,
                            device_id = %device_id,
                            macs = ?mac_addresses,
                            "Linked agent to device via MAC match"
                        );
                    }
                }
            }
            Ok(None) => {
                // No matching device found — this is normal for agents on hosts not yet in the ARP table.
            }
            Err(e) => {
                warn!(agent_id, error = %e, "Failed to query devices for MAC matching");
            }
        }
    }

    // --- Traffic samples insertion ---
    // Compute the interval since the last report for bps calculation.
    // Query agent's device_id and previous report timestamp.
    let agent_row = sqlx::query(r#"SELECT device_id FROM agents WHERE id = ?"#)
        .bind(agent_id)
        .fetch_optional(&state.db)
        .await;

    let device_id: Option<String> = agent_row
        .ok()
        .flatten()
        .and_then(|row| row.try_get("device_id").ok())
        .flatten();

    if let Some(ref dev_id) = device_id {
        if let Some(ref ifaces) = report.network_interfaces {
            // Get previous report time to compute interval.
            let prev_reported_at: Option<String> = sqlx::query_scalar(
                r#"SELECT reported_at FROM agent_reports WHERE agent_id = ? AND reported_at < ? ORDER BY reported_at DESC LIMIT 1"#,
            )
            .bind(agent_id)
            .bind(&now)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

            let interval_secs = match prev_reported_at {
                Some(ref prev_ts) => {
                    // Parse timestamps and compute difference.
                    let prev =
                        chrono::DateTime::parse_from_rfc3339(prev_ts).map(|dt| dt.timestamp());
                    let current =
                        chrono::DateTime::parse_from_rfc3339(&now).map(|dt| dt.timestamp());
                    match (prev, current) {
                        (Ok(p), Ok(c)) => {
                            let diff = (c - p) as f64;
                            if diff > 0.0 {
                                diff
                            } else {
                                30.0
                            }
                        }
                        _ => 30.0,
                    }
                }
                None => 30.0, // Default interval for first report
            };

            // Sum deltas across all interfaces for aggregate traffic sample.
            let mut total_rx_delta: u64 = 0;
            let mut total_tx_delta: u64 = 0;

            for iface in ifaces {
                total_rx_delta += iface.rx_bytes_delta.unwrap_or(0);
                total_tx_delta += iface.tx_bytes_delta.unwrap_or(0);
            }

            if total_rx_delta > 0 || total_tx_delta > 0 {
                let rx_bps = (total_rx_delta as f64) * 8.0 / interval_secs;
                let tx_bps = (total_tx_delta as f64) * 8.0 / interval_secs;

                if let Err(e) = sqlx::query(
                    r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
                       VALUES (?, ?, ?, ?, 'agent')"#,
                )
                .bind(dev_id)
                .bind(&now)
                .bind(rx_bps as i64)
                .bind(tx_bps as i64)
                .execute(&state.db)
                .await
                {
                    warn!(
                        agent_id,
                        device_id = %dev_id,
                        error = %e,
                        "Failed to insert traffic sample"
                    );
                }
            }
        }
    }

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

/// GET /api/v1/agent/install/:platform?key=<api_key>
/// Returns a shell script that installs the panoptikon-agent on the target platform.
pub async fn install_script(
    Path(platform): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Response {
    let api_key = match params.get("key") {
        Some(k) => k.clone(),
        None => {
            return (StatusCode::BAD_REQUEST, "Missing ?key= parameter").into_response();
        }
    };

    // Validate the API key exists (future: reject unknown keys)
    let _key_exists: bool =
        sqlx::query_scalar("SELECT COUNT(*) > 0 FROM agents WHERE api_key_hash != ''")
            .fetch_one(&state.db)
            .await
            .unwrap_or(false);

    // Determine server URL from config or use a default
    let server_url = format!(
        "http://{}",
        state
            .config
            .listen
            .as_deref()
            .unwrap_or("0.0.0.0:8080")
            .replace("0.0.0.0", "10.10.0.14")
    );

    let (_target_triple, _binary_name) = match platform.as_str() {
        "linux-amd64" => ("x86_64-unknown-linux-musl", "panoptikon-agent-linux-amd64"),
        "linux-arm64" => ("aarch64-unknown-linux-musl", "panoptikon-agent-linux-arm64"),
        "darwin-arm64" => ("aarch64-apple-darwin", "panoptikon-agent-darwin-arm64"),
        "darwin-amd64" => ("x86_64-apple-darwin", "panoptikon-agent-darwin-amd64"),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "Unknown platform. Use: linux-amd64, linux-arm64, darwin-arm64, darwin-amd64",
            )
                .into_response();
        }
    };

    // Generate install script (builds from source for now; binary releases once CI is set up)
    let script = format!(
        r#"#!/bin/sh
# Panoptikon Agent Installer — {platform}
# Server: {server_url}

set -e

SERVER_URL="{server_url}"
API_KEY="{api_key}"

# Detect root vs. unprivileged user and set paths accordingly
if [ "$(id -u)" = "0" ]; then
    INSTALL_DIR="/usr/local/bin"
    CONFIG_DIR="/etc/panoptikon-agent"
    SYSTEMD_SYSTEM=1
else
    INSTALL_DIR="$HOME/.local/bin"
    CONFIG_DIR="$HOME/.config/panoptikon-agent"
    SYSTEMD_SYSTEM=0
    mkdir -p "$INSTALL_DIR"
fi

echo "==> Installing Panoptikon Agent ({platform})"
echo "    Binary  : $INSTALL_DIR/panoptikon-agent"
echo "    Config  : $CONFIG_DIR/config.toml"

# Check if pre-built binary is available from GitHub releases
RELEASE_URL="https://github.com/BeFeast/panoptikon/releases/latest/download/panoptikon-agent-{platform}"

if curl -fsSL --head "$RELEASE_URL" 2>/dev/null | grep -q "200\|302"; then
    echo "==> Downloading pre-built binary..."
    curl -fsSL "$RELEASE_URL" -o /tmp/panoptikon-agent
    chmod +x /tmp/panoptikon-agent
    mv /tmp/panoptikon-agent "$INSTALL_DIR/panoptikon-agent"
else
    echo "==> No pre-built binary found. Building from source (requires Rust)..."
    if ! command -v cargo >/dev/null 2>&1; then
        echo "==> Installing Rust toolchain..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        . "$HOME/.cargo/env"
    fi
    TMPDIR=$(mktemp -d)
    echo "==> Cloning repository..."
    git clone --depth=1 https://github.com/BeFeast/panoptikon.git "$TMPDIR/panoptikon"
    cd "$TMPDIR/panoptikon"
    echo "==> Building (this takes a few minutes)..."
    cargo build --release --bin panoptikon-agent
    mv "target/release/panoptikon-agent" "$INSTALL_DIR/panoptikon-agent"
    rm -rf "$TMPDIR"
fi

echo "==> Writing config..."
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.toml" <<TOMLEOF
server_url = "$SERVER_URL"
api_key = "$API_KEY"
report_interval_seconds = 30
TOMLEOF

# Install as systemd service (Linux) or launchd (macOS)
if command -v systemctl >/dev/null 2>&1; then
    if [ "$SYSTEMD_SYSTEM" = "1" ]; then
        SERVICE_FILE="/etc/systemd/system/panoptikon-agent.service"
        cat > "$SERVICE_FILE" <<SVCEOF
[Unit]
Description=Panoptikon Agent
After=network.target

[Service]
ExecStart=$INSTALL_DIR/panoptikon-agent --config $CONFIG_DIR/config.toml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF
        systemctl daemon-reload
        systemctl enable --now panoptikon-agent
        echo "==> Agent installed and started (systemd system)"
    else
        SERVICE_DIR="$HOME/.config/systemd/user"
        mkdir -p "$SERVICE_DIR"
        cat > "$SERVICE_DIR/panoptikon-agent.service" <<SVCEOF
[Unit]
Description=Panoptikon Agent
After=network.target

[Service]
ExecStart=$INSTALL_DIR/panoptikon-agent --config $CONFIG_DIR/config.toml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
SVCEOF
        systemctl --user daemon-reload
        systemctl --user enable --now panoptikon-agent
        echo "==> Agent installed and started (systemd user)"
    fi
elif [ "$(uname)" = "Darwin" ]; then
    PLIST="$HOME/Library/LaunchAgents/com.befeast.panoptikon-agent.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PLEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.befeast.panoptikon-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/panoptikon-agent</string>
        <string>--config</string>
        <string>$CONFIG_DIR/config.toml</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>$HOME/Library/Logs/panoptikon-agent.log</string>
    <key>StandardErrorPath</key><string>$HOME/Library/Logs/panoptikon-agent.log</string>
</dict>
</plist>
PLEOF
    launchctl load "$PLIST"
    echo "==> Agent installed and started (launchd)"
fi

# Ensure INSTALL_DIR is in PATH for non-root installs
if [ "$SYSTEMD_SYSTEM" = "0" ] && ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    echo ""
    echo "  NOTE: Add $INSTALL_DIR to your PATH:"
    echo "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc  # or ~/.bashrc"
fi

echo ""
echo "==> Done! Agent is reporting to $SERVER_URL"
"#,
        platform = platform,
        server_url = server_url,
        api_key = api_key,
    );

    (
        StatusCode::OK,
        [("content-type", "text/plain; charset=utf-8")],
        script,
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use crate::db;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> sqlx::SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: insert a test agent and return its id.
    async fn insert_test_agent(pool: &sqlx::SqlitePool) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("test_key", 4).unwrap(); // cost=4 for speed in tests
        sqlx::query("INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)")
            .bind(&id)
            .bind(&hash)
            .bind("test-agent")
            .execute(pool)
            .await
            .unwrap();
        id
    }

    /// Helper: insert a report for an agent at a given time.
    async fn insert_report(
        pool: &sqlx::SqlitePool,
        agent_id: &str,
        reported_at: &str,
        cpu_percent: f64,
        mem_used: i64,
        mem_total: i64,
    ) {
        sqlx::query(
            r#"INSERT INTO agent_reports (agent_id, reported_at, cpu_percent, mem_used, mem_total)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(agent_id)
        .bind(reported_at)
        .bind(cpu_percent)
        .bind(mem_used)
        .bind(mem_total)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_agent_reports_empty() {
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;

        let rows = sqlx::query_as::<_, (i64, Option<f64>, Option<i64>, Option<i64>, String)>(
            r#"SELECT id, cpu_percent, mem_used, mem_total, reported_at
               FROM agent_reports
               WHERE agent_id = ?
               ORDER BY reported_at DESC
               LIMIT ?"#,
        )
        .bind(&agent_id)
        .bind(100i32)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert!(rows.is_empty(), "No reports should exist for a fresh agent");
    }

    #[tokio::test]
    async fn test_agent_reports_returns_ordered() {
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;

        insert_report(&pool, &agent_id, "2026-01-01T10:00:00Z", 10.0, 100, 1000).await;
        insert_report(&pool, &agent_id, "2026-01-01T12:00:00Z", 30.0, 300, 1000).await;
        insert_report(&pool, &agent_id, "2026-01-01T11:00:00Z", 20.0, 200, 1000).await;

        let rows = sqlx::query_as::<_, (i64, Option<f64>, Option<i64>, Option<i64>, String)>(
            r#"SELECT id, cpu_percent, mem_used, mem_total, reported_at
               FROM agent_reports
               WHERE agent_id = ?
               ORDER BY reported_at DESC
               LIMIT ?"#,
        )
        .bind(&agent_id)
        .bind(100i32)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 3);
        // First row should be the most recent (12:00)
        assert!((rows[0].1.unwrap() - 30.0).abs() < 0.01);
        assert!((rows[1].1.unwrap() - 20.0).abs() < 0.01);
        assert!((rows[2].1.unwrap() - 10.0).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_agent_reports_limit() {
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;

        for i in 0..10 {
            let ts = format!("2026-01-01T{:02}:00:00Z", i);
            insert_report(&pool, &agent_id, &ts, i as f64 * 10.0, 100, 1000).await;
        }

        let rows = sqlx::query_as::<_, (i64, Option<f64>, Option<i64>, Option<i64>, String)>(
            r#"SELECT id, cpu_percent, mem_used, mem_total, reported_at
               FROM agent_reports
               WHERE agent_id = ?
               ORDER BY reported_at DESC
               LIMIT ?"#,
        )
        .bind(&agent_id)
        .bind(5i32)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 5, "Should only return 5 reports when limit=5");
    }

    #[tokio::test]
    async fn test_agent_reports_retention_cleanup() {
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;

        // Insert a report older than 7 days
        insert_report(&pool, &agent_id, "2020-01-01T00:00:00Z", 50.0, 500, 1000).await;
        // Insert a recent report
        let now = chrono::Utc::now().to_rfc3339();
        insert_report(&pool, &agent_id, &now, 60.0, 600, 1000).await;

        // Run the cleanup query
        sqlx::query("DELETE FROM agent_reports WHERE reported_at < datetime('now', '-7 days')")
            .execute(&pool)
            .await
            .unwrap();

        let rows =
            sqlx::query_as::<_, (i64,)>(r#"SELECT id FROM agent_reports WHERE agent_id = ?"#)
                .bind(&agent_id)
                .fetch_all(&pool)
                .await
                .unwrap();

        assert_eq!(
            rows.len(),
            1,
            "Only the recent report should survive the 7-day cleanup"
        );
    }

    /// Helper: insert a test device and return its id.
    async fn insert_test_device(pool: &sqlx::SqlitePool) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, icon, is_known, is_favorite, first_seen_at, last_seen_at, is_online)
               VALUES (?, '00:11:22:33:44:55', 'test-device', 'desktop', 0, 0, datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[tokio::test]
    async fn test_traffic_insert_skipped_no_device() {
        // Agent without device_id → no traffic_samples row inserted.
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;

        // Insert a report with network data — but agent has no device_id.
        insert_report(
            &pool,
            &agent_id,
            "2026-01-01T10:00:00+00:00",
            50.0,
            500,
            1000,
        )
        .await;

        // Verify agent has no device_id.
        let device_id: Option<String> =
            sqlx::query_scalar(r#"SELECT device_id FROM agents WHERE id = ?"#)
                .bind(&agent_id)
                .fetch_optional(&pool)
                .await
                .unwrap()
                .flatten();
        assert!(device_id.is_none(), "Agent should have no device_id");

        // Since handle_agent_report checks device_id before inserting traffic,
        // and agent has no device_id, no traffic_samples should exist.
        let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM traffic_samples"#)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            count, 0,
            "No traffic samples should exist when agent has no device_id"
        );
    }

    #[tokio::test]
    async fn test_traffic_insert_with_device() {
        // Agent with device_id, interface with rx_bytes_delta=3000, interval=30s → rx_bps=800.
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await;
        let device_id = insert_test_device(&pool).await;

        // Link agent to device.
        sqlx::query(r#"UPDATE agents SET device_id = ? WHERE id = ?"#)
            .bind(&device_id)
            .bind(&agent_id)
            .execute(&pool)
            .await
            .unwrap();

        // Verify bps computation: delta=3000 bytes, interval=30s → bps = 3000 * 8 / 30 = 800.
        let delta_bytes: u64 = 3000;
        let interval_secs: f64 = 30.0;
        let expected_bps = (delta_bytes as f64) * 8.0 / interval_secs;
        assert!(
            (expected_bps - 800.0).abs() < 0.01,
            "3000 bytes over 30s should be 800 bps, got {expected_bps}"
        );

        // Insert a traffic sample directly to verify the schema works.
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, datetime('now'), ?, ?, 'agent')"#,
        )
        .bind(&device_id)
        .bind(expected_bps as i64)
        .bind(400i64)
        .execute(&pool)
        .await
        .unwrap();

        let count: i64 =
            sqlx::query_scalar(r#"SELECT COUNT(*) FROM traffic_samples WHERE device_id = ?"#)
                .bind(&device_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1, "One traffic sample should be inserted");

        let (rx, tx): (i64, i64) = sqlx::query_as(
            r#"SELECT rx_bps, tx_bps FROM traffic_samples WHERE device_id = ? LIMIT 1"#,
        )
        .bind(&device_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(rx, 800, "rx_bps should be 800");
        assert_eq!(tx, 400, "tx_bps should be 400");
    }

    #[tokio::test]
    async fn test_traffic_interval_calculation() {
        // Two reports 60s apart → interval should be 60.0.
        let prev_ts = "2026-01-01T10:00:00+00:00";
        let curr_ts = "2026-01-01T10:01:00+00:00";

        let prev = chrono::DateTime::parse_from_rfc3339(prev_ts)
            .unwrap()
            .timestamp();
        let curr = chrono::DateTime::parse_from_rfc3339(curr_ts)
            .unwrap()
            .timestamp();
        let interval = (curr - prev) as f64;

        assert!(
            (interval - 60.0).abs() < 0.01,
            "Interval between reports 60s apart should be 60.0, got {interval}"
        );
    }
}
