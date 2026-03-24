//! OpenVPN management API endpoints.
//!
//! Provides endpoints for managing OpenVPN server configuration on MikroTik,
//! PPP client/secret management, and client config export.

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, Response},
    Json,
};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::*;

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

async fn mikrotik_client(state: &AppState) -> Result<MikrotikClient, AppError> {
    let enabled = get_setting(state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return Err(AppError::Validation(
            "MikroTik integration is not enabled".to_string(),
        ));
    }

    let url = get_setting(state, "mikrotik_url")
        .await
        .ok_or_else(|| AppError::Validation("MikroTik URL not configured".to_string()))?;
    let user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    Ok(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        state.mikrotik_http.clone(),
    ))
}

// ── Response types ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OvpnServerResponse {
    pub enabled: bool,
    pub port: Option<u16>,
    pub protocol: Option<String>,
    pub mode: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientEntry {
    pub id: String,
    pub name: String,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnActiveConnection {
    pub name: String,
    pub caller_id: Option<String>,
    pub address: Option<String>,
    pub uptime: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnOverview {
    pub server: OvpnServerResponse,
    pub clients: Vec<OvpnClientEntry>,
    pub active_connections: Vec<OvpnActiveConnection>,
    pub certificates: Vec<CertificateEntry>,
}

#[derive(Debug, Serialize)]
pub struct CertificateEntry {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub fingerprint: Option<String>,
    pub expires: Option<String>,
    pub expired: bool,
    pub is_ca: bool,
    pub has_private_key: bool,
}

// ── Request types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub protocol: Option<String>,
    pub mode: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOvpnClientRequest {
    pub name: String,
    pub password: String,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/overview
pub async fn overview(State(state): State<AppState>) -> Result<Json<OvpnOverview>, AppError> {
    let client = mikrotik_client(&state).await?;

    let server_cfg = client.ovpn_server_config().await.map_err(|e| {
        tracing::warn!("Failed to fetch OVPN server config: {e}");
        AppError::Internal(e.to_string())
    })?;

    let secrets = client.ppp_secrets().await.unwrap_or_default();
    let active = client.ppp_active().await.unwrap_or_default();
    let certs = client.certificates().await.unwrap_or_default();

    fn is_true(val: &Option<String>) -> bool {
        val.as_deref() == Some("true") || val.as_deref() == Some("yes")
    }

    let server = OvpnServerResponse {
        enabled: is_true(&server_cfg.enabled),
        port: server_cfg.port.as_deref().and_then(|s| s.parse().ok()),
        protocol: server_cfg.protocol.clone(),
        mode: server_cfg.mode.clone(),
        cipher: server_cfg.cipher.clone(),
        auth: server_cfg.auth.clone(),
        certificate: server_cfg.certificate.clone(),
        default_profile: server_cfg.default_profile.clone(),
        require_client_certificate: is_true(&server_cfg.require_client_certificate),
    };

    let clients: Vec<OvpnClientEntry> = secrets
        .into_iter()
        .filter(|s| {
            s.service.as_deref() == Some("ovpn")
                || s.service.as_deref() == Some("any")
                || s.service.is_none()
        })
        .map(|s| OvpnClientEntry {
            id: s.id.unwrap_or_default(),
            name: s.name.unwrap_or_default(),
            service: s.service,
            profile: s.profile,
            local_address: s.local_address,
            remote_address: s.remote_address,
            comment: s.comment,
            disabled: is_true(&s.disabled),
        })
        .collect();

    let active_connections: Vec<OvpnActiveConnection> = active
        .into_iter()
        .filter(|a| a.service.as_deref() == Some("ovpn"))
        .map(|a| OvpnActiveConnection {
            name: a.name.unwrap_or_default(),
            caller_id: a.caller_id,
            address: a.address,
            uptime: a.uptime,
            encoding: a.encoding,
        })
        .collect();

    let certificates: Vec<CertificateEntry> = certs
        .into_iter()
        .map(|c| CertificateEntry {
            id: c.id.unwrap_or_default(),
            name: c.name.unwrap_or_default(),
            common_name: c.common_name,
            fingerprint: c.fingerprint,
            expires: c.invalid_after,
            expired: is_true(&c.expired),
            is_ca: is_true(&c.authority) || is_true(&c.ca),
            has_private_key: is_true(&c.private_key),
        })
        .collect();

    Ok(Json(OvpnOverview {
        server,
        clients,
        active_connections,
        certificates,
    }))
}

/// PUT /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(req): Json<UpdateOvpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;

    let write_req = OvpnServerWriteRequest {
        enabled: req
            .enabled
            .map(|b| if b { "true" } else { "false" }.to_string()),
        port: req.port.map(|p| p.to_string()),
        default_profile: req.default_profile,
        certificate: req.certificate,
        auth: req.auth,
        cipher: req.cipher,
        mode: req.mode,
        protocol: req.protocol,
        require_client_certificate: req
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.to_string()),
    };

    client
        .update_ovpn_server_config(&write_req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OVPN server: {e}")))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/v1/openvpn/clients
pub async fn create_client(
    State(state): State<AppState>,
    Json(req): Json<CreateOvpnClientRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;

    let write_req = PppSecretWriteRequest {
        name: req.name,
        password: req.password,
        service: Some("ovpn".to_string()),
        profile: req.profile,
        local_address: req.local_address,
        remote_address: req.remote_address,
        comment: req.comment,
    };

    client
        .create_ppp_secret(&write_req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/v1/openvpn/clients/:id
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;

    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/v1/openvpn/export/:name
///
/// Generates and returns an OpenVPN client configuration file (.ovpn).
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Response<Body>, AppError> {
    let client = mikrotik_client(&state).await?;

    // Fetch server config for port/protocol
    let server_cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch OVPN server config: {e}")))?;

    // Get the router's external address from settings
    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    let router_host = router_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split(':')
        .next()
        .unwrap_or("router.example.com")
        .to_string();

    let port = server_cfg.port.as_deref().unwrap_or("1194");
    let proto = match server_cfg.protocol.as_deref() {
        Some("udp") => "udp",
        _ => "tcp-client",
    };

    let config = format!(
        r#"client
dev tun
proto {proto}
remote {router_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
verb 3

# Authentication
auth-user-pass

# User: {name}
# Generated by Panoptikon
"#
    );

    let filename = format!("{name}.ovpn");

    Response::builder()
        .header(header::CONTENT_TYPE, "application/x-openvpn-profile")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .body(Body::from(config))
        .map_err(|e| AppError::Internal(e.to_string()))
}
