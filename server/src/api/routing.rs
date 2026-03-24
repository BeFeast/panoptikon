//! Advanced routing API endpoints.
//!
//! Provides policy-based routing (PBR), multi-WAN, gateway monitoring,
//! and BGP/OSPF management via MikroTik RouterOS REST API.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::{audit, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::{
    FirewallMangleWriteRequest, IpRouteWriteRequest, RoutingRuleWriteRequest,
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

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

// ── Response types ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingRuleResponse {
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

#[derive(Debug, Serialize, Deserialize)]
pub struct RoutingTableResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub fib: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MangleRuleResponse {
    pub id: Option<String>,
    pub chain: Option<String>,
    pub action: Option<String>,
    pub new_routing_mark: Option<String>,
    pub passthrough: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub protocol: Option<String>,
    pub dst_port: Option<String>,
    pub src_port: Option<String>,
    pub in_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub bytes: Option<String>,
    pub packets: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouteResponse {
    pub id: Option<String>,
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
pub struct OspfInstanceResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub router_id: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OspfAreaResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub area_id: Option<String>,
    pub instance: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OspfInterfaceTemplateResponse {
    pub id: Option<String>,
    pub interfaces: Option<String>,
    pub area: Option<String>,
    pub cost: Option<String>,
    pub priority: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
    pub network_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OspfNeighborResponse {
    pub id: Option<String>,
    pub instance: Option<String>,
    pub address: Option<String>,
    pub router_id: Option<String>,
    pub state: Option<String>,
    pub state_changes: Option<String>,
    pub priority: Option<String>,
    pub adjacency: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BgpConnectionResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub remote_address: Option<String>,
    pub remote_as: Option<String>,
    pub local_role: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BgpSessionResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub remote_address: Option<String>,
    pub remote_as: Option<String>,
    pub established: bool,
    pub uptime: Option<String>,
    pub prefix_count: Option<String>,
}

/// Combined advanced routing overview.
#[derive(Debug, Serialize, Deserialize)]
pub struct AdvancedRoutingResponse {
    pub routing_rules: Vec<RoutingRuleResponse>,
    pub routing_tables: Vec<RoutingTableResponse>,
    pub mangle_rules: Vec<MangleRuleResponse>,
    pub routes: Vec<RouteResponse>,
    pub ospf_instances: Vec<OspfInstanceResponse>,
    pub ospf_areas: Vec<OspfAreaResponse>,
    pub ospf_interface_templates: Vec<OspfInterfaceTemplateResponse>,
    pub ospf_neighbors: Vec<OspfNeighborResponse>,
    pub bgp_connections: Vec<BgpConnectionResponse>,
    pub bgp_sessions: Vec<BgpSessionResponse>,
}

// ── Request types ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateRoutingRuleRequest {
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub routing_mark: Option<String>,
    pub action: Option<String>,
    pub table: Option<String>,
    pub interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateMangleRuleRequest {
    pub chain: String,
    pub action: String,
    pub new_routing_mark: Option<String>,
    pub passthrough: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub protocol: Option<String>,
    pub dst_port: Option<String>,
    pub src_port: Option<String>,
    pub in_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRouteRequest {
    pub dst_address: String,
    pub gateway: String,
    pub distance: Option<String>,
    pub routing_table: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

// ── Endpoints ──────────────────────────────────────────────

/// GET /api/v1/routing/advanced
///
/// Fetches a combined view of all advanced routing data from MikroTik.
pub async fn advanced_routing(
    State(state): State<AppState>,
) -> Result<Json<AdvancedRoutingResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("advanced_routing") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    // Fetch all routing data concurrently
    let (
        rules,
        tables,
        mangles,
        routes,
        ospf_inst,
        ospf_areas,
        ospf_iface,
        ospf_neighbors,
        bgp_conn,
        bgp_sess,
    ) = tokio::join!(
        client.routing_rules(),
        client.routing_tables(),
        client.firewall_mangle(),
        client.ip_routes(),
        client.ospf_instances(),
        client.ospf_areas(),
        client.ospf_interface_templates(),
        client.ospf_neighbors(),
        client.bgp_connections(),
        client.bgp_sessions(),
    );

    let result = AdvancedRoutingResponse {
        routing_rules: rules
            .unwrap_or_default()
            .into_iter()
            .map(|r| RoutingRuleResponse {
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
        routing_tables: tables
            .unwrap_or_default()
            .into_iter()
            .map(|t| RoutingTableResponse {
                id: t.id,
                name: t.name,
                fib: t.fib,
                comment: t.comment,
            })
            .collect(),
        mangle_rules: mangles
            .unwrap_or_default()
            .into_iter()
            .map(|m| MangleRuleResponse {
                id: m.id,
                chain: m.chain,
                action: m.action,
                new_routing_mark: m.new_routing_mark,
                passthrough: m.passthrough,
                src_address: m.src_address,
                dst_address: m.dst_address,
                protocol: m.protocol,
                dst_port: m.dst_port,
                src_port: m.src_port,
                in_interface: m.in_interface,
                comment: m.comment,
                disabled: is_true(&m.disabled),
                bytes: m.bytes,
                packets: m.packets,
            })
            .collect(),
        routes: routes
            .unwrap_or_default()
            .into_iter()
            .map(|r| RouteResponse {
                id: r.id,
                dst_address: r.dst_address.unwrap_or_default(),
                gateway: r.gateway,
                distance: r.distance,
                routing_table: r.routing_table,
                active: is_true(&r.active),
                dynamic: is_true(&r.dynamic),
                disabled: is_true(&r.disabled),
                comment: r.comment,
            })
            .collect(),
        ospf_instances: ospf_inst
            .unwrap_or_default()
            .into_iter()
            .map(|o| OspfInstanceResponse {
                id: o.id,
                name: o.name,
                router_id: o.router_id,
                disabled: is_true(&o.disabled),
                comment: o.comment,
                version: o.version,
            })
            .collect(),
        ospf_areas: ospf_areas
            .unwrap_or_default()
            .into_iter()
            .map(|a| OspfAreaResponse {
                id: a.id,
                name: a.name,
                area_id: a.area_id,
                instance: a.instance,
                disabled: is_true(&a.disabled),
                comment: a.comment,
            })
            .collect(),
        ospf_interface_templates: ospf_iface
            .unwrap_or_default()
            .into_iter()
            .map(|i| OspfInterfaceTemplateResponse {
                id: i.id,
                interfaces: i.interfaces,
                area: i.area,
                cost: i.cost,
                priority: i.priority,
                disabled: is_true(&i.disabled),
                comment: i.comment,
                network_type: i.network_type,
            })
            .collect(),
        ospf_neighbors: ospf_neighbors
            .unwrap_or_default()
            .into_iter()
            .map(|n| OspfNeighborResponse {
                id: n.id,
                instance: n.instance,
                address: n.address,
                router_id: n.router_id,
                state: n.state,
                state_changes: n.state_changes,
                priority: n.priority,
                adjacency: n.adjacency,
            })
            .collect(),
        bgp_connections: bgp_conn
            .unwrap_or_default()
            .into_iter()
            .map(|c| BgpConnectionResponse {
                id: c.id,
                name: c.name,
                remote_address: c.remote_address,
                remote_as: c.remote_as,
                local_role: c.local_role,
                disabled: is_true(&c.disabled),
                comment: c.comment,
            })
            .collect(),
        bgp_sessions: bgp_sess
            .unwrap_or_default()
            .into_iter()
            .map(|s| BgpSessionResponse {
                id: s.id,
                name: s.name,
                remote_address: s.remote_address,
                remote_as: s.remote_as,
                established: is_true(&s.established),
                uptime: s.uptime,
                prefix_count: s.prefix_count,
            })
            .collect(),
    };

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("advanced_routing".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/routing/rules
pub async fn create_routing_rule(
    State(state): State<AppState>,
    Json(body): Json<CreateRoutingRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = RoutingRuleWriteRequest {
        src_address: body.src_address,
        dst_address: body.dst_address,
        routing_mark: body.routing_mark,
        action: body.action,
        table: body.table,
        interface: body.interface,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
    };

    match client.create_routing_rule(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "create_routing_rule", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to create routing rule: {e}");
            audit::log_failure(
                &state.db,
                "routing",
                "create_routing_rule",
                &[],
                &e.to_string(),
            )
            .await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/routing/rules/:id
pub async fn delete_routing_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    match client.delete_routing_rule(&id).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "delete_routing_rule", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to delete routing rule: {e}");
            audit::log_failure(
                &state.db,
                "routing",
                "delete_routing_rule",
                &[],
                &e.to_string(),
            )
            .await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/routing/mangle
pub async fn create_mangle_rule(
    State(state): State<AppState>,
    Json(body): Json<CreateMangleRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = FirewallMangleWriteRequest {
        chain: body.chain,
        action: body.action,
        new_routing_mark: body.new_routing_mark,
        passthrough: body.passthrough,
        src_address: body.src_address,
        dst_address: body.dst_address,
        protocol: body.protocol,
        dst_port: body.dst_port,
        src_port: body.src_port,
        in_interface: body.in_interface,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
    };

    match client.create_firewall_mangle(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "create_mangle_rule", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to create mangle rule: {e}");
            audit::log_failure(
                &state.db,
                "routing",
                "create_mangle_rule",
                &[],
                &e.to_string(),
            )
            .await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/routing/mangle/:id
pub async fn delete_mangle_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    match client.delete_firewall_mangle(&id).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "delete_mangle_rule", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to delete mangle rule: {e}");
            audit::log_failure(
                &state.db,
                "routing",
                "delete_mangle_rule",
                &[],
                &e.to_string(),
            )
            .await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/routing/routes
pub async fn create_route(
    State(state): State<AppState>,
    Json(body): Json<CreateRouteRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = IpRouteWriteRequest {
        dst_address: body.dst_address,
        gateway: body.gateway,
        distance: body.distance,
        routing_table: body.routing_table,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
    };

    match client.create_ip_route(&req).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "create_route", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to create IP route: {e}");
            audit::log_failure(&state.db, "routing", "create_route", &[], &e.to_string()).await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/routing/routes/:id
pub async fn delete_route(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    match client.delete_ip_route(&id).await {
        Ok(()) => {
            audit::log_success(&state.db, "routing", "delete_route", &[]).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            tracing::error!("Failed to delete IP route: {e}");
            audit::log_failure(&state.db, "routing", "delete_route", &[], &e.to_string()).await;
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}
