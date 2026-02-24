//! Standalone NAT / port forwarding management API.
//!
//! Provides dedicated CRUD endpoints for VyOS destination NAT (DNAT) rules
//! and MikroTik firewall NAT rules, independent of the unified services wizard.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{error, info};

use super::audit;
use super::vyos::{get_vyos_client_or_503, VyosWriteResponse};
use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::FirewallNatWriteRequest;

// ── VyOS NAT Types ──────────────────────────────────────────────

/// A parsed VyOS destination NAT (port forwarding) rule.
#[derive(Debug, Serialize)]
pub struct VyosDnatRule {
    pub rule: u32,
    pub description: Option<String>,
    pub protocol: Option<String>,
    pub inbound_interface: Option<String>,
    pub external_port: Option<String>,
    pub internal_ip: Option<String>,
    pub internal_port: Option<String>,
}

/// Request body for creating/updating a VyOS DNAT rule.
#[derive(Debug, Deserialize)]
pub struct VyosDnatRequest {
    pub rule_number: u32,
    pub external_port: u16,
    pub internal_ip: String,
    pub internal_port: u16,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    pub inbound_interface: Option<String>,
    pub description: Option<String>,
}

fn default_protocol() -> String {
    "tcp".to_string()
}

/// Response listing VyOS DNAT rules.
#[derive(Debug, Serialize)]
pub struct VyosDnatListResponse {
    pub rules: Vec<VyosDnatRule>,
}

// ── MikroTik NAT Types ─────────────────────────────────────────

/// Response type for MikroTik NAT rules (mirrors the existing MikrotikNatRule
/// from mikrotik.rs, but with `.id` exposed for CRUD operations).
#[derive(Debug, Serialize, Deserialize)]
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

/// Request body for creating/updating a MikroTik NAT rule.
#[derive(Debug, Deserialize)]
pub struct MikrotikNatRuleRequest {
    pub chain: String,
    pub action: String,
    pub protocol: Option<String>,
    pub dst_port: Option<String>,
    pub to_addresses: Option<String>,
    pub to_ports: Option<String>,
    pub src_address: Option<String>,
    pub dst_address: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

// ── Helper ──────────────────────────────────────────────────────

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

/// Try to construct a MikroTik client from saved settings.
async fn mikrotik_client(state: &AppState) -> Option<MikrotikClient> {
    let get_setting = |key: &'static str| {
        let db = state.db.clone();
        async move {
            sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
                .bind(key)
                .fetch_optional(&db)
                .await
                .ok()
                .flatten()
                .filter(|v| !v.is_empty())
        }
    };

    let enabled = get_setting("mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting("mikrotik_url").await?;
    let user = get_setting("mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting("mikrotik_password").await.unwrap_or_default();

    Some(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        state.mikrotik_http.clone(),
    ))
}

// ── VyOS DNAT Endpoints ─────────────────────────────────────────

/// GET /api/v1/nat/vyos/rules — list all VyOS destination NAT rules.
pub async fn vyos_list_dnat(
    State(state): State<AppState>,
) -> Result<Json<VyosDnatListResponse>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;

    let config = client
        .retrieve(&["nat", "destination"])
        .await
        .map_err(|e| {
            error!("VyOS NAT config retrieval failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    let rules = parse_vyos_dnat_config(&config);

    Ok(Json(VyosDnatListResponse { rules }))
}

/// POST /api/v1/nat/vyos/rules — create a VyOS DNAT rule.
pub async fn vyos_create_dnat(
    State(state): State<AppState>,
    Json(body): Json<VyosDnatRequest>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    if body.rule_number == 0 || body.rule_number > 99999 {
        return Err(write_err(
            StatusCode::BAD_REQUEST,
            "Rule number must be between 1 and 99999",
        ));
    }
    if body.external_port == 0 {
        return Err(write_err(
            StatusCode::BAD_REQUEST,
            "External port must be > 0",
        ));
    }
    if body.internal_ip.trim().is_empty() {
        return Err(write_err(
            StatusCode::BAD_REQUEST,
            "Internal IP is required",
        ));
    }
    if body.internal_port == 0 {
        return Err(write_err(
            StatusCode::BAD_REQUEST,
            "Internal port must be > 0",
        ));
    }

    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        write_err(
            StatusCode::SERVICE_UNAVAILABLE,
            "VyOS router not configured",
        )
    })?;

    let rule_str = body.rule_number.to_string();
    let ext_port_str = body.external_port.to_string();
    let int_port_str = body.internal_port.to_string();
    let description = body.description.clone().unwrap_or_else(|| {
        format!(
            "DNAT port {} → {}:{}",
            body.external_port, body.internal_ip, body.internal_port
        )
    });

    let base_path = ["nat", "destination", "rule", &rule_str];

    // Set description
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("description");
    path.push(&description);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set description: {e}"),
        ));
    }

    // Set protocol
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("protocol");
    path.push(&body.protocol);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set protocol: {e}"),
        ));
    }

    // Set inbound-interface (optional)
    if let Some(ref iface) = body.inbound_interface {
        if !iface.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("inbound-interface");
            path.push("name");
            path.push(iface);
            if let Err(e) = client.configure_set(&path).await {
                let _ = client.configure_delete(&base_path).await;
                return Err(write_err(
                    StatusCode::BAD_GATEWAY,
                    &format!("Failed to set inbound interface: {e}"),
                ));
            }
        }
    }

    // Set destination port (external port)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("destination");
    path.push("port");
    path.push(&ext_port_str);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set destination port: {e}"),
        ));
    }

    // Set translation address (internal IP)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("address");
    path.push(&body.internal_ip);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set translation address: {e}"),
        ));
    }

    // Set translation port (internal port)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("port");
    path.push(&int_port_str);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set translation port: {e}"),
        ));
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after DNAT rule create: {e}");
    }

    let msg = format!(
        "DNAT rule {} created — port {} → {}:{}",
        body.rule_number, body.external_port, body.internal_ip, body.internal_port
    );
    info!("{}", msg);

    audit::log_success(
        &state.db,
        "nat_dnat_create",
        &msg,
        &[format!("nat destination rule {}", body.rule_number)],
    )
    .await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: msg,
    }))
}

/// PUT /api/v1/nat/vyos/rules/:number — update a VyOS DNAT rule.
pub async fn vyos_update_dnat(
    Path(number): Path<u32>,
    State(state): State<AppState>,
    Json(body): Json<VyosDnatRequest>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    // Delete the old rule and re-create with new values
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        write_err(
            StatusCode::SERVICE_UNAVAILABLE,
            "VyOS router not configured",
        )
    })?;

    let rule_str = number.to_string();
    let base_path = ["nat", "destination", "rule", &rule_str];

    // Delete the old rule first
    if let Err(e) = client.configure_delete(&base_path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to delete existing rule: {e}"),
        ));
    }

    // Re-create with the new body (use the path number, not body.rule_number)
    let ext_port_str = body.external_port.to_string();
    let int_port_str = body.internal_port.to_string();
    let description = body.description.clone().unwrap_or_else(|| {
        format!(
            "DNAT port {} → {}:{}",
            body.external_port, body.internal_ip, body.internal_port
        )
    });

    // Set description
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("description");
    path.push(&description);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set description: {e}"),
        ));
    }

    // Set protocol
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("protocol");
    path.push(&body.protocol);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set protocol: {e}"),
        ));
    }

    // Set inbound-interface (optional)
    if let Some(ref iface) = body.inbound_interface {
        if !iface.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("inbound-interface");
            path.push("name");
            path.push(iface);
            if let Err(e) = client.configure_set(&path).await {
                return Err(write_err(
                    StatusCode::BAD_GATEWAY,
                    &format!("Failed to set inbound interface: {e}"),
                ));
            }
        }
    }

    // Set destination port
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("destination");
    path.push("port");
    path.push(&ext_port_str);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set destination port: {e}"),
        ));
    }

    // Set translation address
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("address");
    path.push(&body.internal_ip);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set translation address: {e}"),
        ));
    }

    // Set translation port
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("port");
    path.push(&int_port_str);
    if let Err(e) = client.configure_set(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to set translation port: {e}"),
        ));
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after DNAT rule update: {e}");
    }

    let msg = format!(
        "DNAT rule {} updated — port {} → {}:{}",
        number, body.external_port, body.internal_ip, body.internal_port
    );
    info!("{}", msg);

    audit::log_success(
        &state.db,
        "nat_dnat_update",
        &msg,
        &[format!("nat destination rule {}", number)],
    )
    .await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: msg,
    }))
}

/// DELETE /api/v1/nat/vyos/rules/:number — delete a VyOS DNAT rule.
pub async fn vyos_delete_dnat(
    Path(number): Path<u32>,
    State(state): State<AppState>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        write_err(
            StatusCode::SERVICE_UNAVAILABLE,
            "VyOS router not configured",
        )
    })?;

    let rule_str = number.to_string();
    let path = ["nat", "destination", "rule", &rule_str];

    if let Err(e) = client.configure_delete(&path).await {
        return Err(write_err(
            StatusCode::BAD_GATEWAY,
            &format!("Failed to delete DNAT rule {number}: {e}"),
        ));
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after DNAT rule delete: {e}");
    }

    let msg = format!("DNAT rule {} deleted", number);
    info!("{}", msg);

    audit::log_success(
        &state.db,
        "nat_dnat_delete",
        &msg,
        &[format!("nat destination rule {}", number)],
    )
    .await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: msg,
    }))
}

// ── MikroTik NAT Endpoints ──────────────────────────────────────

/// GET /api/v1/nat/mikrotik/rules — list all MikroTik NAT rules.
pub async fn mikrotik_list_nat(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikNatRuleResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("nat-rules") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let rules = client.firewall_nat().await.map_err(|e| {
        error!("MikroTik NAT rules error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikNatRuleResponse> = rules
        .into_iter()
        .map(|n| MikrotikNatRuleResponse {
            id: n.id,
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

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("nat-rules".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/nat/mikrotik/rules — create a MikroTik NAT rule.
pub async fn mikrotik_create_nat(
    State(state): State<AppState>,
    Json(body): Json<MikrotikNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = FirewallNatWriteRequest {
        chain: body.chain,
        action: body.action,
        protocol: body.protocol,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        src_address: body.src_address,
        dst_address: body.dst_address,
        out_interface: body.out_interface,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    client.create_nat_rule(&req).await.map_err(|e| {
        error!("MikroTik NAT rule create error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/v1/nat/mikrotik/rules/:id — update a MikroTik NAT rule.
pub async fn mikrotik_update_nat(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = FirewallNatWriteRequest {
        chain: body.chain,
        action: body.action,
        protocol: body.protocol,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        src_address: body.src_address,
        dst_address: body.dst_address,
        out_interface: body.out_interface,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.into()),
    };

    client.update_nat_rule(id, &req).await.map_err(|e| {
        error!("MikroTik NAT rule update error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/nat/mikrotik/rules/:id — delete a MikroTik NAT rule.
pub async fn mikrotik_delete_nat(
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

    client.delete_nat_rule(id).await.map_err(|e| {
        error!("MikroTik NAT rule delete error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ─────────────────────────────────────────────────────

fn write_err(status: StatusCode, msg: &str) -> (StatusCode, Json<VyosWriteResponse>) {
    (
        status,
        Json(VyosWriteResponse {
            success: false,
            message: msg.to_string(),
        }),
    )
}

/// Parse VyOS `nat destination` config JSON into a list of DNAT rules.
fn parse_vyos_dnat_config(config: &Value) -> Vec<VyosDnatRule> {
    let rules_obj = config
        .get("rule")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut rules: Vec<VyosDnatRule> = rules_obj
        .iter()
        .filter_map(|(num_str, rule_val)| {
            let rule_num: u32 = num_str.parse().ok()?;

            let description = rule_val
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let protocol = rule_val
                .get("protocol")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let inbound_interface = rule_val
                .get("inbound-interface")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let external_port = rule_val
                .get("destination")
                .and_then(|v| v.get("port"))
                .and_then(|v| v.as_str().or_else(|| v.as_u64().map(|_| "")))
                .map(|s| s.to_string())
                .or_else(|| {
                    rule_val
                        .get("destination")
                        .and_then(|v| v.get("port"))
                        .and_then(|v| v.as_u64())
                        .map(|n| n.to_string())
                });

            let internal_ip = rule_val
                .get("translation")
                .and_then(|v| v.get("address"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let internal_port = rule_val
                .get("translation")
                .and_then(|v| v.get("port"))
                .and_then(|v| v.as_str().or_else(|| v.as_u64().map(|_| "")))
                .map(|s| s.to_string())
                .or_else(|| {
                    rule_val
                        .get("translation")
                        .and_then(|v| v.get("port"))
                        .and_then(|v| v.as_u64())
                        .map(|n| n.to_string())
                });

            Some(VyosDnatRule {
                rule: rule_num,
                description,
                protocol,
                inbound_interface,
                external_port,
                internal_ip,
                internal_port,
            })
        })
        .collect();

    rules.sort_by_key(|r| r.rule);
    rules
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_config() {
        let config = serde_json::json!({});
        let rules = parse_vyos_dnat_config(&config);
        assert!(rules.is_empty());
    }

    #[test]
    fn parse_single_rule() {
        let config = serde_json::json!({
            "rule": {
                "10": {
                    "description": "SSH forward",
                    "protocol": "tcp",
                    "inbound-interface": { "name": "eth0" },
                    "destination": { "port": "2222" },
                    "translation": {
                        "address": "192.168.1.100",
                        "port": "22"
                    }
                }
            }
        });
        let rules = parse_vyos_dnat_config(&config);
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].rule, 10);
        assert_eq!(rules[0].description.as_deref(), Some("SSH forward"));
        assert_eq!(rules[0].protocol.as_deref(), Some("tcp"));
        assert_eq!(rules[0].inbound_interface.as_deref(), Some("eth0"));
        assert_eq!(rules[0].external_port.as_deref(), Some("2222"));
        assert_eq!(rules[0].internal_ip.as_deref(), Some("192.168.1.100"));
        assert_eq!(rules[0].internal_port.as_deref(), Some("22"));
    }

    #[test]
    fn parse_multiple_rules_sorted() {
        let config = serde_json::json!({
            "rule": {
                "20": { "protocol": "udp" },
                "5": { "protocol": "tcp" },
                "100": { "protocol": "tcp_udp" }
            }
        });
        let rules = parse_vyos_dnat_config(&config);
        assert_eq!(rules.len(), 3);
        assert_eq!(rules[0].rule, 5);
        assert_eq!(rules[1].rule, 20);
        assert_eq!(rules[2].rule, 100);
    }

    #[test]
    fn default_protocol_is_tcp() {
        assert_eq!(default_protocol(), "tcp");
    }
}
