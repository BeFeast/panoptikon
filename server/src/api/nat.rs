//! NAT (port forwarding) management endpoints.
//!
//! Provides CRUD operations for MikroTik firewall NAT rules,
//! allowing users to manage port forwarding.

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

/// Unified NAT rule response.
#[derive(Debug, Serialize)]
pub struct NatRuleResponse {
    pub success: bool,
    pub message: String,
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
    pub in_interface: Option<String>,
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateMikrotikNatRuleRequest {
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
            in_interface: r.in_interface,
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
        src_address: body.src_address,
        dst_address: body.dst_address,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        in_interface: body.in_interface,
        out_interface: body.out_interface,
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
        src_address: body.src_address,
        dst_address: body.dst_address,
        dst_port: body.dst_port,
        to_addresses: body.to_addresses,
        to_ports: body.to_ports,
        in_interface: body.in_interface,
        out_interface: body.out_interface,
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
    pub mikrotik_available: bool,
    pub mikrotik_rule_count: usize,
}

/// GET /api/v1/nat/summary — overview of NAT rule counts.
pub async fn summary(State(state): State<AppState>) -> Json<NatSummary> {
    let mt_client = mikrotik_client(&state).await;

    let mt_count = if let Some(ref client) = mt_client {
        client.firewall_nat().await.map(|v| v.len()).unwrap_or(0)
    } else {
        0
    };

    Json(NatSummary {
        mikrotik_available: mt_client.is_some(),
        mikrotik_rule_count: mt_count,
    })
}
