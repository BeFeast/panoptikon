//! Unified "Add Service" and "Remove Service" wizard API.
//!
//! Orchestrates creating/removing NPM proxy hosts, VyOS firewall rules,
//! and VyOS DNAT rules in a single API call with per-step status reporting.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::audit;
use super::AppState;
use crate::npm::client::{NpmClient, NpmProxyHostPayload};

// ─── Add Service ────────────────────────────────────────────────

/// Request body for the "Add Service" wizard.
#[derive(Debug, Deserialize)]
pub struct AddServiceRequest {
    /// Human-readable service name (used in descriptions).
    pub name: String,
    /// Optional description.
    pub description: Option<String>,

    // ── Backend (internal service) ──
    /// Internal IP address of the backend service.
    pub internal_ip: String,
    /// Internal port of the backend service.
    pub internal_port: u16,
    /// Forward scheme: "http" or "https".
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,

    // ── NPM Proxy Host (optional) ──
    /// If set, create an NPM proxy host with these domain names.
    pub domain_names: Option<Vec<String>>,
    /// SSL mode: "none", "letsencrypt", or a numeric certificate ID.
    #[serde(default = "default_ssl_mode")]
    pub ssl_mode: String,
    /// Email for Let's Encrypt (required if ssl_mode = "letsencrypt").
    pub letsencrypt_email: Option<String>,
    /// Force SSL redirect.
    #[serde(default)]
    pub ssl_forced: bool,
    /// Enable HTTP/2.
    #[serde(default)]
    pub http2_support: bool,
    /// Block common exploits.
    #[serde(default)]
    pub block_exploits: bool,
    /// Allow WebSocket upgrade.
    #[serde(default)]
    pub allow_websocket_upgrade: bool,

    // ── VyOS Firewall Rule (optional) ──
    /// If true, create a VyOS firewall allow rule.
    #[serde(default)]
    pub create_firewall_rule: bool,
    /// Firewall chain path (e.g. "ipv4.forward.filter"). Required if create_firewall_rule.
    pub firewall_chain: Option<String>,
    /// Firewall rule number. Required if create_firewall_rule.
    pub firewall_rule_number: Option<u32>,
    /// Protocol for the firewall rule (default: "tcp").
    pub firewall_protocol: Option<String>,
    /// Source address for the firewall rule (optional).
    pub firewall_source_address: Option<String>,

    // ── VyOS DNAT Rule (optional) ──
    /// If true, create a VyOS destination NAT rule for direct port access.
    #[serde(default)]
    pub create_dnat_rule: bool,
    /// DNAT rule number. Required if create_dnat_rule.
    pub dnat_rule_number: Option<u32>,
    /// External (public) port for DNAT.
    pub dnat_external_port: Option<u16>,
    /// Inbound interface for DNAT (e.g. "eth0").
    pub dnat_inbound_interface: Option<String>,
    /// DNAT protocol (default: "tcp").
    pub dnat_protocol: Option<String>,
}

fn default_scheme() -> String {
    "http".to_string()
}

fn default_ssl_mode() -> String {
    "none".to_string()
}

/// Per-step result in the wizard response.
#[derive(Debug, Serialize, Clone)]
pub struct StepResult {
    pub step: String,
    pub success: bool,
    pub message: String,
    /// Resource ID created (e.g. NPM proxy host ID, firewall rule number).
    pub resource_id: Option<String>,
}

/// Response for the Add Service wizard.
#[derive(Debug, Serialize)]
pub struct AddServiceResponse {
    /// Overall success: true only if ALL requested steps succeeded.
    pub success: bool,
    pub steps: Vec<StepResult>,
}

/// JSON error body.
#[derive(Serialize)]
pub struct ErrorBody {
    error: String,
}

fn error_response(status: StatusCode, msg: String) -> (StatusCode, Json<ErrorBody>) {
    (status, Json(ErrorBody { error: msg }))
}

/// POST /api/v1/services/add — unified service provisioning wizard.
pub async fn add_service(
    State(state): State<AppState>,
    Json(body): Json<AddServiceRequest>,
) -> Result<Json<AddServiceResponse>, (StatusCode, Json<ErrorBody>)> {
    // Validate required fields
    if body.name.trim().is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "Service name is required".into(),
        ));
    }
    if body.internal_ip.trim().is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "Internal IP is required".into(),
        ));
    }
    if body.internal_port == 0 {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "Internal port must be > 0".into(),
        ));
    }

    // Check that at least one operation is requested
    let has_npm = body.domain_names.as_ref().is_some_and(|d| !d.is_empty());
    let has_fw = body.create_firewall_rule;
    let has_dnat = body.create_dnat_rule;

    if !has_npm && !has_fw && !has_dnat {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "At least one operation must be requested (NPM proxy, firewall rule, or DNAT rule)"
                .into(),
        ));
    }

    let mut steps: Vec<StepResult> = Vec::new();
    let mut all_ok = true;

    let desc_prefix = body
        .description
        .as_deref()
        .filter(|d| !d.is_empty())
        .map_or(body.name.clone(), |d| format!("{} — {}", body.name, d));

    // ── Step 1: Create NPM Proxy Host ──
    if has_npm {
        let result = create_npm_proxy_step(&state, &body, &desc_prefix).await;
        if !result.success {
            all_ok = false;
        }
        steps.push(result);
    }

    // ── Step 2: Create VyOS Firewall Rule ──
    if has_fw {
        let result = create_firewall_step(&state, &body, &desc_prefix).await;
        if !result.success {
            all_ok = false;
        }
        steps.push(result);
    }

    // ── Step 3: Create VyOS DNAT Rule ──
    if has_dnat {
        let result = create_dnat_step(&state, &body, &desc_prefix).await;
        if !result.success {
            all_ok = false;
        }
        steps.push(result);
    }

    // Audit log: overall result
    let audit_desc = format!("Add Service wizard: {}", desc_prefix);
    let audit_commands: Vec<String> = steps
        .iter()
        .map(|s| {
            format!(
                "[{}] {}: {}",
                if s.success { "OK" } else { "FAIL" },
                s.step,
                s.message
            )
        })
        .collect();

    if all_ok {
        audit::log_success(&state.db, "service_add", &audit_desc, &audit_commands).await;
    } else {
        let errors: Vec<String> = steps
            .iter()
            .filter(|s| !s.success)
            .map(|s| format!("{}: {}", s.step, s.message))
            .collect();
        audit::log_failure(
            &state.db,
            "service_add",
            &audit_desc,
            &audit_commands,
            &errors.join("; "),
        )
        .await;
    }

    Ok(Json(AddServiceResponse {
        success: all_ok,
        steps,
    }))
}

/// Create NPM proxy host (and optionally request a Let's Encrypt cert first).
async fn create_npm_proxy_step(
    state: &AppState,
    body: &AddServiceRequest,
    _desc: &str,
) -> StepResult {
    let domain_names = match &body.domain_names {
        Some(d) => d.clone(),
        None => {
            return StepResult {
                step: "npm_proxy_host".into(),
                success: false,
                message: "No domain names provided".into(),
                resource_id: None,
            };
        }
    };

    // Get NPM client
    let client = match get_npm_client(state).await {
        Some(c) => c,
        None => {
            return StepResult {
                step: "npm_proxy_host".into(),
                success: false,
                message: "NPM not configured — check Settings".into(),
                resource_id: None,
            };
        }
    };

    // Handle SSL: possibly request a Let's Encrypt cert first
    let certificate_id: serde_json::Value = match body.ssl_mode.as_str() {
        "letsencrypt" => {
            let email = match &body.letsencrypt_email {
                Some(e) if !e.is_empty() => e.clone(),
                _ => {
                    return StepResult {
                        step: "npm_proxy_host".into(),
                        success: false,
                        message: "Let's Encrypt email is required for SSL".into(),
                        resource_id: None,
                    };
                }
            };

            let nice_name = domain_names.join(", ");
            match client
                .create_letsencrypt_cert(&nice_name, domain_names.clone(), &email, false)
                .await
            {
                Ok(cert) => serde_json::json!(cert.id),
                Err(e) => {
                    error!("Let's Encrypt cert request failed: {e}");
                    return StepResult {
                        step: "npm_proxy_host".into(),
                        success: false,
                        message: format!("Let's Encrypt certificate request failed: {e}"),
                        resource_id: None,
                    };
                }
            }
        }
        "none" => serde_json::json!(0),
        other => {
            // Assume it's a numeric certificate ID
            match other.parse::<i64>() {
                Ok(id) => serde_json::json!(id),
                Err(_) => serde_json::json!(0),
            }
        }
    };

    let ssl_forced = body.ssl_forced || body.ssl_mode == "letsencrypt";

    let payload = NpmProxyHostPayload {
        domain_names,
        forward_host: body.internal_ip.clone(),
        forward_port: body.internal_port,
        forward_scheme: body.forward_scheme.clone(),
        certificate_id,
        access_list_id: serde_json::json!(0),
        ssl_forced,
        hsts_enabled: ssl_forced,
        http2_support: body.http2_support,
        block_exploits: body.block_exploits,
        allow_websocket_upgrade: body.allow_websocket_upgrade,
        advanced_config: String::new(),
    };

    match client.create_proxy_host(&payload).await {
        Ok(host) => {
            info!("NPM proxy host created: id={}", host.id);
            StepResult {
                step: "npm_proxy_host".into(),
                success: true,
                message: format!(
                    "Proxy host created — {} → {}:{}",
                    host.domain_names.join(", "),
                    body.internal_ip,
                    body.internal_port
                ),
                resource_id: Some(host.id.to_string()),
            }
        }
        Err(e) => {
            error!("NPM proxy host creation failed: {e}");
            StepResult {
                step: "npm_proxy_host".into(),
                success: false,
                message: format!("Failed to create proxy host: {e}"),
                resource_id: None,
            }
        }
    }
}

/// Create VyOS firewall allow rule.
async fn create_firewall_step(
    state: &AppState,
    body: &AddServiceRequest,
    _desc: &str,
) -> StepResult {
    let chain = match &body.firewall_chain {
        Some(c) if !c.is_empty() => c.clone(),
        _ => {
            return StepResult {
                step: "firewall_rule".into(),
                success: false,
                message: "Firewall chain path is required (e.g. 'ipv4.forward.filter')".into(),
                resource_id: None,
            };
        }
    };

    let rule_number = match body.firewall_rule_number {
        Some(n) if n > 0 && n <= 99999 => n,
        _ => {
            return StepResult {
                step: "firewall_rule".into(),
                success: false,
                message: "Firewall rule number must be between 1 and 99999".into(),
                resource_id: None,
            };
        }
    };

    let client = match super::vyos::get_vyos_client_or_503(state).await {
        Ok(c) => c,
        Err(_) => {
            return StepResult {
                step: "firewall_rule".into(),
                success: false,
                message: "VyOS router not configured — check Settings".into(),
                resource_id: None,
            };
        }
    };

    let chain_parts: Vec<&str> = chain.split('.').collect();
    if chain_parts.len() != 3 {
        return StepResult {
            step: "firewall_rule".into(),
            success: false,
            message: "Invalid chain path — expected 3 parts like 'ipv4.forward.filter'".into(),
            resource_id: None,
        };
    }

    let protocol = body.firewall_protocol.as_deref().unwrap_or("tcp");

    let description = format!(
        "Allow {} to {}:{} [{}]",
        protocol, body.internal_ip, body.internal_port, body.name
    );

    // Build the VyOS config path for this rule
    let base: Vec<String> = vec![
        "firewall".into(),
        chain_parts[0].into(),
        chain_parts[1].into(),
        chain_parts[2].into(),
        "rule".into(),
        rule_number.to_string(),
    ];
    let base_strs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();

    // Set action = accept
    let mut path = base_strs.clone();
    path.push("action");
    path.push("accept");
    if let Err(e) = client.configure_set(&path).await {
        return step_fail("firewall_rule", &format!("Failed to set action: {e}"));
    }

    // Set protocol
    let mut path = base_strs.clone();
    path.push("protocol");
    path.push(protocol);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_strs).await;
        return step_fail("firewall_rule", &format!("Failed to set protocol: {e}"));
    }

    // Set destination address
    let mut path = base_strs.clone();
    path.push("destination");
    path.push("address");
    path.push(&body.internal_ip);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_strs).await;
        return step_fail(
            "firewall_rule",
            &format!("Failed to set destination address: {e}"),
        );
    }

    // Set destination port
    let port_str = body.internal_port.to_string();
    let mut path = base_strs.clone();
    path.push("destination");
    path.push("port");
    path.push(&port_str);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_strs).await;
        return step_fail(
            "firewall_rule",
            &format!("Failed to set destination port: {e}"),
        );
    }

    // Set source address (optional)
    if let Some(ref src) = body.firewall_source_address {
        if !src.is_empty() {
            let mut path = base_strs.clone();
            path.push("source");
            path.push("address");
            path.push(src);
            if let Err(e) = client.configure_set(&path).await {
                let _ = client.configure_delete(&base_strs).await;
                return step_fail(
                    "firewall_rule",
                    &format!("Failed to set source address: {e}"),
                );
            }
        }
    }

    // Set description
    let mut path = base_strs.clone();
    path.push("description");
    path.push(&description);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_strs).await;
        return step_fail("firewall_rule", &format!("Failed to set description: {e}"));
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after service firewall rule create: {e}");
    }

    info!(
        "VyOS firewall rule {} created in chain {}",
        rule_number, chain
    );

    StepResult {
        step: "firewall_rule".into(),
        success: true,
        message: format!(
            "Firewall rule {} created in {} — allow {} to {}:{}",
            rule_number, chain, protocol, body.internal_ip, body.internal_port
        ),
        resource_id: Some(rule_number.to_string()),
    }
}

/// Create VyOS DNAT (destination NAT / port forwarding) rule.
async fn create_dnat_step(state: &AppState, body: &AddServiceRequest, _desc: &str) -> StepResult {
    let rule_number = match body.dnat_rule_number {
        Some(n) if n > 0 && n <= 99999 => n,
        _ => {
            return StepResult {
                step: "dnat_rule".into(),
                success: false,
                message: "DNAT rule number must be between 1 and 99999".into(),
                resource_id: None,
            };
        }
    };

    let external_port = match body.dnat_external_port {
        Some(p) if p > 0 => p,
        _ => {
            return StepResult {
                step: "dnat_rule".into(),
                success: false,
                message: "External port is required for DNAT".into(),
                resource_id: None,
            };
        }
    };

    let client = match super::vyos::get_vyos_client_or_503(state).await {
        Ok(c) => c,
        Err(_) => {
            return StepResult {
                step: "dnat_rule".into(),
                success: false,
                message: "VyOS router not configured — check Settings".into(),
                resource_id: None,
            };
        }
    };

    let protocol = body.dnat_protocol.as_deref().unwrap_or("tcp");
    let rule_str = rule_number.to_string();
    let ext_port_str = external_port.to_string();
    let int_port_str = body.internal_port.to_string();

    let description = format!(
        "DNAT port {} → {}:{} [{}]",
        external_port, body.internal_ip, body.internal_port, body.name
    );

    // VyOS DNAT config path: nat destination rule <N>
    let base_path = ["nat", "destination", "rule", &rule_str];

    // Set description
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("description");
    path.push(&description);
    if let Err(e) = client.configure_set(&path).await {
        return step_fail("dnat_rule", &format!("Failed to set description: {e}"));
    }

    // Set protocol
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("protocol");
    path.push(protocol);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return step_fail("dnat_rule", &format!("Failed to set protocol: {e}"));
    }

    // Set inbound-interface (optional)
    if let Some(ref iface) = body.dnat_inbound_interface {
        if !iface.is_empty() {
            let mut path: Vec<&str> = base_path.to_vec();
            path.push("inbound-interface");
            path.push("name");
            path.push(iface);
            if let Err(e) = client.configure_set(&path).await {
                let _ = client.configure_delete(&base_path).await;
                return step_fail(
                    "dnat_rule",
                    &format!("Failed to set inbound interface: {e}"),
                );
            }
        }
    }

    // Set destination port (external port that triggers the rule)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("destination");
    path.push("port");
    path.push(&ext_port_str);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return step_fail("dnat_rule", &format!("Failed to set destination port: {e}"));
    }

    // Set translation address (internal IP)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("address");
    path.push(&body.internal_ip);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return step_fail(
            "dnat_rule",
            &format!("Failed to set translation address: {e}"),
        );
    }

    // Set translation port (internal port)
    let mut path: Vec<&str> = base_path.to_vec();
    path.push("translation");
    path.push("port");
    path.push(&int_port_str);
    if let Err(e) = client.configure_set(&path).await {
        let _ = client.configure_delete(&base_path).await;
        return step_fail("dnat_rule", &format!("Failed to set translation port: {e}"));
    }

    if let Err(e) = client.config_save().await {
        tracing::warn!("config-file save failed after service DNAT rule create: {e}");
    }

    info!("VyOS DNAT rule {} created", rule_number);

    StepResult {
        step: "dnat_rule".into(),
        success: true,
        message: format!(
            "DNAT rule {} created — port {} → {}:{}",
            rule_number, external_port, body.internal_ip, body.internal_port
        ),
        resource_id: Some(rule_number.to_string()),
    }
}

fn step_fail(step: &str, msg: &str) -> StepResult {
    StepResult {
        step: step.into(),
        success: false,
        message: msg.into(),
        resource_id: None,
    }
}

// ─── Remove Service ─────────────────────────────────────────────

/// A single resource to remove.
#[derive(Debug, Deserialize)]
pub struct RemoveResource {
    /// "npm_proxy_host", "firewall_rule", or "dnat_rule"
    pub resource_type: String,
    /// For npm_proxy_host: the NPM host ID.
    /// For firewall_rule: the rule number.
    /// For dnat_rule: the rule number.
    pub resource_id: String,
    /// For firewall_rule: the chain path (e.g. "ipv4.forward.filter").
    pub chain: Option<String>,
}

/// Request body for the "Remove Service" wizard.
#[derive(Debug, Deserialize)]
pub struct RemoveServiceRequest {
    /// Human-readable service name (for audit log).
    pub name: String,
    /// List of resources to remove.
    pub resources: Vec<RemoveResource>,
}

/// Response for the Remove Service wizard.
#[derive(Debug, Serialize)]
pub struct RemoveServiceResponse {
    pub success: bool,
    pub steps: Vec<StepResult>,
}

/// POST /api/v1/services/remove — remove service resources.
pub async fn remove_service(
    State(state): State<AppState>,
    Json(body): Json<RemoveServiceRequest>,
) -> Result<Json<RemoveServiceResponse>, (StatusCode, Json<ErrorBody>)> {
    if body.resources.is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "No resources to remove".into(),
        ));
    }

    let mut steps: Vec<StepResult> = Vec::new();
    let mut all_ok = true;

    for resource in &body.resources {
        let result = match resource.resource_type.as_str() {
            "npm_proxy_host" => remove_npm_proxy_host(&state, resource).await,
            "firewall_rule" => remove_firewall_rule(&state, resource).await,
            "dnat_rule" => remove_dnat_rule(&state, resource).await,
            other => StepResult {
                step: format!("remove_{}", other),
                success: false,
                message: format!("Unknown resource type: {}", other),
                resource_id: Some(resource.resource_id.clone()),
            },
        };
        if !result.success {
            all_ok = false;
        }
        steps.push(result);
    }

    // Audit log
    let audit_desc = format!("Remove Service wizard: {}", body.name);
    let audit_commands: Vec<String> = steps
        .iter()
        .map(|s| {
            format!(
                "[{}] {}: {}",
                if s.success { "OK" } else { "FAIL" },
                s.step,
                s.message
            )
        })
        .collect();

    if all_ok {
        audit::log_success(&state.db, "service_remove", &audit_desc, &audit_commands).await;
    } else {
        let errors: Vec<String> = steps
            .iter()
            .filter(|s| !s.success)
            .map(|s| format!("{}: {}", s.step, s.message))
            .collect();
        audit::log_failure(
            &state.db,
            "service_remove",
            &audit_desc,
            &audit_commands,
            &errors.join("; "),
        )
        .await;
    }

    Ok(Json(RemoveServiceResponse {
        success: all_ok,
        steps,
    }))
}

async fn remove_npm_proxy_host(state: &AppState, resource: &RemoveResource) -> StepResult {
    let id: i64 = match resource.resource_id.parse() {
        Ok(id) => id,
        Err(_) => {
            return step_fail(
                "remove_npm_proxy_host",
                &format!("Invalid NPM host ID: {}", resource.resource_id),
            );
        }
    };

    let client = match get_npm_client(state).await {
        Some(c) => c,
        None => {
            return step_fail("remove_npm_proxy_host", "NPM not configured");
        }
    };

    match client.delete_proxy_host(id).await {
        Ok(_) => {
            info!("NPM proxy host {} deleted", id);
            StepResult {
                step: "remove_npm_proxy_host".into(),
                success: true,
                message: format!("NPM proxy host {} deleted", id),
                resource_id: Some(id.to_string()),
            }
        }
        Err(e) => {
            error!("Failed to delete NPM proxy host {}: {e}", id);
            step_fail(
                "remove_npm_proxy_host",
                &format!("Failed to delete proxy host {}: {e}", id),
            )
        }
    }
}

async fn remove_firewall_rule(state: &AppState, resource: &RemoveResource) -> StepResult {
    let chain = match &resource.chain {
        Some(c) if !c.is_empty() => c.clone(),
        _ => {
            return step_fail("remove_firewall_rule", "Firewall chain path is required");
        }
    };

    let chain_parts: Vec<&str> = chain.split('.').collect();
    if chain_parts.len() != 3 {
        return step_fail(
            "remove_firewall_rule",
            "Invalid chain path — expected 3 parts like 'ipv4.forward.filter'",
        );
    }

    let client = match super::vyos::get_vyos_client_or_503(state).await {
        Ok(c) => c,
        Err(_) => {
            return step_fail("remove_firewall_rule", "VyOS router not configured");
        }
    };

    let path: Vec<&str> = vec![
        "firewall",
        chain_parts[0],
        chain_parts[1],
        chain_parts[2],
        "rule",
        &resource.resource_id,
    ];

    match client.configure_delete(&path).await {
        Ok(_) => {
            if let Err(e) = client.config_save().await {
                tracing::warn!("config-file save failed after service firewall rule delete: {e}");
            }
            info!(
                "VyOS firewall rule {} deleted from chain {}",
                resource.resource_id, chain
            );
            StepResult {
                step: "remove_firewall_rule".into(),
                success: true,
                message: format!(
                    "Firewall rule {} deleted from {}",
                    resource.resource_id, chain
                ),
                resource_id: Some(resource.resource_id.clone()),
            }
        }
        Err(e) => {
            error!("Failed to delete firewall rule: {e}");
            step_fail(
                "remove_firewall_rule",
                &format!(
                    "Failed to delete firewall rule {}: {e}",
                    resource.resource_id
                ),
            )
        }
    }
}

async fn remove_dnat_rule(state: &AppState, resource: &RemoveResource) -> StepResult {
    let client = match super::vyos::get_vyos_client_or_503(state).await {
        Ok(c) => c,
        Err(_) => {
            return step_fail("remove_dnat_rule", "VyOS router not configured");
        }
    };

    let path: Vec<&str> = vec!["nat", "destination", "rule", &resource.resource_id];

    match client.configure_delete(&path).await {
        Ok(_) => {
            if let Err(e) = client.config_save().await {
                tracing::warn!("config-file save failed after service DNAT rule delete: {e}");
            }
            info!("VyOS DNAT rule {} deleted", resource.resource_id);
            StepResult {
                step: "remove_dnat_rule".into(),
                success: true,
                message: format!("DNAT rule {} deleted", resource.resource_id),
                resource_id: Some(resource.resource_id.clone()),
            }
        }
        Err(e) => {
            error!("Failed to delete DNAT rule: {e}");
            step_fail(
                "remove_dnat_rule",
                &format!("Failed to delete DNAT rule {}: {e}", resource.resource_id),
            )
        }
    }
}

/// Build an [`NpmClient`] from current settings, or `None` if not configured.
async fn get_npm_client(state: &AppState) -> Option<NpmClient> {
    let url = get_setting(state, "npm_url").await?;
    let email = get_setting(state, "npm_email").await?;
    let password = get_setting(state, "npm_password").await?;

    Some(NpmClient::new(
        &url,
        &email,
        &password,
        state.npm_http.clone(),
    ))
}

/// Helper: read a string setting from the settings table.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

// ── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_scheme() {
        assert_eq!(default_scheme(), "http");
    }

    #[test]
    fn test_default_ssl_mode() {
        assert_eq!(default_ssl_mode(), "none");
    }

    #[test]
    fn test_step_fail() {
        let result = step_fail("test_step", "something went wrong");
        assert!(!result.success);
        assert_eq!(result.step, "test_step");
        assert_eq!(result.message, "something went wrong");
        assert!(result.resource_id.is_none());
    }

    #[test]
    fn test_add_service_request_deserialize() {
        let json = serde_json::json!({
            "name": "Test Service",
            "internal_ip": "192.168.1.100",
            "internal_port": 8080,
            "domain_names": ["test.example.com"],
            "ssl_mode": "letsencrypt",
            "letsencrypt_email": "admin@example.com",
            "create_firewall_rule": true,
            "firewall_chain": "ipv4.forward.filter",
            "firewall_rule_number": 100,
            "create_dnat_rule": true,
            "dnat_rule_number": 10,
            "dnat_external_port": 8080,
            "dnat_inbound_interface": "eth0",
        });

        let req: AddServiceRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.name, "Test Service");
        assert_eq!(req.internal_ip, "192.168.1.100");
        assert_eq!(req.internal_port, 8080);
        assert_eq!(req.forward_scheme, "http"); // default
        assert_eq!(req.ssl_mode, "letsencrypt");
        assert!(req.create_firewall_rule);
        assert_eq!(req.firewall_chain.as_deref(), Some("ipv4.forward.filter"));
        assert_eq!(req.firewall_rule_number, Some(100));
        assert!(req.create_dnat_rule);
        assert_eq!(req.dnat_rule_number, Some(10));
        assert_eq!(req.dnat_external_port, Some(8080));
    }

    #[test]
    fn test_remove_service_request_deserialize() {
        let json = serde_json::json!({
            "name": "Test Service",
            "resources": [
                {
                    "resource_type": "npm_proxy_host",
                    "resource_id": "42"
                },
                {
                    "resource_type": "firewall_rule",
                    "resource_id": "100",
                    "chain": "ipv4.forward.filter"
                },
                {
                    "resource_type": "dnat_rule",
                    "resource_id": "10"
                }
            ]
        });

        let req: RemoveServiceRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.name, "Test Service");
        assert_eq!(req.resources.len(), 3);
        assert_eq!(req.resources[0].resource_type, "npm_proxy_host");
        assert_eq!(req.resources[0].resource_id, "42");
        assert_eq!(req.resources[1].resource_type, "firewall_rule");
        assert_eq!(
            req.resources[1].chain.as_deref(),
            Some("ipv4.forward.filter")
        );
        assert_eq!(req.resources[2].resource_type, "dnat_rule");
    }
}
