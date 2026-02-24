//! VPN Status Dashboard API endpoints.
//!
//! Provides a unified view of VPN tunnel status across VyOS and MikroTik
//! routers — WireGuard peer connectivity, handshake recency, and transfer stats.

use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::vyos::client::VyosClient;

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

async fn vyos_client(state: &AppState) -> Option<VyosClient> {
    let url = get_setting(state, "vyos_url").await?;
    let key = get_setting(state, "vyos_api_key").await?;
    Some(VyosClient::with_http(&url, &key, state.vyos_http.clone()))
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
    /// "vyos" or "mikrotik"
    pub source: String,
}

/// Overall VPN status summary.
#[derive(Debug, Serialize)]
pub struct VpnStatusResponse {
    pub vyos_available: bool,
    pub mikrotik_available: bool,
    pub interfaces: Vec<VpnInterfaceStatus>,
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
    let vyos = vyos_client(&state).await;
    let mikrotik = mikrotik_client(&state).await;
    let vyos_available = vyos.is_some();
    let mikrotik_available = mikrotik.is_some();

    let now = chrono::Utc::now().timestamp();
    // 3 minutes = 180 seconds threshold for "online"
    const HANDSHAKE_ONLINE_THRESHOLD_SECS: i64 = 180;

    let mut interfaces: Vec<VpnInterfaceStatus> = Vec::new();

    // ── VyOS WireGuard ──
    if let Some(client) = vyos {
        if let Ok(config) = client.retrieve(&["interfaces", "wireguard"]).await {
            let mut wg_ifaces = super::vyos::parse_wireguard_config(&config);

            // Fetch interface link status
            if let Ok(iface_raw) = client.show(&["interfaces"]).await {
                let iface_text = iface_raw.as_str().unwrap_or("");
                let iface_list = super::vyos::parse_interfaces_text(iface_text);
                for wg in &mut wg_ifaces {
                    if let Some(sys_iface) = iface_list.iter().find(|i| i.name == wg.name) {
                        wg.status = Some(sys_iface.link_state.clone());
                    }
                }
            }

            // Fetch runtime stats per interface
            for wg in &mut wg_ifaces {
                if let Ok(raw) = client.show(&["interfaces", "wireguard", &wg.name]).await {
                    let text = raw.as_str().unwrap_or("");
                    super::vyos::merge_wireguard_runtime_stats(wg, text);
                }
            }

            for wg in wg_ifaces {
                let peers: Vec<VpnPeerStatus> = wg
                    .peers
                    .into_iter()
                    .map(|p| {
                        let connectivity = if let Some(hs) = p.last_handshake {
                            if now - hs < HANDSHAKE_ONLINE_THRESHOLD_SECS {
                                "online".to_string()
                            } else {
                                "offline".to_string()
                            }
                        } else {
                            "offline".to_string()
                        };
                        VpnPeerStatus {
                            name: p.name,
                            public_key: p.public_key,
                            endpoint: p.endpoint,
                            allowed_ips: p.allowed_ips,
                            last_handshake: p.last_handshake,
                            rx_bytes: p.rx_bytes,
                            tx_bytes: p.tx_bytes,
                            connectivity,
                        }
                    })
                    .collect();

                let peers_online = peers.iter().filter(|p| p.connectivity == "online").count();
                let peers_total = peers.len();

                interfaces.push(VpnInterfaceStatus {
                    name: wg.name,
                    address: wg.address,
                    port: wg.port,
                    public_key: wg.public_key,
                    status: wg.status,
                    peers,
                    peers_online,
                    peers_total,
                    source: "vyos".to_string(),
                });
            }
        }
    }

    // ── MikroTik WireGuard ──
    if let Some(client) = mikrotik {
        let wg_ifaces = client.wireguard_interfaces().await.unwrap_or_default();
        let wg_peers = client.wireguard_peers().await.unwrap_or_default();

        fn is_true(val: &Option<String>) -> bool {
            val.as_deref() == Some("true")
        }

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
            });
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
        vyos_available,
        mikrotik_available,
        interfaces,
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
