//! VPN Status Dashboard API endpoints.
//!
//! Provides a unified view of VPN tunnel status from MikroTik
//! routers — WireGuard peer connectivity, handshake recency, transfer stats,
//! and OpenVPN connected clients.

use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;

use super::AppState;
use crate::mikrotik::client::MikrotikClient;

// ── Helpers ─────────────────────────────────────────────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

async fn mikrotik_client(state: &AppState) -> Option<MikrotikClient> {
    let enabled = get_setting(state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting(state, "mikrotik_url").await?;
    let user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    Some(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        state.mikrotik_http.clone(),
    ))
}

// ── Response types ──────────────────────────────────────────

/// Per-peer status with connectivity indicator.
#[derive(Debug, Serialize)]
pub struct VpnPeerStatus {
    pub name: String,
    pub public_key: Option<String>,
    pub endpoint: Option<String>,
    pub allowed_ips: Vec<String>,
    pub last_handshake: Option<i64>,
    pub rx_bytes: Option<u64>,
    pub tx_bytes: Option<u64>,
    /// "online" if handshake within last 3 minutes, "offline" otherwise.
    pub connectivity: String,
}

/// Per-interface status.
#[derive(Debug, Serialize)]
pub struct VpnInterfaceStatus {
    pub name: String,
    pub address: Option<String>,
    pub port: Option<u32>,
    pub public_key: Option<String>,
    pub status: Option<String>,
    pub peers: Vec<VpnPeerStatus>,
    pub peers_online: usize,
    pub peers_total: usize,
    /// "mikrotik" or "mikrotik-ovpn"
    pub source: String,
    /// VPN type: "wireguard" or "openvpn"
    pub vpn_type: String,
}

/// OpenVPN connected client info.
#[derive(Debug, Serialize)]
pub struct OvpnConnectedClient {
    pub name: String,
    pub user: Option<String>,
    pub client_address: Option<String>,
    pub encoding: Option<String>,
    pub uptime: Option<String>,
    pub running: bool,
}

/// Overall VPN status summary.
#[derive(Debug, Serialize)]
pub struct VpnStatusResponse {
    pub mikrotik_available: bool,
    pub openvpn_available: bool,
    pub interfaces: Vec<VpnInterfaceStatus>,
    pub openvpn_clients: Vec<OvpnConnectedClient>,
    pub total_peers: usize,
    pub online_peers: usize,
    pub total_rx_bytes: u64,
    pub total_tx_bytes: u64,
}

// ── Handler ────────────────────────────────────────────────

/// GET /api/v1/vpn-status
pub async fn vpn_status(
    State(state): State<AppState>,
) -> Result<Json<VpnStatusResponse>, StatusCode> {
    let mikrotik = mikrotik_client(&state).await;
    // mikrotik_available is determined after we check for WireGuard interfaces
    let mut mikrotik_available = false;
    let mut openvpn_available = false;

    let now = chrono::Utc::now().timestamp();
    // 3 minutes = 180 seconds threshold for "online"
    const HANDSHAKE_ONLINE_THRESHOLD_SECS: i64 = 180;

    let mut interfaces: Vec<VpnInterfaceStatus> = Vec::new();
    let mut openvpn_clients: Vec<OvpnConnectedClient> = Vec::new();

    fn is_true(val: &Option<String>) -> bool {
        val.as_deref() == Some("true")
    }

    // ── MikroTik WireGuard ──
    if let Some(ref client) = mikrotik {
        let wg_ifaces = client.wireguard_interfaces().await.unwrap_or_default();
        // Only mark MikroTik as available if it has WireGuard interfaces
        mikrotik_available = !wg_ifaces.is_empty();
        let wg_peers = client.wireguard_peers().await.unwrap_or_default();

        for iface in wg_ifaces {
            let iface_name = iface.name.clone().unwrap_or_default();

            let peers: Vec<VpnPeerStatus> = wg_peers
                .iter()
                .filter(|p| p.interface.as_deref() == Some(&iface_name))
                .map(|p| {
                    let last_handshake = parse_mikrotik_handshake(&p.last_handshake, now);
                    let connectivity = if let Some(hs) = last_handshake {
                        if now - hs < HANDSHAKE_ONLINE_THRESHOLD_SECS {
                            "online".to_string()
                        } else {
                            "offline".to_string()
                        }
                    } else {
                        "offline".to_string()
                    };
                    let rx_bytes = p.rx.as_deref().and_then(|s| s.parse::<u64>().ok());
                    let tx_bytes = p.tx.as_deref().and_then(|s| s.parse::<u64>().ok());
                    let endpoint = match (&p.current_endpoint_address, &p.current_endpoint_port) {
                        (Some(addr), Some(port)) => Some(format!("{addr}:{port}")),
                        (Some(addr), None) => Some(addr.clone()),
                        _ => None,
                    };

                    VpnPeerStatus {
                        name: p.comment.clone().unwrap_or_default(),
                        public_key: p.public_key.clone(),
                        endpoint,
                        allowed_ips: p
                            .allowed_address
                            .clone()
                            .map(|a| vec![a])
                            .unwrap_or_default(),
                        last_handshake,
                        rx_bytes,
                        tx_bytes,
                        connectivity,
                    }
                })
                .collect();

            let peers_online = peers.iter().filter(|p| p.connectivity == "online").count();
            let peers_total = peers.len();

            interfaces.push(VpnInterfaceStatus {
                name: iface_name,
                address: None,
                port: iface.listen_port.and_then(|s| s.parse().ok()),
                public_key: iface.public_key,
                status: Some(if is_true(&iface.running) {
                    "up".to_string()
                } else {
                    "down".to_string()
                }),
                peers,
                peers_online,
                peers_total,
                source: "mikrotik".to_string(),
                vpn_type: "wireguard".to_string(),
            });
        }
    }

    // ── MikroTik OpenVPN ──
    if let Some(ref client) = mikrotik {
        // Check if OpenVPN server is enabled
        if let Ok(srv) = client.ovpn_server().await {
            let enabled = is_true(&srv.enabled);
            if enabled {
                openvpn_available = true;

                // Get active OpenVPN connections
                let ovpn_ifaces = client.ovpn_server_interfaces().await.unwrap_or_default();

                let clients: Vec<OvpnConnectedClient> = ovpn_ifaces
                    .iter()
                    .map(|c| OvpnConnectedClient {
                        name: c.name.clone().unwrap_or_default(),
                        user: c.user.clone(),
                        client_address: c.client_address.clone(),
                        encoding: c.encoding.clone(),
                        uptime: c.uptime.clone(),
                        running: is_true(&c.running),
                    })
                    .collect();

                let running_count = clients.iter().filter(|c| c.running).count();
                let total_count = clients.len();

                openvpn_clients = clients;

                // Add OpenVPN as a virtual interface in the list
                let port = srv.port.and_then(|p| p.parse().ok());
                interfaces.push(VpnInterfaceStatus {
                    name: "ovpn-server".to_string(),
                    address: None,
                    port,
                    public_key: None,
                    status: Some("up".to_string()),
                    peers: Vec::new(), // OpenVPN clients listed separately
                    peers_online: running_count,
                    peers_total: total_count,
                    source: "mikrotik-ovpn".to_string(),
                    vpn_type: "openvpn".to_string(),
                });
            }
        }
    }

    let total_peers: usize = interfaces.iter().map(|i| i.peers_total).sum();
    let online_peers: usize = interfaces.iter().map(|i| i.peers_online).sum();
    let total_rx_bytes: u64 = interfaces
        .iter()
        .flat_map(|i| &i.peers)
        .filter_map(|p| p.rx_bytes)
        .sum();
    let total_tx_bytes: u64 = interfaces
        .iter()
        .flat_map(|i| &i.peers)
        .filter_map(|p| p.tx_bytes)
        .sum();

    Ok(Json(VpnStatusResponse {
        mikrotik_available,
        openvpn_available,
        interfaces,
        openvpn_clients,
        total_peers,
        online_peers,
        total_rx_bytes,
        total_tx_bytes,
    }))
}

/// Parse MikroTik handshake duration string (e.g. "1h2m3s") into a UNIX timestamp.
fn parse_mikrotik_handshake(raw: &Option<String>, now: i64) -> Option<i64> {
    let text = raw.as_deref()?.trim();
    if text.is_empty() || text == "0" {
        return None;
    }

    // Try to parse as pure number of seconds first
    if let Ok(secs) = text.parse::<i64>() {
        return Some(now - secs);
    }

    // Parse duration like "1d2h3m4s"
    let mut total_secs: i64 = 0;
    let mut num_buf = String::new();

    for ch in text.chars() {
        if ch.is_ascii_digit() {
            num_buf.push(ch);
        } else {
            if let Ok(n) = num_buf.parse::<i64>() {
                match ch {
                    'd' => total_secs += n * 86400,
                    'h' => total_secs += n * 3600,
                    'm' => total_secs += n * 60,
                    's' => total_secs += n,
                    _ => {}
                }
            }
            num_buf.clear();
        }
    }

    if total_secs > 0 {
        Some(now - total_secs)
    } else {
        None
    }
}
