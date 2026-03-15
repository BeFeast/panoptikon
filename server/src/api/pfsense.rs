//! pfSense firewall API handler endpoints.
//!
//! These endpoints proxy requests to a pfSense box via SSH + PHP bridge,
//! using cached responses to avoid redundant network calls.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{audit, AppState};
use crate::pfsense::client::{PfsenseAuth, PfsenseClient};
use crate::pfsense::types::*;

// ── Helper: build a pfSense client from DB settings ───────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Try to construct a pfSense client from saved settings.
/// Returns `None` if pfSense is not configured or not enabled.
async fn pfsense_client(state: &AppState) -> Option<PfsenseClient> {
    let enabled = get_setting(state, "pfsense_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let host = get_setting(state, "pfsense_host").await?;
    let port: u16 = get_setting(state, "pfsense_port")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(22);
    let username = get_setting(state, "pfsense_username")
        .await
        .unwrap_or_else(|| "root".to_string());

    let auth_type = get_setting(state, "pfsense_auth_type")
        .await
        .unwrap_or_else(|| "password".to_string());

    let auth = if auth_type == "key" {
        match get_setting(state, "pfsense_private_key").await {
            Some(key) => PfsenseAuth::Key(key),
            None => PfsenseAuth::Agent,
        }
    } else {
        let password = get_setting(state, "pfsense_password")
            .await
            .unwrap_or_default();
        PfsenseAuth::Password(password)
    };

    Some(PfsenseClient::new(&host, port, &username, auth))
}

// ── Request types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PfsenseTestConnectionRequest {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub auth_type: Option<String>,
    pub password: Option<String>,
    pub private_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleInterfaceRequest {
    pub enable: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateRouteRequest {
    pub network: String,
    pub gateway: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFirewallRuleRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFirewallRuleRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateNatRuleRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNatRuleRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateAliasRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAliasRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateDhcpStaticMappingRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct CreateDnsOverrideRequest {
    #[serde(flatten)]
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct ToggleFirewallRuleRequest {
    pub disabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateConfigBackupRequest {
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RestoreConfigRequest {
    pub content: Option<String>,
}

// ── Response types ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct PfsenseStatusResponse {
    pub configured: bool,
    pub reachable: bool,
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub cpu_usage: Option<f64>,
    pub memory_total: Option<u64>,
    pub memory_used: Option<u64>,
    pub platform: Option<String>,
}

impl PfsenseStatusResponse {
    fn not_configured() -> Self {
        Self {
            configured: false,
            reachable: false,
            hostname: None,
            domain: None,
            version: None,
            uptime: None,
            cpu_usage: None,
            memory_total: None,
            memory_used: None,
            platform: None,
        }
    }

    fn unreachable() -> Self {
        Self {
            configured: true,
            reachable: false,
            hostname: None,
            domain: None,
            version: None,
            uptime: None,
            cpu_usage: None,
            memory_total: None,
            memory_used: None,
            platform: None,
        }
    }

    fn from_info(info: PfsenseSystemInfo) -> Self {
        Self {
            configured: true,
            reachable: true,
            hostname: info.hostname,
            domain: info.domain,
            version: info.version,
            uptime: info.uptime,
            cpu_usage: info.cpu_usage,
            memory_total: info.memory_total,
            memory_used: info.memory_used,
            platform: info.platform,
        }
    }
}

// ── Endpoints ─────────────────────────────────────────────

/// POST /api/v1/pfsense/test-connection
pub async fn test_connection(
    State(state): State<AppState>,
    Json(body): Json<PfsenseTestConnectionRequest>,
) -> Result<Json<PfsenseStatusResponse>, StatusCode> {
    let host = body
        .host
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .or(get_setting(&state, "pfsense_host").await);

    let Some(host) = host else {
        return Ok(Json(PfsenseStatusResponse::not_configured()));
    };

    let port = body
        .port
        .or(get_setting(&state, "pfsense_port")
            .await
            .and_then(|v| v.parse().ok()))
        .unwrap_or(22);

    let username = body
        .username
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
        .or(get_setting(&state, "pfsense_username").await)
        .unwrap_or_else(|| "root".to_string());

    let auth_type = body.auth_type.as_deref().unwrap_or("password");

    let auth = if auth_type == "key" {
        let key = body
            .private_key
            .or(get_setting(&state, "pfsense_private_key").await)
            .unwrap_or_default();
        PfsenseAuth::Key(key)
    } else {
        let password = body
            .password
            .or(get_setting(&state, "pfsense_password").await)
            .unwrap_or_default();
        PfsenseAuth::Password(password)
    };

    let client = PfsenseClient::new(&host, port, &username, auth);

    match client.status() {
        Ok(info) => Ok(Json(PfsenseStatusResponse::from_info(info))),
        Err(e) => {
            tracing::warn!("pfSense test connection failed: {e}");
            Ok(Json(PfsenseStatusResponse::unreachable()))
        }
    }
}

/// GET /api/v1/pfsense/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<PfsenseStatusResponse>, StatusCode> {
    let Some(client) = pfsense_client(&state).await else {
        return Ok(Json(PfsenseStatusResponse::not_configured()));
    };

    if let Some(cached) = state.pfsense_cache.get("status") {
        if let Ok(resp) = serde_json::from_value::<PfsenseStatusResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    match client.status() {
        Ok(info) => {
            let resp = PfsenseStatusResponse::from_info(info);
            if let Ok(val) = serde_json::to_value(&resp) {
                state.pfsense_cache.set("status".into(), val);
            }
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::warn!("pfSense status check failed: {e}");
            Ok(Json(PfsenseStatusResponse::unreachable()))
        }
    }
}

/// GET /api/v1/pfsense/interfaces
pub async fn interfaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseInterface>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("interfaces") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.interfaces().map_err(|e| {
        tracing::error!("pfSense interfaces error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("interfaces".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/interfaces/:id/toggle
pub async fn toggle_interface(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleInterfaceRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!(
        "{} pfSense interface {id}",
        if body.enable { "Enable" } else { "Disable" }
    );
    let cmds = vec![format!("interface_toggle {id} enable={}", body.enable)];

    match client.interface_toggle(&id, body.enable) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_interface_toggle", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_interface_toggle",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense toggle interface error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/gateways
pub async fn gateways(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseGateway>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("gateways") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.gateways().map_err(|e| {
        tracing::error!("pfSense gateways error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("gateways".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/pfsense/routes
pub async fn routes(State(state): State<AppState>) -> Result<Json<Vec<PfsenseRoute>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("routes") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.routes().map_err(|e| {
        tracing::error!("pfSense routes error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("routes".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/routes
pub async fn create_route(
    State(state): State<AppState>,
    Json(body): Json<CreateRouteRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!(
        "Create pfSense static route {} via {}",
        body.network, body.gateway
    );
    let cmds = vec![format!(
        "route_create network={} gateway={}",
        body.network, body.gateway
    )];

    match client.route_create(&body.network, &body.gateway) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_route_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_route_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create route error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/routes/:id
pub async fn delete_route(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense static route {id}");
    let cmds = vec![format!("route_delete {id}")];

    match client.route_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_route_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_route_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete route error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/dhcp/leases
pub async fn dhcp_leases(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseDhcpLease>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("dhcp_leases") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.dhcp_leases().map_err(|e| {
        tracing::error!("pfSense DHCP leases error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("dhcp_leases".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/pfsense/dhcp/static-mappings
pub async fn dhcp_static_mappings(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseDhcpStaticMapping>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("dhcp_static_mappings") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.dhcp_static_mappings().map_err(|e| {
        tracing::error!("pfSense DHCP static mappings error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("dhcp_static_mappings".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/dhcp/static-mappings
pub async fn create_dhcp_static_mapping(
    State(state): State<AppState>,
    Json(body): Json<CreateDhcpStaticMappingRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = "Create pfSense DHCP static mapping".to_string();
    let cmds = vec!["dhcp_static_create".to_string()];

    match client.dhcp_static_create(&body.data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_dhcp_static_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_dhcp_static_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create DHCP static mapping error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/dhcp/static-mappings/:id
pub async fn delete_dhcp_static_mapping(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense DHCP static mapping {id}");
    let cmds = vec![format!("dhcp_static_delete {id}")];

    match client.dhcp_static_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_dhcp_static_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_dhcp_static_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete DHCP static mapping error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/firewall/rules
pub async fn firewall_rules(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseFirewallRule>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("firewall_rules") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.firewall_rules().map_err(|e| {
        tracing::error!("pfSense firewall rules error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("firewall_rules".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/firewall/rules
pub async fn create_firewall_rule(
    State(state): State<AppState>,
    Json(body): Json<CreateFirewallRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = "Create pfSense firewall rule".to_string();
    let cmds = vec!["firewall_rule_create".to_string()];

    match client.firewall_rule_create(&body.data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_firewall_rule_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_firewall_rule_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create firewall rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// PUT /api/v1/pfsense/firewall/rules/:id
pub async fn update_firewall_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateFirewallRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let mut data = body.data;
    if let Some(obj) = data.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.clone()));
    }

    let desc = format!("Update pfSense firewall rule {id}");
    let cmds = vec![format!("firewall_rule_update {id}")];

    match client.firewall_rule_update(&data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_firewall_rule_update", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_firewall_rule_update",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense update firewall rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/firewall/rules/:id
pub async fn delete_firewall_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense firewall rule {id}");
    let cmds = vec![format!("firewall_rule_delete {id}")];

    match client.firewall_rule_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_firewall_rule_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_firewall_rule_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete firewall rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// POST /api/v1/pfsense/firewall/rules/:id/toggle
pub async fn toggle_firewall_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleFirewallRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let data = serde_json::json!({ "id": id, "disabled": body.disabled });
    let desc = format!(
        "{} pfSense firewall rule {id}",
        if body.disabled { "Disable" } else { "Enable" }
    );
    let cmds = vec![format!(
        "firewall_rule_update {id} disabled={}",
        body.disabled
    )];

    match client.firewall_rule_update(&data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_firewall_rule_toggle", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_firewall_rule_toggle",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense toggle firewall rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/nat/rules
pub async fn nat_rules(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseNatRule>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("nat_rules") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.nat_rules().map_err(|e| {
        tracing::error!("pfSense NAT rules error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("nat_rules".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/nat/rules
pub async fn create_nat_rule(
    State(state): State<AppState>,
    Json(body): Json<CreateNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = "Create pfSense NAT rule".to_string();
    let cmds = vec!["nat_rule_create".to_string()];

    match client.nat_rule_create(&body.data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_nat_rule_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_nat_rule_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create NAT rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// PUT /api/v1/pfsense/nat/rules/:id
pub async fn update_nat_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateNatRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let mut data = body.data;
    if let Some(obj) = data.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.clone()));
    }

    let desc = format!("Update pfSense NAT rule {id}");
    let cmds = vec![format!("nat_rule_update {id}")];

    match client.nat_rule_update(&data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_nat_rule_update", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_nat_rule_update",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense update NAT rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/nat/rules/:id
pub async fn delete_nat_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense NAT rule {id}");
    let cmds = vec![format!("nat_rule_delete {id}")];

    match client.nat_rule_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_nat_rule_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_nat_rule_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete NAT rule error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/aliases
pub async fn aliases(State(state): State<AppState>) -> Result<Json<Vec<PfsenseAlias>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("aliases") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.aliases().map_err(|e| {
        tracing::error!("pfSense aliases error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("aliases".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/aliases
pub async fn create_alias(
    State(state): State<AppState>,
    Json(body): Json<CreateAliasRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = "Create pfSense alias".to_string();
    let cmds = vec!["alias_create".to_string()];

    match client.alias_create(&body.data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_alias_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_alias_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create alias error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// PUT /api/v1/pfsense/aliases/:id
pub async fn update_alias(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAliasRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let mut data = body.data;
    if let Some(obj) = data.as_object_mut() {
        obj.insert("name".to_string(), Value::String(id.clone()));
    }

    let desc = format!("Update pfSense alias {id}");
    let cmds = vec![format!("alias_update {id}")];

    match client.alias_update(&data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_alias_update", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_alias_update",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense update alias error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/aliases/:id
pub async fn delete_alias(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense alias {id}");
    let cmds = vec![format!("alias_delete {id}")];

    match client.alias_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_alias_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_alias_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete alias error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/dns/config
pub async fn dns_config(
    State(state): State<AppState>,
) -> Result<Json<PfsenseDnsConfig>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("dns_config") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.dns_config().map_err(|e| {
        tracing::error!("pfSense DNS config error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("dns_config".into(), val);
    }
    Ok(Json(result))
}

/// GET /api/v1/pfsense/dns/overrides
pub async fn dns_overrides(
    State(state): State<AppState>,
) -> Result<Json<Vec<PfsenseDnsOverride>>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.pfsense_cache.get("dns_overrides") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let result = client.dns_overrides().map_err(|e| {
        tracing::error!("pfSense DNS overrides error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    if let Ok(val) = serde_json::to_value(&result) {
        state.pfsense_cache.set("dns_overrides".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/pfsense/dns/overrides
pub async fn create_dns_override(
    State(state): State<AppState>,
    Json(body): Json<CreateDnsOverrideRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = "Create pfSense DNS override".to_string();
    let cmds = vec!["dns_override_create".to_string()];

    match client.dns_override_create(&body.data) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_dns_override_create", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_dns_override_create",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create DNS override error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/v1/pfsense/dns/overrides/:id
pub async fn delete_dns_override(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!("Delete pfSense DNS override {id}");
    let cmds = vec![format!("dns_override_delete {id}")];

    match client.dns_override_delete(&id) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_dns_override_delete", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_dns_override_delete",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense delete DNS override error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/config-backups
pub async fn config_backups(State(_state): State<AppState>) -> Json<Vec<Value>> {
    // Config backups are managed via create/restore flow.
    // For v1, return empty list — snapshots are ephemeral (created on-demand).
    Json(vec![])
}

/// POST /api/v1/pfsense/config-backups
pub async fn create_config_backup(
    State(state): State<AppState>,
    Json(body): Json<CreateConfigBackupRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let desc = format!(
        "Create pfSense config backup{}",
        body.description
            .as_deref()
            .map(|d| format!(": {d}"))
            .unwrap_or_default()
    );
    let cmds = vec!["config_snapshot".to_string()];

    match client.config_snapshot() {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_config_backup", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_config_backup",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense create config backup error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /api/v1/pfsense/config-backups/current
pub async fn config_current(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let result = client.config_current().map_err(|e| {
        tracing::error!("pfSense config current error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(result))
}

/// GET /api/v1/pfsense/config-backups/:id/diff
pub async fn config_diff(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let result = client.config_diff(&id, None).map_err(|e| {
        tracing::error!("pfSense config diff error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(result))
}

/// POST /api/v1/pfsense/config-backups/:id/restore
pub async fn restore_config_backup(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RestoreConfigRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = pfsense_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let content = body.content.as_deref().unwrap_or(&id);
    let desc = format!("Restore pfSense config backup {id}");
    let cmds = vec![format!("config_restore {id}")];

    match client.config_restore(content) {
        Ok(_) => {
            audit::log_success(&state.db, "pfsense_config_restore", &desc, &cmds).await;
            Ok(StatusCode::NO_CONTENT)
        }
        Err(e) => {
            audit::log_failure(
                &state.db,
                "pfsense_config_restore",
                &desc,
                &cmds,
                &e.to_string(),
            )
            .await;
            tracing::error!("pfSense restore config error: {e}");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

type AuditRow = (i64, String, String, String, String, i32, Option<String>);

/// GET /api/v1/pfsense/audit
pub async fn audit_log(State(state): State<AppState>) -> Result<Json<Vec<Value>>, StatusCode> {
    // Return pfSense-related audit entries from the shared audit log
    let rows: Vec<AuditRow> = sqlx::query_as(
        "SELECT id, created_at, action, description, vyos_commands, success, error_msg \
         FROM audit_log WHERE action LIKE 'pfsense_%' ORDER BY id DESC LIMIT 100",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("pfSense audit log query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entries: Vec<Value> = rows
        .into_iter()
        .map(
            |(id, created_at, action, description, commands, success, error_msg)| {
                serde_json::json!({
                    "id": id,
                    "timestamp": created_at,
                    "action": action,
                    "description": description,
                    "commands": commands,
                    "success": success != 0,
                    "error": error_msg,
                })
            },
        )
        .collect();

    Ok(Json(entries))
}
