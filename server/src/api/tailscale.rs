//! Tailscale status API endpoint.
//!
//! Queries the Tailscale daemon's local API via its Unix socket to retrieve
//! the current node status, connected peers, subnet routes, and exit node state.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::{AppError, AppState};

// ── Default socket path ─────────────────────────────────────

const DEFAULT_SOCKET_PATH: &str = "/var/run/tailscale/tailscaled.sock";

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

fn socket_path(state: &AppState) -> String {
    state
        .config
        .tailscale_socket
        .clone()
        .unwrap_or_else(|| DEFAULT_SOCKET_PATH.to_string())
}

// ── Tailscale local API types (deserialized from daemon) ────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TsStatus {
    backend_state: Option<String>,
    #[serde(rename = "Self")]
    self_node: Option<TsNode>,
    #[serde(default)]
    peer: HashMap<String, TsNode>,
    magic_dns_suffix: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TsNode {
    #[serde(default)]
    host_name: String,
    #[serde(rename = "DNSName", default)]
    dns_name: String,
    #[serde(rename = "OS", default)]
    os: String,
    #[serde(rename = "TailscaleIPs", default)]
    tailscale_ips: Vec<String>,
    #[serde(default)]
    online: bool,
    #[serde(default)]
    exit_node: bool,
    #[serde(default)]
    exit_node_option: bool,
    #[serde(default)]
    active: bool,
    #[serde(default)]
    primary_routes: Option<Vec<String>>,
    #[serde(default)]
    rx_bytes: Option<u64>,
    #[serde(default)]
    tx_bytes: Option<u64>,
    #[serde(default)]
    last_seen: Option<String>,
}

// ── Public response types ───────────────────────────────────

#[derive(Debug, Serialize)]
pub struct TailscaleStatusResponse {
    pub connected: bool,
    pub backend_state: String,
    pub hostname: String,
    pub dns_name: String,
    pub tailscale_ips: Vec<String>,
    pub os: String,
    pub exit_node: bool,
    pub exit_node_option: bool,
    pub subnet_routes: Vec<String>,
    pub magic_dns_suffix: String,
    pub peers: Vec<TailscalePeer>,
    pub online_peers: usize,
    pub total_peers: usize,
}

#[derive(Debug, Serialize)]
pub struct TailscalePeer {
    pub hostname: String,
    pub dns_name: String,
    pub os: String,
    pub tailscale_ips: Vec<String>,
    pub online: bool,
    pub active: bool,
    pub exit_node: bool,
    pub exit_node_option: bool,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub last_seen: Option<String>,
}

// ── Unix socket HTTP helper ─────────────────────────────────

/// Make a GET request to the Tailscale local API over its Unix socket.
async fn ts_api_get(socket: &str, path: &str) -> Result<Vec<u8>, String> {
    let mut stream = tokio::net::UnixStream::connect(socket)
        .await
        .map_err(|e| format!("Cannot connect to Tailscale socket at {socket}: {e}"))?;

    let request = format!("GET {path} HTTP/1.0\r\nHost: local-tailscaled.sock\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to Tailscale socket: {e}"))?;
    stream
        .shutdown()
        .await
        .map_err(|e| format!("Failed to shutdown write: {e}"))?;

    let mut buf = Vec::new();
    stream
        .read_to_end(&mut buf)
        .await
        .map_err(|e| format!("Failed to read from Tailscale socket: {e}"))?;

    // Split HTTP headers from body
    let header_end = buf
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("Invalid HTTP response from Tailscale")?;

    Ok(buf[header_end + 4..].to_vec())
}

// ── Handler ─────────────────────────────────────────────────

/// GET /api/v1/tailscale/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<TailscaleStatusResponse>, AppError> {
    let sock = get_setting(&state, "tailscale_socket")
        .await
        .unwrap_or_else(|| socket_path(&state));

    let body = match ts_api_get(&sock, "/localapi/v0/status").await {
        Ok(b) => b,
        Err(_) => {
            // Socket not available → Tailscale not running / not configured
            return Ok(Json(TailscaleStatusResponse {
                connected: false,
                backend_state: "NotRunning".to_string(),
                hostname: String::new(),
                dns_name: String::new(),
                tailscale_ips: vec![],
                os: String::new(),
                exit_node: false,
                exit_node_option: false,
                subnet_routes: vec![],
                magic_dns_suffix: String::new(),
                peers: vec![],
                online_peers: 0,
                total_peers: 0,
            }));
        }
    };

    let ts: TsStatus = serde_json::from_slice(&body)
        .map_err(|e| AppError::Internal(format!("Failed to parse Tailscale status: {e}")))?;

    let backend_state = ts.backend_state.unwrap_or_default();
    let connected = backend_state == "Running";

    let self_node = ts.self_node.unwrap_or(TsNode {
        host_name: String::new(),
        dns_name: String::new(),
        os: String::new(),
        tailscale_ips: vec![],
        online: false,
        exit_node: false,
        exit_node_option: false,
        active: false,
        primary_routes: None,
        rx_bytes: None,
        tx_bytes: None,
        last_seen: None,
    });

    let peers: Vec<TailscalePeer> = ts
        .peer
        .into_values()
        .map(|p| TailscalePeer {
            hostname: p.host_name,
            dns_name: p.dns_name,
            os: p.os,
            tailscale_ips: p.tailscale_ips,
            online: p.online,
            active: p.active,
            exit_node: p.exit_node,
            exit_node_option: p.exit_node_option,
            rx_bytes: p.rx_bytes.unwrap_or(0),
            tx_bytes: p.tx_bytes.unwrap_or(0),
            last_seen: p.last_seen,
        })
        .collect();

    let online_peers = peers.iter().filter(|p| p.online).count();
    let total_peers = peers.len();

    Ok(Json(TailscaleStatusResponse {
        connected,
        backend_state,
        hostname: self_node.host_name,
        dns_name: self_node.dns_name,
        tailscale_ips: self_node.tailscale_ips,
        os: self_node.os,
        exit_node: self_node.exit_node,
        exit_node_option: self_node.exit_node_option,
        subnet_routes: self_node.primary_routes.unwrap_or_default(),
        magic_dns_suffix: ts.magic_dns_suffix.unwrap_or_default(),
        peers,
        online_peers,
        total_peers,
    }))
}
