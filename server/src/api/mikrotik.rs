//! MikroTik RouterOS API handler endpoints.
//!
//! These endpoints proxy requests to a MikroTik router via its REST API,
//! using cached responses to avoid redundant network calls.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;

// ── Helper: build a MikroTik client from DB settings ───────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Try to construct a MikroTik client from saved settings.
/// Returns `None` if MikroTik is not configured or not enabled.
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

// ── Response types ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikStatusResponse {
    pub configured: bool,
    pub reachable: bool,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub cpu_load: Option<String>,
    pub total_memory: Option<String>,
    pub free_memory: Option<String>,
    pub board_name: Option<String>,
    pub architecture: Option<String>,
    pub platform: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikInterfaceResponse {
    pub name: String,
    pub iface_type: Option<String>,
    pub mac: Option<String>,
    pub ip_address: Option<String>,
    pub mtu: Option<String>,
    pub disabled: bool,
    pub running: bool,
    pub comment: Option<String>,
    pub tx_bytes: Option<String>,
    pub rx_bytes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikRouteResponse {
    pub dst_address: String,
    pub gateway: Option<String>,
    pub distance: Option<String>,
    pub routing_table: Option<String>,
    pub active: bool,
    pub dynamic: bool,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikDhcpLeaseResponse {
    pub address: String,
    pub mac_address: Option<String>,
    pub host_name: Option<String>,
    pub status: Option<String>,
    pub expires_after: Option<String>,
    pub server: Option<String>,
    pub dynamic: bool,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikFirewallResponse {
    pub filter_rules: Vec<MikrotikFirewallRule>,
    pub nat_rules: Vec<MikrotikNatRule>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikFirewallRule {
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub dst_port: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub bytes: Option<String>,
    pub packets: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikNatRule {
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub dst_port: Option<String>,
    pub to_addresses: Option<String>,
    pub to_ports: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikDnsResponse {
    pub servers: Vec<String>,
    pub allow_remote_requests: bool,
    pub cache_size: Option<String>,
    pub cache_used: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikWireguardResponse {
    pub interfaces: Vec<MikrotikWgInterface>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikWgInterface {
    pub name: String,
    pub listen_port: Option<String>,
    pub public_key: Option<String>,
    pub mtu: Option<String>,
    pub disabled: bool,
    pub running: bool,
    pub peers: Vec<MikrotikWgPeer>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikWgPeer {
    pub public_key: Option<String>,
    pub endpoint: Option<String>,
    pub allowed_address: Option<String>,
    pub rx: Option<String>,
    pub tx: Option<String>,
    pub last_handshake: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

// ── Helpers ────────────────────────────────────────────────

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

// ── Endpoints ──────────────────────────────────────────────

/// GET /api/v1/mikrotik/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<MikrotikStatusResponse>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Ok(Json(MikrotikStatusResponse {
            configured: false,
            reachable: false,
            version: None,
            uptime: None,
            cpu_load: None,
            total_memory: None,
            free_memory: None,
            board_name: None,
            architecture: None,
            platform: None,
        }));
    };

    // Check cache first
    if let Some(cached) = state.mikrotik_cache.get("status") {
        if let Ok(resp) = serde_json::from_value::<MikrotikStatusResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    match client.system_resource().await {
        Ok(res) => {
            let resp = MikrotikStatusResponse {
                configured: true,
                reachable: true,
                version: res.version,
                uptime: res.uptime,
                cpu_load: res.cpu_load,
                total_memory: res.total_memory,
                free_memory: res.free_memory,
                board_name: res.board_name,
                architecture: res.architecture,
                platform: res.platform,
            };
            if let Ok(val) = serde_json::to_value(&resp) {
                state.mikrotik_cache.set("status".into(), val);
            }
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::warn!("MikroTik status check failed: {e}");
            Ok(Json(MikrotikStatusResponse {
                configured: true,
                reachable: false,
                version: None,
                uptime: None,
                cpu_load: None,
                total_memory: None,
                free_memory: None,
                board_name: None,
                architecture: None,
                platform: None,
            }))
        }
    }
}

/// GET /api/v1/mikrotik/interfaces
pub async fn interfaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikInterfaceResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("interfaces") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let ifaces = client.interfaces().await.map_err(|e| {
        tracing::error!("MikroTik interfaces error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Fetch IP addresses to join onto interfaces
    let addrs = client.ip_addresses().await.unwrap_or_default();

    let result: Vec<MikrotikInterfaceResponse> = ifaces
        .into_iter()
        .map(|iface| {
            let name = iface.name.clone().unwrap_or_default();
            let ip = addrs
                .iter()
                .find(|a| a.interface.as_deref() == Some(&name))
                .and_then(|a| a.address.clone());
            MikrotikInterfaceResponse {
                name,
                iface_type: iface.iface_type,
                mac: iface.mac_address,
                ip_address: ip,
                mtu: iface.mtu,
                disabled: is_true(&iface.disabled),
                running: is_true(&iface.running),
                comment: iface.comment,
                tx_bytes: iface.tx_byte,
                rx_bytes: iface.rx_byte,
            }
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("interfaces".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/routes
pub async fn routes(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikRouteResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("routes") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let routes = client.ip_routes().await.map_err(|e| {
        tracing::error!("MikroTik routes error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikRouteResponse> = routes
        .into_iter()
        .map(|r| MikrotikRouteResponse {
            dst_address: r.dst_address.unwrap_or_default(),
            gateway: r.gateway,
            distance: r.distance,
            routing_table: r.routing_table,
            active: is_true(&r.active),
            dynamic: is_true(&r.dynamic),
            disabled: is_true(&r.disabled),
            comment: r.comment,
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("routes".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/dhcp-leases
pub async fn dhcp_leases(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikDhcpLeaseResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("dhcp-leases") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let leases = client.dhcp_leases().await.map_err(|e| {
        tracing::error!("MikroTik DHCP leases error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikDhcpLeaseResponse> = leases
        .into_iter()
        .map(|l| MikrotikDhcpLeaseResponse {
            address: l.address.unwrap_or_default(),
            mac_address: l.mac_address,
            host_name: l.host_name,
            status: l.status,
            expires_after: l.expires_after,
            server: l.server,
            dynamic: is_true(&l.dynamic),
            disabled: is_true(&l.disabled),
            comment: l.comment,
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("dhcp-leases".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/firewall
pub async fn firewall(
    State(state): State<AppState>,
) -> Result<Json<MikrotikFirewallResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("firewall") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let filter = client.firewall_filter().await.unwrap_or_default();
    let nat = client.firewall_nat().await.unwrap_or_default();

    let filter_rules: Vec<MikrotikFirewallRule> = filter
        .into_iter()
        .map(|f| MikrotikFirewallRule {
            chain: f.chain,
            action: f.action,
            protocol: f.protocol,
            src_address: f.src_address,
            dst_address: f.dst_address,
            dst_port: f.dst_port,
            comment: f.comment,
            disabled: is_true(&f.disabled),
            bytes: f.bytes,
            packets: f.packets,
        })
        .collect();

    let nat_rules: Vec<MikrotikNatRule> = nat
        .into_iter()
        .map(|n| MikrotikNatRule {
            chain: n.chain,
            action: n.action,
            protocol: n.protocol,
            src_address: n.src_address,
            dst_address: n.dst_address,
            dst_port: n.dst_port,
            to_addresses: n.to_addresses,
            to_ports: n.to_ports,
            out_interface: n.out_interface,
            comment: n.comment,
            disabled: is_true(&n.disabled),
        })
        .collect();

    let result = MikrotikFirewallResponse {
        filter_rules,
        nat_rules,
    };

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("firewall".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/dns
pub async fn dns(
    State(state): State<AppState>,
) -> Result<Json<MikrotikDnsResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("dns") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let dns = client.dns().await.map_err(|e| {
        tracing::error!("MikroTik DNS error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let servers: Vec<String> = dns
        .servers
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let result = MikrotikDnsResponse {
        servers,
        allow_remote_requests: is_true(&dns.allow_remote_requests),
        cache_size: dns.cache_size,
        cache_used: dns.cache_used,
    };

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("dns".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/wireguard
pub async fn wireguard(
    State(state): State<AppState>,
) -> Result<Json<MikrotikWireguardResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("wireguard") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    // WireGuard may not be available on all RouterOS installations.
    // Gracefully return empty if the endpoint fails.
    let wg_ifaces = client.wireguard_interfaces().await.unwrap_or_default();
    let wg_peers = client.wireguard_peers().await.unwrap_or_default();

    let interfaces: Vec<MikrotikWgInterface> = wg_ifaces
        .into_iter()
        .map(|iface| {
            let name = iface.name.clone().unwrap_or_default();
            let peers: Vec<MikrotikWgPeer> = wg_peers
                .iter()
                .filter(|p| p.interface.as_deref() == Some(&name))
                .map(|p| {
                    let endpoint = match (&p.current_endpoint_address, &p.current_endpoint_port) {
                        (Some(addr), Some(port)) => Some(format!("{addr}:{port}")),
                        (Some(addr), None) => Some(addr.clone()),
                        _ => None,
                    };
                    MikrotikWgPeer {
                        public_key: p.public_key.clone(),
                        endpoint,
                        allowed_address: p.allowed_address.clone(),
                        rx: p.rx.clone(),
                        tx: p.tx.clone(),
                        last_handshake: p.last_handshake.clone(),
                        disabled: is_true(&p.disabled),
                        comment: p.comment.clone(),
                    }
                })
                .collect();

            MikrotikWgInterface {
                name,
                listen_port: iface.listen_port,
                public_key: iface.public_key,
                mtu: iface.mtu,
                disabled: is_true(&iface.disabled),
                running: is_true(&iface.running),
                peers,
            }
        })
        .collect();

    let result = MikrotikWireguardResponse { interfaces };

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("wireguard".into(), val);
    }
    Ok(Json(result))
}
