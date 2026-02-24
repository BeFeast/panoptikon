use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;

use super::AppState;

/// Unified VPN peer status across router types.
#[derive(Debug, Serialize)]
pub struct VpnPeerStatus {
    pub name: String,
    pub public_key: Option<String>,
    pub endpoint: Option<String>,
    pub allowed_ips: Vec<String>,
    pub last_handshake: Option<i64>,
    pub rx_bytes: Option<u64>,
    pub tx_bytes: Option<u64>,
    /// Whether the peer is considered online (handshake within last 3 minutes).
    pub is_online: bool,
}

/// Unified VPN interface status across router types.
#[derive(Debug, Serialize)]
pub struct VpnInterfaceStatus {
    pub name: String,
    /// "up", "down", or null if unknown.
    pub status: Option<String>,
    pub listen_port: Option<u32>,
    pub public_key: Option<String>,
    pub peers: Vec<VpnPeerStatus>,
}

/// Response for the VPN status dashboard endpoint.
#[derive(Debug, Serialize)]
pub struct VpnStatusResponse {
    /// Which router backend provided the data: "vyos", "mikrotik", or "none".
    pub router_type: String,
    pub interfaces: Vec<VpnInterfaceStatus>,
}

/// Three-minute threshold for considering a peer online (in seconds).
const ONLINE_THRESHOLD_SECS: i64 = 180;

/// GET /api/v1/vpn/status — unified VPN status across VyOS and MikroTik.
pub async fn vpn_status(
    State(state): State<AppState>,
) -> Result<Json<VpnStatusResponse>, StatusCode> {
    // Try VyOS first.
    if let Some(resp) = fetch_vyos_vpn_status(&state).await {
        return Ok(Json(resp));
    }

    // Fall back to MikroTik.
    if let Some(resp) = fetch_mikrotik_vpn_status(&state).await {
        return Ok(Json(resp));
    }

    // Neither router is configured — return empty.
    Ok(Json(VpnStatusResponse {
        router_type: "none".to_string(),
        interfaces: vec![],
    }))
}

/// Fetch WireGuard status from VyOS and normalise into unified types.
async fn fetch_vyos_vpn_status(state: &AppState) -> Option<VpnStatusResponse> {
    let client =
        super::vyos::get_vyos_client_from_db(&state.db, &state.config, &state.vyos_http).await?;

    let config = client.retrieve(&["interfaces", "wireguard"]).await.ok()?;

    let mut wg_interfaces = super::vyos::parse_wireguard_config(&config);

    // Fetch interface link status.
    if let Ok(iface_raw) = client.show(&["interfaces"]).await {
        let iface_text = iface_raw.as_str().unwrap_or("");
        let iface_list = super::vyos::parse_interfaces_text(iface_text);
        for wg in &mut wg_interfaces {
            if let Some(sys_iface) = iface_list.iter().find(|i| i.name == wg.name) {
                wg.status = Some(sys_iface.link_state.clone());
            }
        }
    }

    // Fetch per-interface runtime stats.
    for wg in &mut wg_interfaces {
        if let Ok(raw) = client.show(&["interfaces", "wireguard", &wg.name]).await {
            let text = raw.as_str().unwrap_or("");
            super::vyos::merge_wireguard_runtime_stats(wg, text);
        }
    }

    let now = chrono::Utc::now().timestamp();
    let interfaces = wg_interfaces
        .into_iter()
        .map(|iface| VpnInterfaceStatus {
            name: iface.name,
            status: iface.status,
            listen_port: iface.port,
            public_key: iface.public_key,
            peers: iface
                .peers
                .into_iter()
                .map(|p| {
                    let is_online = p
                        .last_handshake
                        .map(|ts| (now - ts).abs() < ONLINE_THRESHOLD_SECS)
                        .unwrap_or(false);
                    VpnPeerStatus {
                        name: p.name,
                        public_key: p.public_key,
                        endpoint: p.endpoint,
                        allowed_ips: p.allowed_ips,
                        last_handshake: p.last_handshake,
                        rx_bytes: p.rx_bytes,
                        tx_bytes: p.tx_bytes,
                        is_online,
                    }
                })
                .collect(),
        })
        .collect();

    Some(VpnStatusResponse {
        router_type: "vyos".to_string(),
        interfaces,
    })
}

/// Fetch WireGuard status from MikroTik and normalise into unified types.
async fn fetch_mikrotik_vpn_status(state: &AppState) -> Option<VpnStatusResponse> {
    let client = super::mikrotik::mikrotik_client(state).await?;

    let wg_ifaces = client.wireguard_interfaces().await.unwrap_or_default();
    let wg_peers = client.wireguard_peers().await.unwrap_or_default();

    let interfaces = wg_ifaces
        .into_iter()
        .map(|iface| {
            let name = iface.name.clone().unwrap_or_default();
            let running = iface
                .running
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(false);
            let disabled = iface
                .disabled
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(false);
            let status = if disabled {
                Some("down".to_string())
            } else if running {
                Some("up".to_string())
            } else {
                Some("down".to_string())
            };

            let listen_port = iface
                .listen_port
                .as_deref()
                .and_then(|s| s.parse::<u32>().ok());

            let peers: Vec<VpnPeerStatus> = wg_peers
                .iter()
                .filter(|p| p.interface.as_deref() == Some(&name))
                .map(|p| {
                    let endpoint = match (&p.current_endpoint_address, &p.current_endpoint_port) {
                        (Some(addr), Some(port)) => Some(format!("{addr}:{port}")),
                        (Some(addr), None) => Some(addr.clone()),
                        _ => None,
                    };
                    let rx_bytes = p.rx.as_deref().and_then(|s| s.parse::<u64>().ok());
                    let tx_bytes = p.tx.as_deref().and_then(|s| s.parse::<u64>().ok());
                    let last_handshake_ts = p
                        .last_handshake
                        .as_deref()
                        .and_then(parse_mikrotik_handshake);
                    let now = chrono::Utc::now().timestamp();
                    let is_online = last_handshake_ts
                        .map(|ts| (now - ts).abs() < ONLINE_THRESHOLD_SECS)
                        .unwrap_or(false);

                    let allowed_ips = p
                        .allowed_address
                        .as_deref()
                        .map(|s| {
                            s.split(',')
                                .map(|a| a.trim().to_string())
                                .filter(|a| !a.is_empty())
                                .collect()
                        })
                        .unwrap_or_default();

                    VpnPeerStatus {
                        name: p.comment.clone().unwrap_or_default(),
                        public_key: p.public_key.clone(),
                        endpoint,
                        allowed_ips,
                        last_handshake: last_handshake_ts,
                        rx_bytes,
                        tx_bytes,
                        is_online,
                    }
                })
                .collect();

            VpnInterfaceStatus {
                name,
                status,
                listen_port,
                public_key: iface.public_key,
                peers,
            }
        })
        .collect();

    Some(VpnStatusResponse {
        router_type: "mikrotik".to_string(),
        interfaces,
    })
}

/// Parse a MikroTik relative handshake time string into a UNIX timestamp.
///
/// MikroTik formats like "1m30s", "2h5m12s", "3d1h2m3s", or an epoch seconds
/// value. Returns `None` if parsing fails.
fn parse_mikrotik_handshake(text: &str) -> Option<i64> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    // If it's a pure number, treat as epoch timestamp.
    if let Ok(ts) = text.parse::<i64>() {
        return Some(ts);
    }

    // Parse relative duration like "1m30s", "2h5m12s".
    let mut total_secs: i64 = 0;
    let mut num_buf = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() {
            num_buf.push(ch);
        } else {
            let n: i64 = num_buf.parse().unwrap_or(0);
            num_buf.clear();
            match ch {
                'w' => total_secs += n * 7 * 86400,
                'd' => total_secs += n * 86400,
                'h' => total_secs += n * 3600,
                'm' => total_secs += n * 60,
                's' => total_secs += n,
                _ => {}
            }
        }
    }

    if total_secs > 0 {
        Some(chrono::Utc::now().timestamp() - total_secs)
    } else {
        None
    }
}
