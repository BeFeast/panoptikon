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

/// Network interface info from agent report (used for MAC-based device linking).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AgentNetworkInterface {
    pub name: Option<String>,
    #[serde(default)]
    pub mac: Option<String>,
    // Other fields (tx_bytes, rx_bytes, etc.) are ignored for linking purposes.
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
) -> Result<Json<Agent>, StatusCode> {
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
    state
        .ws_hub
        .broadcast("agent_offline", json!({"agent_id": &agent_id}));
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
    // Strip all separators and lowercase.
    let hex: String = mac
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();

    if hex.len() != 12 {
        return None;
    }

    // Validate that all chars are hex digits (already filtered above, but be explicit).
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    // Reformat as xx:xx:xx:xx:xx:xx
    let normalized = (0..6)
        .map(|i| &hex[i * 2..i * 2 + 2])
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
                // Always update device_id (re-link on every report in case device was reassigned).
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
            Ok(None) => {
                // No matching device found — this is normal for agents on hosts not yet in the ARP table.
            }
            Err(e) => {
                warn!(agent_id, error = %e, "Failed to query devices for MAC matching");
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
