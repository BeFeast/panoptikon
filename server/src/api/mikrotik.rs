//! MikroTik RouterOS API handler endpoints.
//!
//! These endpoints proxy requests to a MikroTik router via its REST API,
//! using cached responses to avoid redundant network calls.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::{audit, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::{
    DhcpStaticLeaseWriteRequest, FirewallAddressListWriteRequest, FirewallFilterWriteRequest,
    FirewallNatWriteRequest, NetwatchWriteRequest, RouteRuleWriteRequest, VlanWriteRequest,
};

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

#[derive(Debug, Deserialize)]
pub struct MikrotikTestConnectionRequest {
    pub url: Option<String>,
    pub user: Option<String>,
    pub password: Option<String>,
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
pub struct MikrotikVlanResponse {
    pub id: Option<String>,
    pub vlan_id: Option<String>,
    pub name: Option<String>,
    pub interface: Option<String>,
    pub mtu: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikVlanUpsertRequest {
    pub vlan_id: u16,
    pub name: String,
    pub interface: String,
    pub mtu: Option<u16>,
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

#[derive(Debug, Deserialize)]
pub struct MikrotikCreateDhcpStaticRequest {
    pub address: String,
    pub mac_address: String,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikFirewallResponse {
    pub filter_rules: Vec<MikrotikFirewallRule>,
    pub nat_rules: Vec<MikrotikNatRule>,
    pub address_lists: Vec<MikrotikAddressListEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikFirewallRule {
    pub id: Option<String>,
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub src_port: Option<String>,
    pub dst_port: Option<String>,
    pub in_interface: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub bytes: Option<String>,
    pub packets: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikNatRule {
    pub id: Option<String>,
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub dst_port: Option<String>,
    pub to_addresses: Option<String>,
    pub to_ports: Option<String>,
    pub in_interface: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikAddressListEntry {
    pub id: Option<String>,
    pub list: Option<String>,
    pub address: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub dynamic: bool,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikFirewallFilterRequest {
    pub chain: String,
    pub action: String,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub src_port: Option<String>,
    pub dst_port: Option<String>,
    pub in_interface: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikFirewallNatRequest {
    pub chain: String,
    pub action: String,
    pub protocol: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub dst_port: Option<String>,
    pub to_addresses: Option<String>,
    pub to_ports: Option<String>,
    pub in_interface: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikToggleRequest {
    pub disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikAddressListRequest {
    pub list: String,
    pub address: String,
    pub comment: Option<String>,
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

fn validate_vlan_upsert(body: &MikrotikVlanUpsertRequest) -> Result<(), StatusCode> {
    if !(1..=4094).contains(&body.vlan_id) {
        return Err(StatusCode::BAD_REQUEST);
    }
    if body.name.trim().is_empty() || body.interface.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if matches!(body.mtu, Some(0)) {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(())
}

// ── Endpoints ──────────────────────────────────────────────

/// POST /api/v1/mikrotik/test-connection
///
/// Tests connectivity using request body values first (unsaved form fields),
/// then falls back to saved settings for omitted fields.
pub async fn test_connection(
    State(state): State<AppState>,
    Json(body): Json<MikrotikTestConnectionRequest>,
) -> Result<Json<MikrotikStatusResponse>, StatusCode> {
    let url = body
        .url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .or(get_setting(&state, "mikrotik_url").await);

    let Some(url) = url else {
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

    let user = body
        .user
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .or(get_setting(&state, "mikrotik_user").await)
        .unwrap_or_else(|| "admin".to_string());

    let password = match body.password {
        Some(password) => password,
        None => get_setting(&state, "mikrotik_password")
            .await
            .unwrap_or_default(),
    };

    let client = MikrotikClient::with_http(&url, &user, &password, state.mikrotik_http.clone());

    match client.system_resource().await {
        Ok(res) => Ok(Json(MikrotikStatusResponse {
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
        })),
        Err(e) => {
            tracing::warn!("MikroTik test connection failed: {e}");
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

/// GET /api/v1/mikrotik/vlans
pub async fn vlans(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikVlanResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("vlans") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let vlans = client.vlans().await.map_err(|e| {
        tracing::error!("MikroTik VLAN list error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikVlanResponse> = vlans
        .into_iter()
        .map(|vlan| MikrotikVlanResponse {
            id: vlan.id,
            vlan_id: vlan.vlan_id,
            name: vlan.name,
            interface: vlan.interface,
            mtu: vlan.mtu,
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("vlans".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/mikrotik/vlans
pub async fn create_vlan(
    State(state): State<AppState>,
    Json(body): Json<MikrotikVlanUpsertRequest>,
) -> Result<StatusCode, StatusCode> {
    validate_vlan_upsert(&body)?;

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = VlanWriteRequest {
        name: body.name.trim().to_string(),
        interface: body.interface.trim().to_string(),
        vlan_id: body.vlan_id.to_string(),
        mtu: body.mtu.map(|v| v.to_string()),
    };

    client.create_vlan(&req).await.map_err(|e| {
        tracing::error!("MikroTik VLAN create error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/v1/mikrotik/vlans/:id
pub async fn update_vlan(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikVlanUpsertRequest>,
) -> Result<StatusCode, StatusCode> {
    validate_vlan_upsert(&body)?;
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = VlanWriteRequest {
        name: body.name.trim().to_string(),
        interface: body.interface.trim().to_string(),
        vlan_id: body.vlan_id.to_string(),
        mtu: body.mtu.map(|v| v.to_string()),
    };

    client.update_vlan(id, &req).await.map_err(|e| {
        tracing::error!("MikroTik VLAN update error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/mikrotik/vlans/:id
pub async fn delete_vlan(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    client.delete_vlan(id).await.map_err(|e| {
        tracing::error!("MikroTik VLAN delete error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
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
    let addr_list = client.firewall_address_list().await.unwrap_or_default();

    let filter_rules: Vec<MikrotikFirewallRule> = filter
        .into_iter()
        .map(|f| MikrotikFirewallRule {
            id: f.id,
            chain: f.chain,
            action: f.action,
            protocol: f.protocol,
            src_address: f.src_address,
            dst_address: f.dst_address,
            src_port: f.src_port,
            dst_port: f.dst_port,
            in_interface: f.in_interface,
            out_interface: f.out_interface,
            comment: f.comment,
            disabled: is_true(&f.disabled),
            bytes: f.bytes,
            packets: f.packets,
        })
        .collect();

    let nat_rules: Vec<MikrotikNatRule> = nat
        .into_iter()
        .map(|n| MikrotikNatRule {
            id: n.id,
            chain: n.chain,
            action: n.action,
            protocol: n.protocol,
            src_address: n.src_address,
            dst_address: n.dst_address,
            dst_port: n.dst_port,
            to_addresses: n.to_addresses,
            to_ports: n.to_ports,
            in_interface: n.in_interface,
            out_interface: n.out_interface,
            comment: n.comment,
            disabled: is_true(&n.disabled),
        })
        .collect();

    let address_lists: Vec<MikrotikAddressListEntry> = addr_list
        .into_iter()
        .map(|a| MikrotikAddressListEntry {
            id: a.id,
            list: a.list,
            address: a.address,
            comment: a.comment,
            disabled: is_true(&a.disabled),
            dynamic: is_true(&a.dynamic),
        })
        .collect();

    let result = MikrotikFirewallResponse {
        filter_rules,
        nat_rules,
        address_lists,
    };

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("firewall".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/mikrotik/dns
pub async fn dns(State(state): State<AppState>) -> Result<Json<MikrotikDnsResponse>, StatusCode> {
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

// ── Firewall Filter CRUD ──────────────────────────────────

fn to_filter_write(body: &MikrotikFirewallFilterRequest) -> FirewallFilterWriteRequest {
    FirewallFilterWriteRequest {
        chain: body.chain.clone(),
        action: body.action.clone(),
        protocol: body.protocol.clone(),
        src_address: body.src_address.clone(),
        dst_address: body.dst_address.clone(),
        src_port: body.src_port.clone(),
        dst_port: body.dst_port.clone(),
        in_interface: body.in_interface.clone(),
        out_interface: body.out_interface.clone(),
        comment: body.comment.clone(),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
    }
}

/// POST /api/v1/mikrotik/firewall/filter
pub async fn create_firewall_filter(
    State(state): State<AppState>,
    Json(body): Json<MikrotikFirewallFilterRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = to_filter_write(&body);
    let desc = format!(
        "Create MikroTik filter rule: chain={} action={}",
        body.chain, body.action
    );
    let cmds = vec![format!("POST /ip/firewall/filter chain={}", body.chain)];

    match client.create_firewall_filter(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_filter_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_filter_create",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall filter create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// PATCH /api/v1/mikrotik/firewall/filter/:id
pub async fn update_firewall_filter(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikFirewallFilterRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = to_filter_write(&body);
    let desc = format!("Update MikroTik filter rule {id}");
    let cmds = vec![format!("PATCH /ip/firewall/filter/{id}")];

    match client.update_firewall_filter(id, &req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_filter_update", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_filter_update",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall filter update error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/firewall/filter/:id
pub async fn delete_firewall_filter(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik filter rule {id}");
    let cmds = vec![format!("DELETE /ip/firewall/filter/{id}")];

    match client.delete_firewall_filter(id).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_filter_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_filter_delete",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall filter delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/mikrotik/firewall/filter/:id/toggle
pub async fn toggle_firewall_filter(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikToggleRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let label = if body.disabled { "disable" } else { "enable" };
    let desc = format!("{label} MikroTik filter rule {id}");
    let cmds = vec![format!(
        "PATCH /ip/firewall/filter/{id} disabled={}",
        body.disabled
    )];

    match client.toggle_firewall_filter(id, body.disabled).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_filter_toggle", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_filter_toggle",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall filter toggle error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

// ── Firewall NAT CRUD ─────────────────────────────────────

fn to_nat_write(body: &MikrotikFirewallNatRequest) -> FirewallNatWriteRequest {
    FirewallNatWriteRequest {
        chain: body.chain.clone(),
        action: body.action.clone(),
        protocol: body.protocol.clone(),
        src_address: body.src_address.clone(),
        dst_address: body.dst_address.clone(),
        dst_port: body.dst_port.clone(),
        to_addresses: body.to_addresses.clone(),
        to_ports: body.to_ports.clone(),
        in_interface: body.in_interface.clone(),
        out_interface: body.out_interface.clone(),
        comment: body.comment.clone(),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
    }
}

/// POST /api/v1/mikrotik/firewall/nat
pub async fn create_firewall_nat(
    State(state): State<AppState>,
    Json(body): Json<MikrotikFirewallNatRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = to_nat_write(&body);
    let desc = format!(
        "Create MikroTik NAT rule: chain={} action={}",
        body.chain, body.action
    );
    let cmds = vec![format!("POST /ip/firewall/nat chain={}", body.chain)];

    match client.create_firewall_nat(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_nat_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_nat_create",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall NAT create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// PATCH /api/v1/mikrotik/firewall/nat/:id
pub async fn update_firewall_nat(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikFirewallNatRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = to_nat_write(&body);
    let desc = format!("Update MikroTik NAT rule {id}");
    let cmds = vec![format!("PATCH /ip/firewall/nat/{id}")];

    match client.update_firewall_nat(id, &req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_nat_update", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_nat_update",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall NAT update error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/firewall/nat/:id
pub async fn delete_firewall_nat(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik NAT rule {id}");
    let cmds = vec![format!("DELETE /ip/firewall/nat/{id}")];

    match client.delete_firewall_nat(id).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_nat_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_nat_delete",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall NAT delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/mikrotik/firewall/nat/:id/toggle
pub async fn toggle_firewall_nat(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikToggleRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let label = if body.disabled { "disable" } else { "enable" };
    let desc = format!("{label} MikroTik NAT rule {id}");
    let cmds = vec![format!(
        "PATCH /ip/firewall/nat/{id} disabled={}",
        body.disabled
    )];

    match client.toggle_firewall_nat(id, body.disabled).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_firewall_nat_toggle", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_nat_toggle",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik firewall NAT toggle error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

// ── Address List CRUD ─────────────────────────────────────

/// POST /api/v1/mikrotik/firewall/address-list
pub async fn create_address_list(
    State(state): State<AppState>,
    Json(body): Json<MikrotikAddressListRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = FirewallAddressListWriteRequest {
        list: body.list.clone(),
        address: body.address.clone(),
        comment: body.comment.clone(),
        disabled: None,
    };

    let desc = format!(
        "Add {} to MikroTik address list '{}'",
        body.address, body.list
    );
    let cmds = vec![format!(
        "POST /ip/firewall/address-list list={} address={}",
        body.list, body.address
    )];

    match client.create_firewall_address_list(&req).await {
        Ok(()) => {
            audit::log_success(
                &state.db,
                "mikrotik_firewall_address_list_create",
                &desc,
                &cmds,
            )
            .await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_address_list_create",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik address list create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/firewall/address-list/:id
pub async fn delete_address_list(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik address list entry {id}");
    let cmds = vec![format!("DELETE /ip/firewall/address-list/{id}")];

    match client.delete_firewall_address_list(id).await {
        Ok(()) => {
            audit::log_success(
                &state.db,
                "mikrotik_firewall_address_list_delete",
                &desc,
                &cmds,
            )
            .await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(
                &state.db,
                "mikrotik_firewall_address_list_delete",
                &desc,
                &cmds,
                &msg,
            )
            .await;
            tracing::error!("MikroTik address list delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/mikrotik/dhcp-static-mappings
pub async fn create_dhcp_static_mapping(
    State(state): State<AppState>,
    Json(body): Json<MikrotikCreateDhcpStaticRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = DhcpStaticLeaseWriteRequest {
        address: body.address.clone(),
        mac_address: body.mac_address.clone(),
        comment: body.comment.clone(),
    };

    let desc = format!(
        "Create MikroTik static DHCP mapping: {} -> {}",
        body.mac_address, body.address
    );
    let cmds = vec![format!(
        "POST /ip/dhcp-server/lease address={} mac-address={}",
        body.address, body.mac_address
    )];

    match client.create_dhcp_static_lease(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_dhcp_static_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_dhcp_static_create", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik DHCP static mapping create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/dhcp-leases/:id
pub async fn delete_dhcp_lease(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik DHCP lease {id}");
    let cmds = vec![format!("DELETE /ip/dhcp-server/lease/{id}")];

    match client.delete_dhcp_lease(id).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_dhcp_lease_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_dhcp_lease_delete", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik DHCP lease delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

// ── Advanced Routing: Response Types ──────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikRouteRuleResponse {
    pub id: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub routing_mark: Option<String>,
    pub action: Option<String>,
    pub table: Option<String>,
    pub interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikRouteRuleRequest {
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub routing_mark: Option<String>,
    pub action: String,
    pub table: Option<String>,
    pub interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikNetwatchResponse {
    pub id: Option<String>,
    pub host: String,
    pub check_type: Option<String>,
    pub interval: Option<String>,
    pub timeout: Option<String>,
    pub status: Option<String>,
    pub since: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikNetwatchRequest {
    pub host: String,
    pub check_type: Option<String>,
    pub interval: Option<String>,
    pub timeout: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikBgpConnectionResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub remote_address: Option<String>,
    pub remote_as: Option<String>,
    pub local_role: Option<String>,
    pub local_as: Option<String>,
    pub routing_table: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikOspfInstanceResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub router_id: Option<String>,
    pub version: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikOspfInterfaceResponse {
    pub id: Option<String>,
    pub interfaces: Option<String>,
    pub area: Option<String>,
    pub cost: Option<String>,
    pub priority: Option<String>,
    pub network_type: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikAdvancedRoutingResponse {
    pub route_rules: Vec<MikrotikRouteRuleResponse>,
    pub netwatch: Vec<MikrotikNetwatchResponse>,
    pub bgp_connections: Vec<MikrotikBgpConnectionResponse>,
    pub ospf_instances: Vec<MikrotikOspfInstanceResponse>,
    pub ospf_interfaces: Vec<MikrotikOspfInterfaceResponse>,
}

// ── Advanced Routing: Endpoints ───────────────────────────

/// GET /api/v1/mikrotik/routing/advanced
///
/// Returns all advanced routing data in a single call: route rules (PBR),
/// Netwatch (gateway monitoring), BGP connections, OSPF instances & interfaces.
pub async fn routing_advanced(
    State(state): State<AppState>,
) -> Result<Json<MikrotikAdvancedRoutingResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("routing-advanced") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let route_rules = client.route_rules().await.unwrap_or_default();
    let netwatch = client.netwatch().await.unwrap_or_default();
    // BGP/OSPF may not be available on all routers — gracefully default to empty
    let bgp = client.bgp_connections().await.unwrap_or_default();
    let ospf_inst = client.ospf_instances().await.unwrap_or_default();
    let ospf_iface = client.ospf_interface_templates().await.unwrap_or_default();

    let resp = MikrotikAdvancedRoutingResponse {
        route_rules: route_rules
            .into_iter()
            .map(|r| MikrotikRouteRuleResponse {
                id: r.id,
                src_address: r.src_address,
                dst_address: r.dst_address,
                routing_mark: r.routing_mark,
                action: r.action,
                table: r.table,
                interface: r.interface,
                comment: r.comment,
                disabled: is_true(&r.disabled),
            })
            .collect(),
        netwatch: netwatch
            .into_iter()
            .map(|n| MikrotikNetwatchResponse {
                id: n.id,
                host: n.host.unwrap_or_default(),
                check_type: n.check_type,
                interval: n.interval,
                timeout: n.timeout,
                status: n.status,
                since: n.since,
                comment: n.comment,
                disabled: is_true(&n.disabled),
            })
            .collect(),
        bgp_connections: bgp
            .into_iter()
            .map(|b| MikrotikBgpConnectionResponse {
                id: b.id,
                name: b.name,
                remote_address: b.remote_address,
                remote_as: b.remote_as,
                local_role: b.local_role,
                local_as: b.local_as,
                routing_table: b.routing_table,
                disabled: is_true(&b.disabled),
                comment: b.comment,
            })
            .collect(),
        ospf_instances: ospf_inst
            .into_iter()
            .map(|o| MikrotikOspfInstanceResponse {
                id: o.id,
                name: o.name,
                router_id: o.router_id,
                version: o.version,
                disabled: is_true(&o.disabled),
                comment: o.comment,
            })
            .collect(),
        ospf_interfaces: ospf_iface
            .into_iter()
            .map(|o| MikrotikOspfInterfaceResponse {
                id: o.id,
                interfaces: o.interfaces,
                area: o.area,
                cost: o.cost,
                priority: o.priority,
                network_type: o.network_type,
                disabled: is_true(&o.disabled),
                comment: o.comment,
            })
            .collect(),
    };

    if let Ok(val) = serde_json::to_value(&resp) {
        state.mikrotik_cache.set("routing-advanced".into(), val);
    }
    Ok(Json(resp))
}

/// POST /api/v1/mikrotik/routing/rules
pub async fn create_route_rule(
    State(state): State<AppState>,
    Json(body): Json<MikrotikRouteRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = RouteRuleWriteRequest {
        src_address: body.src_address.clone(),
        dst_address: body.dst_address.clone(),
        routing_mark: body.routing_mark.clone(),
        action: body.action.clone(),
        table: body.table.clone(),
        interface: body.interface.clone(),
        comment: body.comment.clone(),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    let desc = format!(
        "Create MikroTik route rule: action={} src={} dst={}",
        body.action,
        body.src_address.as_deref().unwrap_or("any"),
        body.dst_address.as_deref().unwrap_or("any"),
    );
    let cmds = vec![format!("POST /ip/route/rule action={}", body.action)];

    match client.create_route_rule(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_route_rule_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_route_rule_create", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik route rule create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/routing/rules/:id
pub async fn delete_route_rule(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik route rule {id}");
    let cmds = vec![format!("DELETE /ip/route/rule/{id}")];

    match client.delete_route_rule(id).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_route_rule_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_route_rule_delete", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik route rule delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/mikrotik/routing/netwatch
pub async fn create_netwatch(
    State(state): State<AppState>,
    Json(body): Json<MikrotikNetwatchRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = NetwatchWriteRequest {
        host: body.host.clone(),
        check_type: body.check_type.clone(),
        interval: body.interval.clone(),
        timeout: body.timeout.clone(),
        comment: body.comment.clone(),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    let desc = format!("Create MikroTik netwatch: host={}", body.host);
    let cmds = vec![format!("POST /tool/netwatch host={}", body.host)];

    match client.create_netwatch(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_netwatch_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_netwatch_create", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik netwatch create error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/mikrotik/routing/netwatch/:id
pub async fn delete_netwatch(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete MikroTik netwatch {id}");
    let cmds = vec![format!("DELETE /tool/netwatch/{id}")];

    match client.delete_netwatch(id).await {
        Ok(()) => {
            audit::log_success(&state.db, "mikrotik_netwatch_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            let msg = e.to_string();
            audit::log_failure(&state.db, "mikrotik_netwatch_delete", &desc, &cmds, &msg).await;
            tracing::error!("MikroTik netwatch delete error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}
