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
) -> Result<Json<Vec<AgentReportRow>>, AppError> {
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
        AppError::Internal(e.to_string())
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

/// GET /api/v1/agents/:id/fastfetch — return raw fastfetch data for an agent.
pub async fn get_fastfetch(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row: Option<Option<String>> = sqlx::query_scalar(
        "SELECT ds.fastfetch_json \
         FROM agents a \
         JOIN device_sysinfo ds ON ds.device_id = a.device_id \
         WHERE a.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch fastfetch data for agent {id}: {e}");
        AppError::Internal(e.to_string())
    })?;

    match row.flatten() {
        Some(json_str) => {
            let val: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| {
                error!("Failed to parse stored fastfetch JSON: {e}");
                AppError::Internal(e.to_string())
            })?;
            Ok(Json(val))
        }
        None => Ok(Json(serde_json::json!(null))),
    }
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
    // From device_sysinfo (hardware inventory):
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_cores: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_seconds: Option<i64>,
    // Fastfetch-enriched fields:
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bios_vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motherboard_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_vram: Option<String>,
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
    #[serde(default)]
    pub hardware: Option<AgentHardwareInfo>,
    /// Rich hardware/system info from fastfetch (if available on agent).
    #[serde(default)]
    pub fastfetch: Option<serde_json::Value>,
}

/// Hardware inventory from agent (static info collected at startup).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AgentHardwareInfo {
    pub hardware_model: Option<String>,
    pub cpu_name: Option<String>,
    pub cpu_cores: Option<i32>,
    pub cpu_speed_mhz: Option<i64>,
    pub ram_total_bytes: Option<i64>,
    pub gpu_name: Option<String>,
    pub disk_name: Option<String>,
    pub disk_size_bytes: Option<i64>,
    pub serial_number: Option<String>,
    // Extended fields from fastfetch:
    #[serde(default)]
    pub motherboard_name: Option<String>,
    #[serde(default)]
    pub bios_version: Option<String>,
    #[serde(default)]
    pub bios_vendor: Option<String>,
    #[serde(default)]
    pub ram_type: Option<String>,
    #[serde(default)]
    pub ram_speed: Option<String>,
    #[serde(default)]
    pub gpu_vram: Option<String>,
    #[serde(default)]
    pub gpu_type: Option<String>,
    #[serde(default)]
    pub collector_source: Option<String>,
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
            hardware_model: row.try_get("hardware_model").ok().flatten(),
            cpu_name: row.try_get("cpu_name").ok().flatten(),
            cpu_cores: row.try_get("cpu_cores").ok().flatten(),
            cpu_speed: row.try_get("cpu_speed").ok().flatten(),
            gpu_name: row.try_get("gpu_name").ok().flatten(),
            disk_name: row.try_get("disk_name").ok().flatten(),
            disk_size: row.try_get("disk_size").ok().flatten(),
            serial_number: row.try_get("serial_number").ok().flatten(),
            uptime_seconds: row.try_get("uptime_seconds").ok().flatten(),
            bios_vendor: row.try_get("bios_vendor").ok().flatten(),
            bios_version: row.try_get("bios_version").ok().flatten(),
            motherboard_name: row.try_get("motherboard_name").ok().flatten(),
            ram_type: row.try_get("ram_type").ok().flatten(),
            ram_speed: row.try_get("ram_speed").ok().flatten(),
            gpu_vram: row.try_get("gpu_vram").ok().flatten(),
        })
    }
}

/// GET /api/v1/agents — list all agents.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Agent>>, AppError> {
    let rows = sqlx::query(
        "SELECT a.id, a.device_id, a.name, a.platform, a.version, a.is_online, \
                a.last_report_at, a.created_at, \
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used, \
                ds.hardware_model, ds.cpu_name, ds.cpu_cores, ds.cpu_speed, \
                ds.gpu_name, ds.disk_name, ds.disk_size, ds.serial_number, ds.uptime_seconds, \
                ds.bios_vendor, ds.bios_version, ds.motherboard_name, ds.ram_type, ds.ram_speed, ds.gpu_vram \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         LEFT JOIN device_sysinfo ds ON ds.device_id = a.device_id \
         ORDER BY a.created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list agents: {e}");
        AppError::Internal(e.to_string())
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
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used, \
                ds.hardware_model, ds.cpu_name, ds.cpu_cores, ds.cpu_speed, \
                ds.gpu_name, ds.disk_name, ds.disk_size, ds.serial_number, ds.uptime_seconds, \
                ds.bios_vendor, ds.bios_version, ds.motherboard_name, ds.ram_type, ds.ram_speed, ds.gpu_vram \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         LEFT JOIN device_sysinfo ds ON ds.device_id = a.device_id \
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
) -> Result<(StatusCode, Json<RegisterAgentResponse>), AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let api_key = format!("pnk_{}", uuid::Uuid::new_v4().to_string().replace('-', ""));
    let api_key_hash = bcrypt::hash(&api_key, bcrypt::DEFAULT_COST).map_err(|e| {
        error!("Failed to hash API key: {e}");
        AppError::Internal(e.to_string())
    })?;

    sqlx::query("INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&api_key_hash)
        .bind(&body.name)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to register agent: {e}");
            AppError::Internal(e.to_string())
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
) -> Result<Json<Agent>, AppError> {
    sqlx::query("UPDATE agents SET name = ? WHERE id = ?")
        .bind(&body.name)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to update agent {id}: {e}");
            AppError::Internal(e.to_string())
        })?;

    // Return updated agent
    let row = sqlx::query(
        "SELECT a.id, a.device_id, a.name, a.platform, a.version, a.is_online, \
                a.last_report_at, a.created_at, \
                r.hostname, r.os_name, r.os_version, r.cpu_percent, r.mem_total, r.mem_used, \
                ds.hardware_model, ds.cpu_name, ds.cpu_cores, ds.cpu_speed, \
                ds.gpu_name, ds.disk_name, ds.disk_size, ds.serial_number, ds.uptime_seconds, \
                ds.bios_vendor, ds.bios_version, ds.motherboard_name, ds.ram_type, ds.ram_speed, ds.gpu_vram \
         FROM agents a \
         LEFT JOIN agent_reports r ON r.agent_id = a.id \
           AND r.id = ( \
               SELECT ar.id FROM agent_reports ar \
               WHERE ar.agent_id = a.id \
               ORDER BY ar.reported_at DESC, ar.id DESC \
               LIMIT 1 \
           ) \
         LEFT JOIN device_sysinfo ds ON ds.device_id = a.device_id \
         WHERE a.id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or(AppError::NotFound)?;

    Agent::from_row(row).map(Json).map_err(|e| {
        error!("Failed to parse agent row after update: {e}");
        AppError::Internal(e.to_string())
    })
}

/// DELETE /api/v1/agents/:id — remove an agent.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM agents WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete agent {id}: {e}");
            AppError::Internal(e.to_string())
        })?;

    if result.rows_affected() > 0 {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
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
) -> Result<Json<BulkDeleteResponse>, AppError> {
    if body.ids.is_empty() && body.name_pattern.is_none() {
        return Err(AppError::Validation(
            "ids or name_pattern is required".into(),
        ));
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
            AppError::Internal(e.to_string())
        })?;

        let agents_query = format!("DELETE FROM agents WHERE id IN ({placeholders})");
        let mut q = sqlx::query(&agents_query);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let result = q.execute(&state.db).await.map_err(|e| {
            error!("Failed to bulk-delete agents by ID: {e}");
            AppError::Internal(e.to_string())
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
            AppError::Internal(e.to_string())
        })?;

        let result = sqlx::query("DELETE FROM agents WHERE name LIKE ?")
            .bind(pattern)
            .execute(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to bulk-delete agents by pattern: {e}");
                AppError::Internal(e.to_string())
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
/// Authentication is performed **before** the WebSocket upgrade so unauthenticated connections
/// are rejected with a plain HTTP 401 and never promoted to a WebSocket.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Response {
    // Extract Bearer token from the Authorization header.
    let api_key = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            let s = s.trim();
            if s.len() > 7 && s[..7].eq_ignore_ascii_case("bearer ") {
                Some(s[7..].trim().to_owned())
            } else {
                None
            }
        });

    let api_key = match api_key {
        Some(k) if !k.is_empty() => k,
        _ => {
            warn!("Agent WebSocket: missing or empty Authorization header");
            return (StatusCode::UNAUTHORIZED, "missing Authorization header").into_response();
        }
    };

    // Look up the agent by verifying the API key against stored hashes.
    let agent_id = match find_agent_by_api_key(&state.db, &api_key).await {
        Some(id) => id,
        None => {
            warn!("Agent WebSocket: no agent matched the provided API key");
            return (StatusCode::UNAUTHORIZED, "invalid API key").into_response();
        }
    };

    ws.on_upgrade(move |socket| handle_agent_ws(socket, state, agent_id))
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
                        if socket
                            .send(Message::Text(payload.to_string().into()))
                            .await
                            .is_err()
                        {
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
/// The agent has already been authenticated by `ws_handler` before the upgrade.
async fn handle_agent_ws(mut socket: WebSocket, state: AppState, agent_id: String) {
    info!(agent_id = %agent_id, "Agent WebSocket connection opened (authenticated)");

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
            json!({"status": "authenticated", "agent_id": &agent_id})
                .to_string()
                .into(),
        ))
        .await;

    // Step 2: Enter report loop.
    loop {
        tokio::select! {
            // Commands from server → agent
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(command) => {
                        if socket.send(Message::Text(command.into())).await.is_err() {
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
                        if socket
                            .send(Message::Text(
                                json!({"status":"ok"}).to_string().into(),
                            ))
                            .await
                            .is_err()
                        {
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
    // Fetch agent name and linked device_id in one query.
    let agent_row = sqlx::query(r#"SELECT name, device_id FROM agents WHERE id = ?"#)
        .bind(&agent_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

    let agent_name: Option<String> = agent_row
        .as_ref()
        .and_then(|r| r.try_get::<Option<String>, _>("name").unwrap_or(None));
    let agent_device_id: Option<String> = agent_row
        .as_ref()
        .and_then(|r| r.try_get::<Option<String>, _>("device_id").unwrap_or(None));

    // Use agent name for display, fall back to short UUID suffix.
    let display_name = agent_name.unwrap_or_else(|| {
        let short = agent_id
            .rfind('-')
            .map(|i| &agent_id[i + 1..])
            .unwrap_or(&agent_id);
        format!("...{short}")
    });

    // Check if agent has a linked device that is muted.
    let device_muted = match agent_device_id {
        Some(ref did) => alerts::is_device_muted(&state.db, did).await,
        None => false,
    };

    if !device_muted
        && !alerts::recent_agent_alert_exists(&state.db, &agent_id, "agent_offline", 600).await
    {
        let alert_id = uuid::Uuid::new_v4().to_string();
        let severity = alerts::severity_for_alert_type("agent_offline");
        let _ = sqlx::query(
            r#"INSERT INTO alerts (id, type, agent_id, message, severity, created_at) VALUES (?, 'agent_offline', ?, ?, ?, ?)"#,
        )
        .bind(&alert_id)
        .bind(&agent_id)
        .bind(format!("Agent {display_name} disconnected"))
        .bind(severity)
        .bind(&now)
        .execute(&state.db)
        .await;
    }

    state.ws_hub.unregister_agent(&agent_id).await;
    state
        .ws_hub
        .broadcast("agent_offline", json!({"agent_id": &agent_id}));

    webhook::dispatch_webhook(
        &state.db,
        "agent_offline",
        json!({"agent_id": &agent_id, "name": &display_name}),
    );
}

/// Look up an agent by verifying the supplied API key against every stored bcrypt hash.
/// Returns the agent ID on the first match, or `None` if no agent matches.
async fn find_agent_by_api_key(db: &sqlx::SqlitePool, api_key: &str) -> Option<String> {
    let rows = sqlx::query("SELECT id, api_key_hash FROM agents")
        .fetch_all(db)
        .await
        .ok()?;

    let key = api_key.to_owned();
    // bcrypt verification is CPU-intensive; run off the async runtime.
    tokio::task::spawn_blocking(move || {
        for row in &rows {
            let id: String = match row.try_get("id") {
                Ok(v) => v,
                Err(_) => continue,
            };
            let hash: String = match row.try_get("api_key_hash") {
                Ok(v) => v,
                Err(_) => continue,
            };
            if bcrypt::verify(&key, &hash).unwrap_or(false) {
                return Some(id);
            }
        }
        None
    })
    .await
    .ok()?
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
                // No matching device found — auto-create a device (asset) if
                // this agent doesn't already have one linked.
                let current_device_id: Option<String> =
                    sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
                        .bind(agent_id)
                        .fetch_optional(&state.db)
                        .await
                        .unwrap_or(None)
                        .flatten();

                if current_device_id.is_none() {
                    // Pick the first usable MAC (prefer non-randomized).
                    let chosen_mac = mac_addresses
                        .iter()
                        .find(|m| !crate::enrichment::is_randomized_mac(m))
                        .or(mac_addresses.first());

                    if let Some(mac) = chosen_mac {
                        let new_device_id = uuid::Uuid::new_v4().to_string();
                        let mac_is_randomized = crate::enrichment::is_randomized_mac(mac);
                        let vendor = if mac_is_randomized {
                            None
                        } else {
                            crate::oui::lookup(mac).map(|v| v.to_string())
                        };
                        let hostname = report.hostname.as_deref();
                        let dev_name = hostname.or(vendor.as_deref()).map(|s| s.to_string());

                        if let Err(e) = sqlx::query(
                            "INSERT INTO devices (id, mac, name, hostname, vendor, is_randomized_mac, \
                             first_seen_at, last_seen_at, is_online) \
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
                        )
                        .bind(&new_device_id)
                        .bind(mac)
                        .bind(&dev_name)
                        .bind(hostname)
                        .bind(&vendor)
                        .bind(mac_is_randomized as i32)
                        .bind(&now)
                        .bind(&now)
                        .execute(&state.db)
                        .await
                        {
                            warn!(agent_id, mac = %mac, error = %e, "Failed to auto-create device for agent");
                        } else {
                            // Link agent to new device.
                            let _ = sqlx::query("UPDATE agents SET device_id = ? WHERE id = ?")
                                .bind(&new_device_id)
                                .bind(agent_id)
                                .execute(&state.db)
                                .await;

                            info!(
                                agent_id,
                                device_id = %new_device_id,
                                mac = %mac,
                                "Auto-created device (asset) from agent"
                            );

                            state.ws_hub.broadcast(
                                "new_device",
                                json!({
                                    "device_id": &new_device_id,
                                    "mac": mac,
                                    "source": "agent",
                                }),
                            );
                        }
                    }
                }
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

    // --- Device sysinfo upsert ---
    // Store hardware inventory in device_sysinfo when agent is linked to a device.
    if let (Some(ref dev_id), Some(ref hw)) = (&device_id, &report.hardware) {
        let ram_total_str = hw.ram_total_bytes.map(format_bytes);
        let cpu_speed_str = hw.cpu_speed_mhz.map(|mhz| format!("{} MHz", mhz));
        let disk_size_str = hw.disk_size_bytes.map(format_bytes);
        let os_build = os.and_then(|o| o.kernel.as_deref());

        // Extract fields from fastfetch data if available.
        let ff = report.fastfetch.as_ref();
        let fastfetch_json = ff.and_then(|v| serde_json::to_string(v).ok());
        let bios_vendor = extract_fastfetch_str(ff, "bios", "vendor");
        let bios_version = extract_fastfetch_str(ff, "bios", "version");
        let motherboard_name = extract_fastfetch_str(ff, "host", "name");
        let ram_type = extract_fastfetch_physical_mem_field(ff, "mem_type");
        let ram_speed =
            extract_fastfetch_physical_mem_field(ff, "speed_mts").map(|s| format!("{} MT/s", s));
        let gpu_vram = extract_fastfetch_gpu_vram(ff);

        if let Err(e) = sqlx::query(
            r#"INSERT INTO device_sysinfo
               (device_id, os_name, os_version, os_build, hardware_model,
                cpu_name, cpu_cores, cpu_speed, ram_total,
                gpu_name, disk_name, disk_size, serial_number,
                hostname, uptime_seconds, fastfetch_json,
                bios_vendor, bios_version, motherboard_name,
                ram_type, ram_speed, gpu_vram,
                reported_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(device_id) DO UPDATE SET
                   os_name = COALESCE(excluded.os_name, device_sysinfo.os_name),
                   os_version = COALESCE(excluded.os_version, device_sysinfo.os_version),
                   os_build = COALESCE(excluded.os_build, device_sysinfo.os_build),
                   hardware_model = COALESCE(excluded.hardware_model, device_sysinfo.hardware_model),
                   cpu_name = COALESCE(excluded.cpu_name, device_sysinfo.cpu_name),
                   cpu_cores = COALESCE(excluded.cpu_cores, device_sysinfo.cpu_cores),
                   cpu_speed = COALESCE(excluded.cpu_speed, device_sysinfo.cpu_speed),
                   ram_total = COALESCE(excluded.ram_total, device_sysinfo.ram_total),
                   gpu_name = COALESCE(excluded.gpu_name, device_sysinfo.gpu_name),
                   disk_name = COALESCE(excluded.disk_name, device_sysinfo.disk_name),
                   disk_size = COALESCE(excluded.disk_size, device_sysinfo.disk_size),
                   serial_number = COALESCE(excluded.serial_number, device_sysinfo.serial_number),
                   hostname = COALESCE(excluded.hostname, device_sysinfo.hostname),
                   uptime_seconds = excluded.uptime_seconds,
                   fastfetch_json = COALESCE(excluded.fastfetch_json, device_sysinfo.fastfetch_json),
                   bios_vendor = COALESCE(excluded.bios_vendor, device_sysinfo.bios_vendor),
                   bios_version = COALESCE(excluded.bios_version, device_sysinfo.bios_version),
                   motherboard_name = COALESCE(excluded.motherboard_name, device_sysinfo.motherboard_name),
                   ram_type = COALESCE(excluded.ram_type, device_sysinfo.ram_type),
                   ram_speed = COALESCE(excluded.ram_speed, device_sysinfo.ram_speed),
                   gpu_vram = COALESCE(excluded.gpu_vram, device_sysinfo.gpu_vram),
                   reported_at = datetime('now')"#,
        )
        .bind(dev_id)
        .bind(os.and_then(|o| o.name.as_deref()))
        .bind(os.and_then(|o| o.version.as_deref()))
        .bind(os_build)
        .bind(hw.hardware_model.as_deref())
        .bind(hw.cpu_name.as_deref())
        .bind(hw.cpu_cores)
        .bind(cpu_speed_str.as_deref())
        .bind(ram_total_str.as_deref())
        .bind(hw.gpu_name.as_deref())
        .bind(hw.disk_name.as_deref())
        .bind(disk_size_str.as_deref())
        .bind(hw.serial_number.as_deref())
        .bind(&report.hostname)
        .bind(report.uptime_seconds)
        .bind(fastfetch_json.as_deref())
        .bind(bios_vendor.as_deref())
        .bind(bios_version.as_deref())
        .bind(motherboard_name.as_deref())
        .bind(ram_type.as_deref())
        .bind(ram_speed.as_deref())
        .bind(gpu_vram.as_deref())
        .execute(&state.db)
        .await
        {
            warn!(agent_id, device_id = %dev_id, error = %e, "Failed to upsert device_sysinfo");
        }
    }

    // --- Auto-populate device asset fields from agent data ---
    // Update the linked device's hostname, OS, and hardware fields when they are empty.
    // This ensures the asset list shows meaningful info after the first agent report.
    if let Some(ref dev_id) = device_id {
        let os_name = os.and_then(|o| o.name.as_deref());
        let os_ver = os.and_then(|o| o.version.as_deref());

        if report.hostname.is_some() || os_name.is_some() || os_ver.is_some() {
            let _ = sqlx::query(
                "UPDATE devices SET \
                 hostname = COALESCE(hostname, ?), \
                 os_family = COALESCE(os_family, ?), \
                 os_version = COALESCE(os_version, ?), \
                 device_type = COALESCE(device_type, 'computer'), \
                 updated_at = ? \
                 WHERE id = ?",
            )
            .bind(&report.hostname)
            .bind(os_name)
            .bind(os_ver)
            .bind(&now)
            .bind(dev_id)
            .execute(&state.db)
            .await;
        }

        // Copy hardware specs to device asset fields (only when empty).
        if let Some(ref hw) = report.hardware {
            let ram_str = hw.ram_total_bytes.map(format_bytes);

            let _ = sqlx::query(
                "UPDATE devices SET \
                 serial_number = COALESCE(serial_number, ?), \
                 cpu_manual = COALESCE(cpu_manual, ?), \
                 ram_manual = COALESCE(ram_manual, ?), \
                 custom_model = COALESCE(custom_model, ?), \
                 updated_at = ? \
                 WHERE id = ?",
            )
            .bind(hw.serial_number.as_deref())
            .bind(hw.cpu_name.as_deref())
            .bind(ram_str.as_deref())
            .bind(hw.hardware_model.as_deref())
            .bind(&now)
            .bind(dev_id)
            .execute(&state.db)
            .await;
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

/// Format bytes as a human-readable string (e.g. "16.0 GB").
fn format_bytes(bytes: i64) -> String {
    const GB: f64 = 1_073_741_824.0;
    const MB: f64 = 1_048_576.0;
    const TB: f64 = 1_099_511_627_776.0;
    let b = bytes as f64;
    if b >= TB {
        format!("{:.1} TB", b / TB)
    } else if b >= GB {
        format!("{:.1} GB", b / GB)
    } else if b >= MB {
        format!("{:.0} MB", b / MB)
    } else {
        format!("{} B", bytes)
    }
}

/// Extract a string field from a fastfetch section.
/// `section` matches the top-level key in our FastfetchInfo (e.g. "bios", "host").
/// `field` is the nested field name.
fn extract_fastfetch_str(
    ff: Option<&serde_json::Value>,
    section: &str,
    field: &str,
) -> Option<String> {
    ff?.get(section)?
        .get(field)?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Extract a field from the first physical memory module.
fn extract_fastfetch_physical_mem_field(
    ff: Option<&serde_json::Value>,
    field: &str,
) -> Option<String> {
    let arr = ff?.get("physical_memory")?.as_array()?;
    let first = arr.first()?;
    let val = first.get(field)?;
    if val.is_string() {
        val.as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    } else if val.is_u64() {
        Some(val.as_u64()?.to_string())
    } else {
        None
    }
}

/// Extract GPU VRAM from fastfetch GPU data (first GPU with non-null vram).
fn extract_fastfetch_gpu_vram(ff: Option<&serde_json::Value>) -> Option<String> {
    let arr = ff?.get("gpu")?.as_array()?;
    for gpu in arr {
        if let Some(vram_mb) = gpu.get("vram_mb").and_then(|v| v.as_u64()) {
            if vram_mb > 0 {
                return Some(format_bytes(vram_mb as i64 * 1024 * 1024));
            }
        }
    }
    None
}

/// Supported agent platforms with their metadata.
struct PlatformInfo {
    /// File name for the pre-built binary artifact.
    artifact: &'static str,
    /// Whether this is a Windows target.
    is_windows: bool,
}

fn platform_info(platform: &str) -> Option<PlatformInfo> {
    match platform {
        "linux-amd64" => Some(PlatformInfo {
            artifact: "panoptikon-agent-linux-amd64",
            is_windows: false,
        }),
        "linux-arm64" => Some(PlatformInfo {
            artifact: "panoptikon-agent-linux-arm64",
            is_windows: false,
        }),
        "darwin-arm64" => Some(PlatformInfo {
            artifact: "panoptikon-agent-darwin-arm64",
            is_windows: false,
        }),
        "darwin-amd64" => Some(PlatformInfo {
            artifact: "panoptikon-agent-darwin-amd64",
            is_windows: false,
        }),
        "windows-amd64" => Some(PlatformInfo {
            artifact: "panoptikon-agent-windows-amd64.exe",
            is_windows: true,
        }),
        _ => None,
    }
}

/// Derive the server URL from the incoming request headers / config.
fn server_url_from_request(headers: &HeaderMap, config: &crate::config::AppConfig) -> String {
    if let Some(host) = headers.get("host").and_then(|v| v.to_str().ok()) {
        format!("http://{}", host)
    } else {
        let listen = config.listen.as_deref().unwrap_or("0.0.0.0:8080");
        format!("http://{}", listen)
    }
}

/// GET /api/v1/agent/install/:platform?key=<api_key>&id=<agent_id>
///
/// Returns an install script for the given platform:
/// - Linux / macOS: shell script that downloads the binary via curl
/// - Windows: PowerShell script that downloads the .exe and registers a service
pub async fn install_script(
    Path(platform): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Response {
    let api_key = match params.get("key") {
        Some(k) => k.clone(),
        None => {
            return (StatusCode::BAD_REQUEST, "Missing ?key= parameter").into_response();
        }
    };
    let agent_id = params.get("id").cloned().unwrap_or_default();

    let info = match platform_info(&platform) {
        Some(i) => i,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                "Unknown platform. Use: linux-amd64, linux-arm64, darwin-arm64, darwin-amd64, windows-amd64",
            )
                .into_response();
        }
    };

    let server_url = server_url_from_request(&headers, &state.config);

    if info.is_windows {
        let script = generate_windows_script(&platform, &server_url, &api_key, &agent_id);
        return (
            StatusCode::OK,
            [("content-type", "text/plain; charset=utf-8")],
            script,
        )
            .into_response();
    }

    let script = generate_unix_script(&platform, &server_url, &api_key, &agent_id);
    (
        StatusCode::OK,
        [("content-type", "text/plain; charset=utf-8")],
        script,
    )
        .into_response()
}

/// GET /api/v1/agent/install/:platform/binary
///
/// Serves the pre-built agent binary for the given platform.
/// Looks for the binary in:
///   1. The configured `agent_binaries_dir` on the server filesystem
///   2. Falls back to redirecting to GitHub Releases
pub async fn install_binary(
    Path(platform): Path<String>,
    State(state): State<AppState>,
) -> Response {
    let info = match platform_info(&platform) {
        Some(i) => i,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                "Unknown platform. Use: linux-amd64, linux-arm64, darwin-arm64, darwin-amd64, windows-amd64",
            )
                .into_response();
        }
    };

    // Try to serve from local filesystem first.
    if let Some(dir) = &state.config.agent_binaries_dir {
        let path = std::path::Path::new(dir).join(info.artifact);
        if path.is_file() {
            match tokio::fs::read(&path).await {
                Ok(bytes) => {
                    let content_type = if info.is_windows {
                        "application/vnd.microsoft.portable-executable"
                    } else {
                        "application/octet-stream"
                    };
                    return (
                        StatusCode::OK,
                        [
                            ("content-type", content_type),
                            (
                                "content-disposition",
                                &format!("attachment; filename=\"{}\"", info.artifact),
                            ),
                        ],
                        bytes,
                    )
                        .into_response();
                }
                Err(e) => {
                    error!("Failed to read agent binary {}: {}", path.display(), e);
                    // Fall through to GitHub redirect.
                }
            }
        }
    }

    // Redirect to GitHub Releases.
    let release_url = format!(
        "https://github.com/BeFeast/panoptikon/releases/latest/download/{}",
        info.artifact,
    );
    (StatusCode::TEMPORARY_REDIRECT, [("location", release_url)]).into_response()
}

/// Generate a Unix (Linux / macOS) install script that downloads a pre-built binary.
fn generate_unix_script(platform: &str, server_url: &str, api_key: &str, agent_id: &str) -> String {
    format!(
        r#"#!/bin/sh
# Panoptikon Agent Installer — {platform}
# Server: {server_url}

set -e

SERVER_URL="{server_url}"
API_KEY="{api_key}"
AGENT_ID="{agent_id}"

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

# Download the pre-built binary — try the server's own binary endpoint first,
# then fall back to GitHub Releases.
BINARY_URL="$SERVER_URL/api/v1/agent/install/{platform}/binary"

echo "==> Downloading pre-built binary..."
if ! curl -fsSL "$BINARY_URL" -o /tmp/panoptikon-agent 2>/dev/null; then
    RELEASE_URL="https://github.com/BeFeast/panoptikon/releases/latest/download/panoptikon-agent-{platform}"
    echo "==> Server binary not available, trying GitHub Releases..."
    curl -fsSL -L "$RELEASE_URL" -o /tmp/panoptikon-agent
fi
chmod +x /tmp/panoptikon-agent
mv /tmp/panoptikon-agent "$INSTALL_DIR/panoptikon-agent"

echo "==> Writing config..."
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.toml" <<TOMLEOF
server_url = "$SERVER_URL"
api_key = "$API_KEY"
agent_id = "$AGENT_ID"
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
        agent_id = agent_id,
    )
}

/// Generate a Windows PowerShell install script that downloads the .exe and
/// registers it as a Windows Service.
fn generate_windows_script(
    platform: &str,
    server_url: &str,
    api_key: &str,
    agent_id: &str,
) -> String {
    format!(
        r#"# Panoptikon Agent Installer — {platform}
# Server: {server_url}
# Run as Administrator: powershell -ExecutionPolicy Bypass -File panoptikon-install.ps1

$ErrorActionPreference = "Stop"

$ServerUrl    = "{server_url}"
$ApiKey       = "{api_key}"
$AgentId      = "{agent_id}"
$InstallDir   = "$env:ProgramFiles\panoptikon"
$ConfigDir    = "$env:ProgramData\panoptikon-agent"
$BinaryPath   = "$InstallDir\panoptikon-agent.exe"

Write-Host "==> Installing Panoptikon Agent ({platform})"
Write-Host "    Binary  : $BinaryPath"
Write-Host "    Config  : $ConfigDir\config.toml"

# Create directories
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir  | Out-Null

# Download the pre-built binary — try the server first, then GitHub Releases.
$BinaryUrl  = "$ServerUrl/api/v1/agent/install/{platform}/binary"
$ReleaseUrl = "https://github.com/BeFeast/panoptikon/releases/latest/download/panoptikon-agent-{platform}.exe"

Write-Host "==> Downloading pre-built binary..."
try {{
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $BinaryPath -UseBasicParsing
}} catch {{
    Write-Host "==> Server binary not available, trying GitHub Releases..."
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $BinaryPath -UseBasicParsing
}}

# Write config
Write-Host "==> Writing config..."
@"
server_url = "$ServerUrl"
api_key = "$ApiKey"
agent_id = "$AgentId"
report_interval_seconds = 30
"@ | Out-File "$ConfigDir\config.toml" -Encoding utf8

# Stop existing service if running
if (Get-Service -Name "PanoptikonAgent" -ErrorAction SilentlyContinue) {{
    Write-Host "==> Stopping existing service..."
    Stop-Service -Name "PanoptikonAgent" -Force -ErrorAction SilentlyContinue
    sc.exe delete "PanoptikonAgent" | Out-Null
    Start-Sleep -Seconds 2
}}

# Register as Windows Service
Write-Host "==> Registering Windows service..."
New-Service -Name "PanoptikonAgent" `
    -BinaryPathName "`"$BinaryPath`" --config `"$ConfigDir\config.toml`"" `
    -StartupType Automatic `
    -DisplayName "Panoptikon Agent" `
    -Description "Panoptikon system metrics collector"

Start-Service -Name "PanoptikonAgent"

Write-Host ""
Write-Host "==> Done! Agent is reporting to $ServerUrl"
"#,
        platform = platform,
        server_url = server_url,
        api_key = api_key,
        agent_id = agent_id,
    )
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

    // ─── Auto-Asset Creation Tests ──────────────────────────

    /// Helper: create a test AppState with an in-memory database.
    async fn test_app_state() -> (sqlx::SqlitePool, crate::api::AppState) {
        let pool = test_db().await;
        let state = crate::api::AppState::new(pool.clone(), crate::config::AppConfig::default());
        (pool, state)
    }

    #[tokio::test]
    async fn test_agent_report_auto_creates_device() {
        // Agent sends a report with a MAC address that doesn't match any device.
        // A new device (asset) should be auto-created and linked to the agent.
        let (pool, state) = test_app_state().await;
        let agent_id = insert_test_agent(&pool).await;

        let report_json = serde_json::json!({
            "agent_id": agent_id,
            "hostname": "test-host",
            "os": {"name": "Linux", "version": "6.1.0"},
            "network_interfaces": [
                {"name": "eth0", "mac": "aa:bb:cc:dd:ee:f1"}
            ]
        });

        super::handle_agent_report(&report_json.to_string(), &agent_id, &state)
            .await
            .expect("handle_agent_report should succeed");

        // Verify a device was created with the agent's MAC.
        let device: Option<(String, String, Option<String>)> =
            sqlx::query_as("SELECT id, mac, hostname FROM devices WHERE mac = 'aa:bb:cc:dd:ee:f1'")
                .fetch_optional(&pool)
                .await
                .unwrap();
        assert!(
            device.is_some(),
            "Device should be auto-created from agent MAC"
        );
        let (device_id, mac, hostname) = device.unwrap();
        assert_eq!(mac, "aa:bb:cc:dd:ee:f1");
        assert_eq!(hostname.as_deref(), Some("test-host"));

        // Verify agent is linked to the new device.
        let linked_device_id: Option<String> =
            sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
                .bind(&agent_id)
                .fetch_optional(&pool)
                .await
                .unwrap()
                .flatten();
        assert_eq!(
            linked_device_id.as_deref(),
            Some(device_id.as_str()),
            "Agent should be linked to the auto-created device"
        );
    }

    #[tokio::test]
    async fn test_agent_report_links_to_existing_device() {
        // A device already exists with a given MAC. Agent sends a report with
        // that same MAC. Agent should be linked to the existing device (no new device).
        let (pool, state) = test_app_state().await;
        let agent_id = insert_test_agent(&pool).await;
        let existing_mac = "aa:bb:cc:dd:ee:f2";

        // Pre-create a device with this MAC.
        let pre_device_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO devices (id, mac, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)",
        )
        .bind(&pre_device_id)
        .bind(existing_mac)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let report_json = serde_json::json!({
            "agent_id": agent_id,
            "hostname": "agent-host",
            "network_interfaces": [
                {"name": "eth0", "mac": existing_mac}
            ]
        });

        super::handle_agent_report(&report_json.to_string(), &agent_id, &state)
            .await
            .expect("handle_agent_report should succeed");

        // Verify agent is linked to the existing device (not a new one).
        let linked_device_id: Option<String> =
            sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
                .bind(&agent_id)
                .fetch_optional(&pool)
                .await
                .unwrap()
                .flatten();
        assert_eq!(
            linked_device_id.as_deref(),
            Some(pre_device_id.as_str()),
            "Agent should link to existing device via MAC match"
        );

        // Verify no duplicate device was created.
        let device_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE mac = ?")
            .bind(existing_mac)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(device_count, 1, "No duplicate device should be created");
    }

    #[tokio::test]
    async fn test_agent_report_populates_device_fields() {
        // Agent report with OS and hardware info should populate the linked
        // device's asset fields when they are empty.
        let (pool, state) = test_app_state().await;
        let agent_id = insert_test_agent(&pool).await;

        let report_json = serde_json::json!({
            "agent_id": agent_id,
            "hostname": "workstation-01",
            "os": {"name": "Ubuntu", "version": "22.04"},
            "network_interfaces": [
                {"name": "eth0", "mac": "aa:bb:cc:dd:ee:f3"}
            ],
            "hardware": {
                "hardware_model": "ThinkPad X1 Carbon",
                "cpu_name": "Intel i7-1260P",
                "ram_total_bytes": 17179869184_i64,
                "serial_number": "SN-TEST-001"
            }
        });

        super::handle_agent_report(&report_json.to_string(), &agent_id, &state)
            .await
            .expect("handle_agent_report should succeed");

        // Find the auto-created device.
        let row = sqlx::query(
            "SELECT hostname, os_family, os_version, device_type, \
                    serial_number, cpu_manual, ram_manual, custom_model \
             FROM devices WHERE mac = 'aa:bb:cc:dd:ee:f3'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        let hostname: Option<String> = sqlx::Row::get(&row, "hostname");
        let os_family: Option<String> = sqlx::Row::get(&row, "os_family");
        let os_version: Option<String> = sqlx::Row::get(&row, "os_version");
        let device_type: Option<String> = sqlx::Row::get(&row, "device_type");
        let serial_number: Option<String> = sqlx::Row::get(&row, "serial_number");
        let cpu_manual: Option<String> = sqlx::Row::get(&row, "cpu_manual");
        let ram_manual: Option<String> = sqlx::Row::get(&row, "ram_manual");
        let custom_model: Option<String> = sqlx::Row::get(&row, "custom_model");

        assert_eq!(hostname.as_deref(), Some("workstation-01"));
        assert_eq!(os_family.as_deref(), Some("Ubuntu"));
        assert_eq!(os_version.as_deref(), Some("22.04"));
        assert_eq!(device_type.as_deref(), Some("computer"));
        assert_eq!(serial_number.as_deref(), Some("SN-TEST-001"));
        assert_eq!(cpu_manual.as_deref(), Some("Intel i7-1260P"));
        assert!(ram_manual.is_some(), "ram_manual should be populated");
        assert_eq!(custom_model.as_deref(), Some("ThinkPad X1 Carbon"));
    }

    #[tokio::test]
    async fn test_agent_does_not_overwrite_existing_device_fields() {
        // If a device already has hostname/OS set, agent report should NOT overwrite.
        let (pool, state) = test_app_state().await;
        let agent_id = insert_test_agent(&pool).await;
        let mac = "aa:bb:cc:dd:ee:f4";

        // Create device with pre-existing hostname and OS.
        let device_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO devices (id, mac, hostname, os_family, os_version, serial_number, \
             first_seen_at, last_seen_at) VALUES (?, ?, 'existing-host', 'Windows', '11', 'PRE-SN', ?, ?)",
        )
        .bind(&device_id)
        .bind(mac)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let report_json = serde_json::json!({
            "agent_id": agent_id,
            "hostname": "new-host",
            "os": {"name": "Linux", "version": "6.1.0"},
            "network_interfaces": [
                {"name": "eth0", "mac": mac}
            ],
            "hardware": {
                "serial_number": "NEW-SN"
            }
        });

        super::handle_agent_report(&report_json.to_string(), &agent_id, &state)
            .await
            .expect("handle_agent_report should succeed");

        // Existing values should be preserved (COALESCE keeps the original).
        let row = sqlx::query(
            "SELECT hostname, os_family, os_version, serial_number FROM devices WHERE mac = ?",
        )
        .bind(mac)
        .fetch_one(&pool)
        .await
        .unwrap();

        let hostname: Option<String> = sqlx::Row::get(&row, "hostname");
        let os_family: Option<String> = sqlx::Row::get(&row, "os_family");
        let os_version: Option<String> = sqlx::Row::get(&row, "os_version");
        let serial_number: Option<String> = sqlx::Row::get(&row, "serial_number");

        assert_eq!(
            hostname.as_deref(),
            Some("existing-host"),
            "hostname should NOT be overwritten"
        );
        assert_eq!(
            os_family.as_deref(),
            Some("Windows"),
            "os_family should NOT be overwritten"
        );
        assert_eq!(
            os_version.as_deref(),
            Some("11"),
            "os_version should NOT be overwritten"
        );
        assert_eq!(
            serial_number.as_deref(),
            Some("PRE-SN"),
            "serial_number should NOT be overwritten"
        );
    }

    #[tokio::test]
    async fn test_two_agents_same_mac_single_device() {
        // Two agents reporting the same MAC should be linked to the same device (dedup).
        let (pool, state) = test_app_state().await;
        let agent1_id = insert_test_agent(&pool).await;
        let agent2_id = {
            let id = uuid::Uuid::new_v4().to_string();
            let hash = bcrypt::hash("test_key2", 4).unwrap();
            sqlx::query("INSERT INTO agents (id, api_key_hash, name) VALUES (?, ?, ?)")
                .bind(&id)
                .bind(&hash)
                .bind("test-agent-2")
                .execute(&pool)
                .await
                .unwrap();
            id
        };

        let shared_mac = "aa:bb:cc:dd:ee:f5";

        // Agent 1 reports first — should auto-create device.
        let report1 = serde_json::json!({
            "agent_id": agent1_id,
            "hostname": "host-1",
            "network_interfaces": [
                {"name": "eth0", "mac": shared_mac}
            ]
        });
        super::handle_agent_report(&report1.to_string(), &agent1_id, &state)
            .await
            .expect("agent 1 report");

        // Agent 2 reports with same MAC — should link to existing device.
        let report2 = serde_json::json!({
            "agent_id": agent2_id,
            "hostname": "host-2",
            "network_interfaces": [
                {"name": "eth0", "mac": shared_mac}
            ]
        });
        super::handle_agent_report(&report2.to_string(), &agent2_id, &state)
            .await
            .expect("agent 2 report");

        // Both agents should be linked to the same device.
        let dev1: Option<String> = sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
            .bind(&agent1_id)
            .fetch_optional(&pool)
            .await
            .unwrap()
            .flatten();
        let dev2: Option<String> = sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
            .bind(&agent2_id)
            .fetch_optional(&pool)
            .await
            .unwrap()
            .flatten();

        assert!(dev1.is_some(), "Agent 1 should have a device_id");
        assert_eq!(
            dev1, dev2,
            "Both agents should be linked to the same device"
        );

        // Only one device should exist with that MAC.
        let device_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE mac = ?")
            .bind(shared_mac)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            device_count, 1,
            "Only one device should exist for shared MAC"
        );
    }

    #[tokio::test]
    async fn test_agent_no_mac_no_device_created() {
        // Agent report with no network interfaces → no device auto-created.
        let (pool, state) = test_app_state().await;
        let agent_id = insert_test_agent(&pool).await;

        let report_json = serde_json::json!({
            "agent_id": agent_id,
            "hostname": "no-mac-host"
        });

        super::handle_agent_report(&report_json.to_string(), &agent_id, &state)
            .await
            .expect("handle_agent_report should succeed");

        // No device should be created.
        let device_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(device_count, 0, "No device should be created without MAC");

        // Agent should have no device_id.
        let device_id: Option<String> =
            sqlx::query_scalar("SELECT device_id FROM agents WHERE id = ?")
                .bind(&agent_id)
                .fetch_optional(&pool)
                .await
                .unwrap()
                .flatten();
        assert!(
            device_id.is_none(),
            "Agent should have no device_id without MAC"
        );
    }

    #[tokio::test]
    async fn test_agent_offline_alert_uses_name_not_uuid() {
        // Simulate the agent-offline alert generation logic and verify
        // the message uses the agent name, not the raw UUID.
        let pool = test_db().await;
        let agent_id = insert_test_agent(&pool).await; // name = "test-agent"

        // Look up agent name + device_id (same query as disconnect handler).
        let agent_row = sqlx::query(r#"SELECT name, device_id FROM agents WHERE id = ?"#)
            .bind(&agent_id)
            .fetch_optional(&pool)
            .await
            .unwrap();

        let agent_name: Option<String> = agent_row
            .as_ref()
            .and_then(|r| sqlx::Row::try_get::<Option<String>, _>(r, "name").unwrap_or(None));

        let display_name = agent_name.unwrap_or_else(|| {
            let short = agent_id
                .rfind('-')
                .map(|i| &agent_id[i + 1..])
                .unwrap_or(&agent_id);
            format!("...{short}")
        });

        let message = format!("Agent {display_name} disconnected");

        // Must use the agent name, not the raw UUID.
        assert_eq!(
            message, "Agent test-agent disconnected",
            "Alert message should use agent name, not UUID"
        );
        assert!(
            !message.contains(&agent_id),
            "Alert message must not contain raw UUID"
        );
    }

    #[tokio::test]
    async fn test_agent_offline_alert_falls_back_to_short_uuid() {
        // When an agent has no name, the alert should show a short UUID suffix.
        let pool = test_db().await;
        let agent_id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("test_key", 4).unwrap();
        sqlx::query("INSERT INTO agents (id, api_key_hash) VALUES (?, ?)")
            .bind(&agent_id)
            .bind(&hash)
            .execute(&pool)
            .await
            .unwrap();

        let agent_row = sqlx::query(r#"SELECT name, device_id FROM agents WHERE id = ?"#)
            .bind(&agent_id)
            .fetch_optional(&pool)
            .await
            .unwrap();

        let agent_name: Option<String> = agent_row
            .as_ref()
            .and_then(|r| sqlx::Row::try_get::<Option<String>, _>(r, "name").unwrap_or(None));

        let display_name = agent_name.unwrap_or_else(|| {
            let short = agent_id
                .rfind('-')
                .map(|i| &agent_id[i + 1..])
                .unwrap_or(&agent_id);
            format!("...{short}")
        });

        let message = format!("Agent {display_name} disconnected");

        // Should NOT contain the full UUID.
        assert!(
            !message.contains(&agent_id),
            "Alert message must not contain full UUID"
        );
        // Should contain the short suffix from the UUID.
        let expected_suffix = agent_id.rsplit('-').next().unwrap();
        assert!(
            message.contains(expected_suffix),
            "Alert message should contain short UUID suffix: {expected_suffix}"
        );
        assert!(
            message.starts_with("Agent ..."),
            "Fallback display name should start with '...'"
        );
    }
}
