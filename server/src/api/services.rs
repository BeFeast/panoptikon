//! Unified "Add Service" and "Remove Service" wizard API.
//!
//! Orchestrates creating/removing Caddy proxy hosts and MikroTik
//! port-forward (dst-nat) rules in a single API call with per-step
//! status reporting.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::audit;
use super::AppState;

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

    // ── Caddy Proxy Host ──
    /// Domain name for the Caddy reverse proxy entry.
    pub domain: Option<String>,
    /// Enable automatic TLS (HTTPS) via Caddy.
    #[serde(default)]
    pub tls_enabled: bool,

    // ── MikroTik Port-Forward (dst-nat) Rule (optional) ──
    /// If true, create a MikroTik dst-nat rule for port forwarding.
    #[serde(default)]
    pub create_port_forward: bool,
    /// External (public) port for the port-forward rule.
    pub external_port: Option<u16>,
    /// Protocol for the port-forward rule (default: "tcp").
    pub protocol: Option<String>,
    /// Comment for the MikroTik rule.
    pub mikrotik_comment: Option<String>,
}

fn default_scheme() -> String {
    "http".to_string()
}

/// Per-step result in the wizard response.
#[derive(Debug, Serialize, Clone)]
pub struct StepResult {
    pub step: String,
    pub success: bool,
    pub message: String,
    /// Resource ID created (e.g. Caddy proxy host UUID, MikroTik rule ID).
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
    let has_caddy = body.domain.as_ref().is_some_and(|d| !d.is_empty());
    let has_pf = body.create_port_forward;

    if !has_caddy && !has_pf {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "At least one operation must be requested (Caddy proxy host or MikroTik port-forward)"
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

    // ── Step 1: Create Caddy Proxy Host ──
    if has_caddy {
        let result = create_caddy_proxy_step(&state, &body).await;
        if !result.success {
            all_ok = false;
        }
        steps.push(result);
    }

    // ── Step 2: Create MikroTik Port-Forward (dst-nat) Rule ──
    if has_pf {
        let result = create_mikrotik_nat_step(&state, &body).await;
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

/// Create a Caddy proxy host in SQLite, then sync to Caddy.
async fn create_caddy_proxy_step(state: &AppState, body: &AddServiceRequest) -> StepResult {
    let domain = match &body.domain {
        Some(d) if !d.is_empty() => d.clone(),
        _ => {
            return StepResult {
                step: "caddy_proxy_host".into(),
                success: false,
                message: "No domain provided".into(),
                resource_id: None,
            };
        }
    };

    let id = uuid::Uuid::new_v4().to_string();

    let insert_result = sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, forward_host, forward_port, forward_scheme, tls_enabled) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&domain)
    .bind(&body.internal_ip)
    .bind(body.internal_port as i32)
    .bind(&body.forward_scheme)
    .bind(body.tls_enabled as i32)
    .execute(&state.db)
    .await;

    match insert_result {
        Ok(_) => {
            // Sync to Caddy after insert
            super::caddy::sync_to_caddy(state).await;

            info!(
                "Caddy proxy host created: {} → {}:{}",
                domain, body.internal_ip, body.internal_port
            );
            StepResult {
                step: "caddy_proxy_host".into(),
                success: true,
                message: format!(
                    "Proxy host created — {} → {}:{}",
                    domain, body.internal_ip, body.internal_port
                ),
                resource_id: Some(id),
            }
        }
        Err(e) => {
            error!("Failed to create Caddy proxy host: {e}");
            StepResult {
                step: "caddy_proxy_host".into(),
                success: false,
                message: format!("Failed to create proxy host: {e}"),
                resource_id: None,
            }
        }
    }
}

/// Create a MikroTik dst-nat rule for port forwarding.
async fn create_mikrotik_nat_step(state: &AppState, body: &AddServiceRequest) -> StepResult {
    let external_port = match body.external_port {
        Some(p) if p > 0 => p,
        _ => {
            return step_fail(
                "mikrotik_port_forward",
                "External port is required for port forwarding",
            );
        }
    };

    let protocol = body.protocol.as_deref().unwrap_or("tcp");
    let comment = body.mikrotik_comment.as_deref().unwrap_or("").to_string();
    let comment = if comment.is_empty() {
        format!(
            "Panoptikon: {} port {} → {}:{}",
            body.name, external_port, body.internal_ip, body.internal_port
        )
    } else {
        comment
    };

    // Get MikroTik credentials from settings
    let mt_url = match get_setting(state, "mikrotik_url").await {
        Some(u) => u,
        None => {
            return step_fail(
                "mikrotik_port_forward",
                "MikroTik not configured — check Settings",
            );
        }
    };
    let mt_user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let mt_pass = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    let url = format!("{}/rest/ip/firewall/nat/add", mt_url.trim_end_matches('/'));

    let nat_body = serde_json::json!({
        "chain": "dstnat",
        "action": "dst-nat",
        "protocol": protocol,
        "dst-port": external_port.to_string(),
        "to-addresses": body.internal_ip,
        "to-ports": body.internal_port.to_string(),
        "comment": comment,
    });

    match state
        .mikrotik_http
        .put(&url)
        .basic_auth(&mt_user, Some(&mt_pass))
        .json(&nat_body)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            // Try to get the created rule ID from the response
            let rule_id = resp
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|v| v.get("ret").and_then(|r| r.as_str()).map(String::from))
                .unwrap_or_default();

            info!(
                "MikroTik dst-nat rule created: port {} → {}:{}",
                external_port, body.internal_ip, body.internal_port
            );

            StepResult {
                step: "mikrotik_port_forward".into(),
                success: true,
                message: format!(
                    "Port-forward created — {} port {} → {}:{}",
                    protocol, external_port, body.internal_ip, body.internal_port
                ),
                resource_id: if rule_id.is_empty() {
                    None
                } else {
                    Some(rule_id)
                },
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            error!("MikroTik dst-nat create failed: HTTP {status} — {body_text}");
            step_fail(
                "mikrotik_port_forward",
                &format!("MikroTik API error: HTTP {status} — {body_text}"),
            )
        }
        Err(e) => {
            error!("MikroTik dst-nat request failed: {e}");
            step_fail(
                "mikrotik_port_forward",
                &format!("Failed to reach MikroTik: {e}"),
            )
        }
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
    /// "caddy_proxy_host" or "mikrotik_port_forward"
    pub resource_type: String,
    /// For caddy_proxy_host: the UUID.
    /// For mikrotik_port_forward: the MikroTik rule ID (e.g. "*A").
    pub resource_id: String,
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
            "caddy_proxy_host" => remove_caddy_proxy_host(&state, resource).await,
            "mikrotik_port_forward" => remove_mikrotik_nat_rule(&state, resource).await,
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

async fn remove_caddy_proxy_host(state: &AppState, resource: &RemoveResource) -> StepResult {
    let affected = sqlx::query("DELETE FROM caddy_proxy_hosts WHERE id = ?")
        .bind(&resource.resource_id)
        .execute(&state.db)
        .await;

    match affected {
        Ok(result) if result.rows_affected() > 0 => {
            super::caddy::sync_to_caddy(state).await;
            info!("Caddy proxy host {} deleted", resource.resource_id);
            StepResult {
                step: "remove_caddy_proxy_host".into(),
                success: true,
                message: format!("Caddy proxy host {} deleted", resource.resource_id),
                resource_id: Some(resource.resource_id.clone()),
            }
        }
        Ok(_) => step_fail(
            "remove_caddy_proxy_host",
            &format!("Caddy proxy host {} not found", resource.resource_id),
        ),
        Err(e) => {
            error!("Failed to delete Caddy proxy host: {e}");
            step_fail(
                "remove_caddy_proxy_host",
                &format!("Failed to delete proxy host {}: {e}", resource.resource_id),
            )
        }
    }
}

async fn remove_mikrotik_nat_rule(state: &AppState, resource: &RemoveResource) -> StepResult {
    let mt_url = match get_setting(state, "mikrotik_url").await {
        Some(u) => u,
        None => {
            return step_fail("remove_mikrotik_port_forward", "MikroTik not configured");
        }
    };
    let mt_user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let mt_pass = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    let url = format!(
        "{}/rest/ip/firewall/nat/{}",
        mt_url.trim_end_matches('/'),
        resource.resource_id
    );

    match state
        .mikrotik_http
        .delete(&url)
        .basic_auth(&mt_user, Some(&mt_pass))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            info!("MikroTik NAT rule {} deleted", resource.resource_id);
            StepResult {
                step: "remove_mikrotik_port_forward".into(),
                success: true,
                message: format!("MikroTik NAT rule {} deleted", resource.resource_id),
                resource_id: Some(resource.resource_id.clone()),
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            step_fail(
                "remove_mikrotik_port_forward",
                &format!(
                    "Failed to delete MikroTik NAT rule {}: HTTP {status} — {body}",
                    resource.resource_id
                ),
            )
        }
        Err(e) => {
            error!("Failed to delete MikroTik NAT rule: {e}");
            step_fail(
                "remove_mikrotik_port_forward",
                &format!(
                    "Failed to reach MikroTik to delete rule {}: {e}",
                    resource.resource_id
                ),
            )
        }
    }
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
            "domain": "test.oklabs.uk",
            "tls_enabled": true,
            "create_port_forward": true,
            "external_port": 8080,
            "protocol": "tcp",
        });

        let req: AddServiceRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.name, "Test Service");
        assert_eq!(req.internal_ip, "192.168.1.100");
        assert_eq!(req.internal_port, 8080);
        assert_eq!(req.forward_scheme, "http"); // default
        assert_eq!(req.domain.as_deref(), Some("test.oklabs.uk"));
        assert!(req.tls_enabled);
        assert!(req.create_port_forward);
        assert_eq!(req.external_port, Some(8080));
    }

    #[test]
    fn test_remove_service_request_deserialize() {
        let json = serde_json::json!({
            "name": "Test Service",
            "resources": [
                {
                    "resource_type": "caddy_proxy_host",
                    "resource_id": "abc-123-uuid"
                },
                {
                    "resource_type": "mikrotik_port_forward",
                    "resource_id": "*A"
                }
            ]
        });

        let req: RemoveServiceRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.name, "Test Service");
        assert_eq!(req.resources.len(), 2);
        assert_eq!(req.resources[0].resource_type, "caddy_proxy_host");
        assert_eq!(req.resources[0].resource_id, "abc-123-uuid");
        assert_eq!(req.resources[1].resource_type, "mikrotik_port_forward");
        assert_eq!(req.resources[1].resource_id, "*A");
    }
}
