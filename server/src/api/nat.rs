//! NAT (port forwarding) management endpoints.
//!
//! Provides CRUD operations for VyOS destination NAT rules and MikroTik
//! firewall NAT rules, allowing users to manage port forwarding without
//! going through the unified services wizard.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::FirewallNatWriteRequest;

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

// ── Response / Request types ────────────────────────────────

/// Unified NAT rule response (covers both VyOS and MikroTik).
#[derive(Debug, Serialize)]
pub struct NatRuleResponse {
    pub success: bool,
    pub message: String,
}

// ── VyOS NAT Destination (DNAT) ─────────────────────────────

#[derive(Debug, Serialize)]
pub struct VyosNatRule {
    pub rule: u32,
    pub description: Option<String>,
    pub protocol: Option<String>,
    pub inbound_interface: Option<String>,
    pub external_port: Option<String>,
    pub internal_ip: Option<String>,
    pub internal_port: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVyosNatRuleRequest {
    pub rule: u32,
    pub description: Option<String>,
    pub protocol: Option<String>,
    pub inbound_interface: Option<String>,
    pub external_port: String,
    pub internal_ip: String,
    pub internal_port: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateVyosNatRuleRequest {
    pub description: Option<String>,
    pub protocol: Option<String>,
    pub inbound_interface: Option<String>,
    pub external_port: Option<String>,
    pub internal_ip: Option<String>,
    pub internal_port: Option<String>,
}

/// GET /api/v1/nat/vyos/rules — list all VyOS destination NAT rules.
pub async fn vyos_list(
    State(state): State<AppState>,
) -> Result<Json<Vec<VyosNatRule>>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let raw = client
        .retrieve(&["nat", "destination", "rule"])
        .await
        .map_err(|e| {
            // If path doesn't exist, it means no NAT rules — return empty list.
            tracing::debug!("VyOS NAT retrieve error (likely empty): {e}");
            StatusCode::OK
        });

    let value = match raw {
        Ok(v) => v,
        Err(_) => return Ok(Json(vec![])),
    };

    // VyOS returns an object keyed by rule number.
    let rules_map = match value.as_object() {
        Some(m) => m,
        None => return Ok(Json(vec![])),
    };

    let mut rules: Vec<VyosNatRule> = Vec::new();

    for (rule_num_str, rule_val) in rules_map {
        let rule_num: u32 = match rule_num_str.parse() {
            Ok(n) => n,
            Err(_) => continue,
        };

        let description = rule_val
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from);

        let protocol = rule_val
            .get("protocol")
            .and_then(|v| v.as_str())
            .map(String::from);

        let inbound_interface = rule_val
            .get("inbound-interface")
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let external_port = rule_val
            .get("destination")
            .and_then(|v| v.get("port"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let internal_ip = rule_val
            .get("translation")
            .and_then(|v| v.get("address"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let internal_port = rule_val
            .get("translation")
            .and_then(|v| v.get("port"))
            .and_then(|v| v.as_str())
            .map(String::from);

        rules.push(VyosNatRule {
            rule: rule_num,
            description,
            protocol,
            inbound_interface,
            external_port,
            internal_ip,
            internal_port,
        });
    }

    rules.sort_by_key(|r| r.rule);
    Ok(Json(rules))
}

/// POST /api/v1/nat/vyos/rules — create a VyOS destination NAT rule.
pub async fn vyos_create(
    State(state): State<AppState>,
    Json(body): Json<CreateVyosNatRuleRequest>,
) -> Result<(StatusCode, Json<NatRuleResponse>), StatusCode> {
    if body.rule == 0 || body.rule > 99999 {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(NatRuleResponse {
                success: false,
                message: "Rule number must be between 1 and 99999".into(),
            }),
        ));
    }

    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let rule_str = body.rule.to_string();
    let protocol = body.protocol.as_deref().unwrap_or("tcp");
    let description = body.description.as_deref().unwrap_or("");

    let base_path = ["nat", "destination", "rule", &rule_str];

    // Set description
    if !description.is_empty() {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("description");
        path.push(description);
        if let Err(e) = client.configure_set(&path).await {
            error!("Failed to set NAT rule description: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set protocol
    {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("protocol");
        path.push(protocol);
        if let Err(e) = client.configure_set(&path).await {
            let _ = client.configure_delete(&base_path).await;
            error!("Failed to set NAT rule protocol: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set inbound interface (optional)
    if let Some(ref iface) = body.inbound_interface {
        if !iface.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("inbound-interface");
            path.push("name");
            path.push(iface);
            if let Err(e) = client.configure_set(&path).await {
                let _ = client.configure_delete(&base_path).await;
                error!("Failed to set NAT rule inbound interface: {e}");
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Set destination port (external port)
    {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("destination");
        path.push("port");
        path.push(&body.external_port);
        if let Err(e) = client.configure_set(&path).await {
            let _ = client.configure_delete(&base_path).await;
            error!("Failed to set NAT rule destination port: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set translation address (internal IP)
    {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("translation");
        path.push("address");
        path.push(&body.internal_ip);
        if let Err(e) = client.configure_set(&path).await {
            let _ = client.configure_delete(&base_path).await;
            error!("Failed to set NAT rule translation address: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set translation port (internal port)
    {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("translation");
        path.push("port");
        path.push(&body.internal_port);
        if let Err(e) = client.configure_set(&path).await {
            let _ = client.configure_delete(&base_path).await;
            error!("Failed to set NAT rule translation port: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after NAT rule create: {e}");
    }

    info!("VyOS DNAT rule {} created", body.rule);

    Ok((
        StatusCode::CREATED,
        Json(NatRuleResponse {
            success: true,
            message: format!(
                "DNAT rule {} created — port {} → {}:{}",
                body.rule, body.external_port, body.internal_ip, body.internal_port
            ),
        }),
    ))
}

/// PUT /api/v1/nat/vyos/rules/:rule_number — update an existing VyOS DNAT rule.
pub async fn vyos_update(
    State(state): State<AppState>,
    Path(rule_number): Path<u32>,
    Json(body): Json<UpdateVyosNatRuleRequest>,
) -> Result<Json<NatRuleResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let rule_str = rule_number.to_string();
    let base_path = ["nat", "destination", "rule", &rule_str];

    // Verify rule exists
    if client.retrieve(&base_path).await.is_err() {
        return Ok(Json(NatRuleResponse {
            success: false,
            message: format!("Rule {} not found", rule_number),
        }));
    }

    // Delete the old rule and recreate with new values
    // (VyOS doesn't support partial updates well for nested NAT paths)
    if let Err(e) = client.configure_delete(&base_path).await {
        error!("Failed to delete old NAT rule {rule_number} for update: {e}");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Set description
    if let Some(ref desc) = body.description {
        if !desc.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("description");
            path.push(desc);
            if let Err(e) = client.configure_set(&path).await {
                error!("Failed to set NAT rule description on update: {e}");
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Set protocol
    if let Some(ref proto) = body.protocol {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("protocol");
        path.push(proto);
        if let Err(e) = client.configure_set(&path).await {
            error!("Failed to set NAT rule protocol on update: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set inbound interface
    if let Some(ref iface) = body.inbound_interface {
        if !iface.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("inbound-interface");
            path.push("name");
            path.push(iface);
            if let Err(e) = client.configure_set(&path).await {
                error!("Failed to set NAT rule inbound interface on update: {e}");
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
        }
    }

    // Set destination port
    if let Some(ref ext_port) = body.external_port {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("destination");
        path.push("port");
        path.push(ext_port);
        if let Err(e) = client.configure_set(&path).await {
            error!("Failed to set NAT rule destination port on update: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set translation address
    if let Some(ref ip) = body.internal_ip {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("translation");
        path.push("address");
        path.push(ip);
        if let Err(e) = client.configure_set(&path).await {
            error!("Failed to set NAT rule translation address on update: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // Set translation port
    if let Some(ref int_port) = body.internal_port {
        let mut path: Vec<&str> = base_path.to_vec();
        path.push("translation");
        path.push("port");
        path.push(int_port);
        if let Err(e) = client.configure_set(&path).await {
            error!("Failed to set NAT rule translation port on update: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after NAT rule update: {e}");
    }

    info!("VyOS DNAT rule {} updated", rule_number);

    Ok(Json(NatRuleResponse {
        success: true,
        message: format!("DNAT rule {} updated", rule_number),
    }))
}

/// DELETE /api/v1/nat/vyos/rules/:rule_number — delete a VyOS DNAT rule.
pub async fn vyos_delete(
    State(state): State<AppState>,
    Path(rule_number): Path<u32>,
) -> Result<Json<NatRuleResponse>, StatusCode> {
    let client = super::vyos::get_vyos_client_or_503(&state).await?;

    let rule_str = rule_number.to_string();
    let base_path = ["nat", "destination", "rule", &rule_str];

    if let Err(e) = client.configure_delete(&base_path).await {
        error!("Failed to delete VyOS DNAT rule {rule_number}: {e}");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after NAT rule delete: {e}");
    }

    info!("VyOS DNAT rule {} deleted", rule_number);

    Ok(Json(NatRuleResponse {
        success: true,
        message: format!("DNAT rule {} deleted", rule_number),
    }))
}

// ── MikroTik NAT ────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct MikrotikNatRuleResponse {
    pub id: Option<String>,
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

#[derive(Debug, Deserialize)]
pub struct CreateMikrotikNatRuleRequest {
    pub chain: String,
    pub action: String,
    pub protocol: Option<String>,
    pub dst_port: Option<String>,
    pub to_addresses: Option<String>,
    pub to_ports: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

/// GET /api/v1/nat/mikrotik/rules — list all MikroTik NAT rules.
pub async fn mikrotik_list(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikNatRuleResponse>>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let nat_rules = client.firewall_nat().await.map_err(|e| {
        error!("Failed to fetch MikroTik NAT rules: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let rules: Vec<MikrotikNatRuleResponse> = nat_rules
        .into_iter()
        .map(|r| MikrotikNatRuleResponse {
            id: r.id,
            chain: r.chain,
            action: r.action,
            protocol: r.protocol,
            src_address: r.src_address,
            dst_address: r.dst_address,
            dst_port: r.dst_port,
            to_addresses: r.to_addresses,
            to_ports: r.to_ports,
            out_interface: r.out_interface,
            comment: r.comment,
            disabled: r.disabled.as_deref() == Some("true"),
        })
        .collect();

    Ok(Json(rules))
}

/// POST /api/v1/nat/mikrotik/rules — create a MikroTik NAT rule.
pub async fn mikrotik_create(
    State(state): State<AppState>,
    Json(body): Json<CreateMikrotikNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let req = FirewallNatWriteRequest {
        chain: body.chain,
        action: body.action,
        protocol: body.protocol,
        src_address: None,
        dst_address: None,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        in_interface: None,
        out_interface: None,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    client.create_firewall_nat(&req).await.map_err(|e| {
        error!("Failed to create MikroTik NAT rule: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!("MikroTik NAT rule created");
    Ok(StatusCode::CREATED)
}

/// PUT /api/v1/nat/mikrotik/rules/:id — update a MikroTik NAT rule.
pub async fn mikrotik_update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateMikrotikNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let req = FirewallNatWriteRequest {
        chain: body.chain,
        action: body.action,
        protocol: body.protocol,
        src_address: None,
        dst_address: None,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        in_interface: None,
        out_interface: None,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    client.update_firewall_nat(&id, &req).await.map_err(|e| {
        error!("Failed to update MikroTik NAT rule {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!("MikroTik NAT rule {id} updated");
    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/nat/mikrotik/rules/:id — delete a MikroTik NAT rule.
pub async fn mikrotik_delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    client.delete_firewall_nat(&id).await.map_err(|e| {
        error!("Failed to delete MikroTik NAT rule {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!("MikroTik NAT rule {id} deleted");
    Ok(StatusCode::NO_CONTENT)
}

// ── NAT Summary ─────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NatSummary {
    pub vyos_available: bool,
    pub mikrotik_available: bool,
    pub vyos_rule_count: usize,
    pub mikrotik_rule_count: usize,
}

/// GET /api/v1/nat/summary — overview of NAT rule counts.
pub async fn summary(State(state): State<AppState>) -> Json<NatSummary> {
    let vyos_client = super::vyos::get_vyos_client_or_503(&state).await.ok();
    let mt_client = mikrotik_client(&state).await;

    let vyos_count = if let Some(ref client) = vyos_client {
        client
            .retrieve(&["nat", "destination", "rule"])
            .await
            .ok()
            .and_then(|v| v.as_object().map(|m| m.len()))
            .unwrap_or(0)
    } else {
        0
    };

    let mt_count = if let Some(ref client) = mt_client {
        client.firewall_nat().await.map(|v| v.len()).unwrap_or(0)
    } else {
        0
    };

    Json(NatSummary {
        vyos_available: vyos_client.is_some(),
        mikrotik_available: mt_client.is_some(),
        vyos_rule_count: vyos_count,
        mikrotik_rule_count: mt_count,
    })
}
