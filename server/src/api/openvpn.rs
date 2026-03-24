//! OpenVPN management API endpoints for MikroTik routers.
//!
//! Provides server configuration, certificate listing, client export,
//! and connected-client status via the MikroTik REST API.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::OvpnServerConfigWriteRequest;

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

// ── Response types ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OvpnServerStatusResponse {
    pub enabled: bool,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub require_client_certificate: bool,
    pub netmask: Option<String>,
    pub default_profile: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnInterfaceResponse {
    pub id: String,
    pub name: String,
    pub user: Option<String>,
    pub mac_address: Option<String>,
    pub running: bool,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CertificateResponse {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub issuer: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub expired: bool,
    pub trusted: bool,
    pub ca: bool,
    pub fingerprint: Option<String>,
    pub has_private_key: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientConfigResponse {
    pub config: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct OvpnConnectedClient {
    pub id: String,
    pub name: String,
    pub service: Option<String>,
    pub caller_id: Option<String>,
    pub address: Option<String>,
    pub uptime: Option<String>,
    pub encoding: Option<String>,
}

// ── Request types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub require_client_certificate: Option<bool>,
    pub netmask: Option<String>,
    pub default_profile: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportClientConfigRequest {
    pub server_address: String,
    pub username: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true") || val.as_deref() == Some("yes")
}

/// GET /api/v1/openvpn/server
pub async fn server_config(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerStatusResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to fetch OpenVPN server config: {e}")))?;

    Ok(Json(OvpnServerStatusResponse {
        enabled: is_true(&cfg.enabled),
        port: cfg.port.as_deref().and_then(|s| s.parse().ok()),
        mode: cfg.mode,
        protocol: cfg.protocol,
        cipher: cfg.cipher,
        auth: cfg.auth,
        certificate: cfg.certificate,
        require_client_certificate: is_true(&cfg.require_client_certificate),
        netmask: cfg.netmask,
        default_profile: cfg.default_profile,
    }))
}

/// PATCH /api/v1/openvpn/server
pub async fn update_server_config(
    State(state): State<AppState>,
    Json(req): Json<UpdateOvpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let write_req = OvpnServerConfigWriteRequest {
        enabled: req.enabled.map(|b| if b { "true" } else { "false" }.into()),
        port: req.port.map(|p| p.to_string()),
        mode: req.mode,
        default_profile: req.default_profile,
        certificate: req.certificate,
        require_client_certificate: req
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.into()),
        auth: req.auth,
        cipher: req.cipher,
        protocol: req.protocol,
        netmask: req.netmask,
    };

    client
        .update_ovpn_server_config(&write_req)
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to update OpenVPN config: {e}")))?;

    // Invalidate cache
    state.mikrotik_cache.clear();

    Ok(Json(
        serde_json::json!({"status": "ok", "message": "OpenVPN server configuration updated"}),
    ))
}

/// GET /api/v1/openvpn/interfaces
pub async fn interfaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<OvpnInterfaceResponse>>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let ifaces = client
        .ovpn_server_interfaces()
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to fetch OpenVPN interfaces: {e}")))?;

    let result: Vec<OvpnInterfaceResponse> = ifaces
        .into_iter()
        .map(|i| OvpnInterfaceResponse {
            id: i.id.unwrap_or_default(),
            name: i.name.unwrap_or_default(),
            user: i.user,
            mac_address: i.mac_address,
            running: is_true(&i.running),
            disabled: is_true(&i.disabled),
            comment: i.comment,
        })
        .collect();

    Ok(Json(result))
}

/// GET /api/v1/openvpn/certificates
pub async fn certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<CertificateResponse>>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let certs = client
        .certificates()
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to fetch certificates: {e}")))?;

    let result: Vec<CertificateResponse> = certs
        .into_iter()
        .map(|c| CertificateResponse {
            id: c.id.unwrap_or_default(),
            name: c.name.clone().unwrap_or_default(),
            common_name: c.common_name,
            issuer: c.issuer,
            key_size: c.key_size,
            days_valid: c.days_valid,
            invalid_before: c.invalid_before,
            invalid_after: c.invalid_after,
            expired: is_true(&c.expired),
            trusted: is_true(&c.trusted),
            ca: is_true(&c.ca) || is_true(&c.authority),
            fingerprint: c.fingerprint,
            has_private_key: is_true(&c.private_key),
        })
        .collect();

    Ok(Json(result))
}

/// GET /api/v1/openvpn/clients
pub async fn connected_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<OvpnConnectedClient>>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let active = client
        .ppp_active()
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to fetch active connections: {e}")))?;

    // Filter to ovpn service only
    let result: Vec<OvpnConnectedClient> = active
        .into_iter()
        .filter(|a| a.service.as_deref() == Some("ovpn"))
        .map(|a| OvpnConnectedClient {
            id: a.id.unwrap_or_default(),
            name: a.name.unwrap_or_default(),
            service: a.service,
            caller_id: a.caller_id,
            address: a.address,
            uptime: a.uptime,
            encoding: a.encoding,
        })
        .collect();

    Ok(Json(result))
}

/// POST /api/v1/openvpn/export-client-config
pub async fn export_client_config(
    State(state): State<AppState>,
    Json(req): Json<ExportClientConfigRequest>,
) -> Result<Json<OvpnClientConfigResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to fetch server config: {e}")))?;

    let port = cfg.port.as_deref().unwrap_or("1194");
    let proto = match cfg.protocol.as_deref() {
        Some("udp") => "udp",
        _ => "tcp",
    };
    let cipher = cfg.cipher.as_deref().unwrap_or("aes256-cbc");
    let auth = cfg.auth.as_deref().unwrap_or("sha1");

    let username = req.username.as_deref().unwrap_or("client");

    let config = format!(
        r#"# OpenVPN Client Configuration
# Generated by Panoptikon
client
dev tun
proto {proto}
remote {server} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
auth {auth}
cipher {cipher}
verb 3
auth-user-pass
# Paste CA certificate below or use ca ca.crt
# <ca>
# </ca>
"#,
        server = req.server_address,
    );

    let filename = format!("{username}-{}.ovpn", req.server_address.replace('.', "-"));

    Ok(Json(OvpnClientConfigResponse { config, filename }))
}
