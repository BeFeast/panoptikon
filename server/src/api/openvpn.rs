//! OpenVPN management API endpoints.
//!
//! Provides endpoints for managing OpenVPN server configuration on MikroTik,
//! PPP secrets (VPN user accounts), client config export, and PKI certificates.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::{OvpnServerConfigWriteRequest, PppSecretWriteRequest};

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

/// OpenVPN server configuration response.
#[derive(Debug, Serialize)]
pub struct OpenVpnServerResponse {
    pub enabled: bool,
    pub port: Option<u32>,
    pub protocol: Option<String>,
    pub mode: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: bool,
    pub netmask: Option<String>,
    pub tls_version: Option<String>,
}

/// OpenVPN client (PPP secret) response.
#[derive(Debug, Serialize)]
pub struct OpenVpnClientResponse {
    pub id: String,
    pub name: String,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

/// Active OpenVPN connection response.
#[derive(Debug, Serialize)]
pub struct OpenVpnActiveConnectionResponse {
    pub name: String,
    pub service: Option<String>,
    pub caller_id: Option<String>,
    pub address: Option<String>,
    pub uptime: Option<String>,
    pub encoding: Option<String>,
}

/// Complete OpenVPN management dashboard response.
#[derive(Debug, Serialize)]
pub struct OpenVpnDashboardResponse {
    pub mikrotik_available: bool,
    pub server: Option<OpenVpnServerResponse>,
    pub clients: Vec<OpenVpnClientResponse>,
    pub active_connections: Vec<OpenVpnActiveConnectionResponse>,
    pub server_interfaces: Vec<OpenVpnServerInterfaceResponse>,
}

/// OpenVPN server interface (active tunnel) response.
#[derive(Debug, Serialize)]
pub struct OpenVpnServerInterfaceResponse {
    pub id: Option<String>,
    pub name: String,
    pub user: Option<String>,
    pub running: bool,
    pub client_address: Option<String>,
    pub encoding: Option<String>,
    pub uptime: Option<String>,
}

/// MikroTik certificate response.
#[derive(Debug, Serialize)]
pub struct CertificateResponse {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub fingerprint: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub trusted: bool,
    pub key_type: Option<String>,
    pub issuer: Option<String>,
    pub serial_number: Option<String>,
    pub subject_alt_name: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub expires_after: Option<String>,
    pub has_private_key: bool,
    pub is_ca: bool,
}

/// Certificates dashboard response.
#[derive(Debug, Serialize)]
pub struct CertificatesDashboardResponse {
    pub mikrotik_available: bool,
    pub certificates: Vec<CertificateResponse>,
}

/// Client config export response.
#[derive(Debug, Serialize)]
pub struct ClientConfigExportResponse {
    pub config: String,
    pub filename: String,
}

// ── Request types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOpenVpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u32>,
    pub protocol: Option<String>,
    pub mode: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: Option<bool>,
    pub netmask: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOpenVpnClientRequest {
    pub name: String,
    pub password: String,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/dashboard
pub async fn dashboard(
    State(state): State<AppState>,
) -> Result<Json<OpenVpnDashboardResponse>, AppError> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(OpenVpnDashboardResponse {
                mikrotik_available: false,
                server: None,
                clients: Vec::new(),
                active_connections: Vec::new(),
                server_interfaces: Vec::new(),
            }));
        }
    };

    // Fetch all data concurrently
    let (server_cfg, secrets, active, interfaces) = tokio::join!(
        client.ovpn_server_config(),
        client.ppp_secrets(),
        client.ppp_active(),
        client.ovpn_server_interfaces(),
    );

    let server = server_cfg.ok().map(|cfg| {
        fn is_true(val: &Option<String>) -> bool {
            val.as_deref() == Some("true") || val.as_deref() == Some("yes")
        }
        OpenVpnServerResponse {
            enabled: is_true(&cfg.enabled),
            port: cfg.port.as_deref().and_then(|s| s.parse().ok()),
            protocol: cfg.protocol,
            mode: cfg.mode,
            cipher: cfg.cipher,
            auth: cfg.auth,
            certificate: cfg.certificate,
            default_profile: cfg.default_profile,
            require_client_certificate: is_true(&cfg.require_client_certificate),
            netmask: cfg.netmask,
            tls_version: cfg.tls_version,
        }
    });

    let clients = secrets
        .unwrap_or_default()
        .into_iter()
        .map(|s| OpenVpnClientResponse {
            id: s.id.unwrap_or_default(),
            name: s.name.unwrap_or_default(),
            service: s.service,
            profile: s.profile,
            local_address: s.local_address,
            remote_address: s.remote_address,
            disabled: s.disabled.as_deref() == Some("true"),
            comment: s.comment,
        })
        .collect();

    let active_connections = active
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a.service.as_deref() == Some("ovpn"))
        .map(|a| OpenVpnActiveConnectionResponse {
            name: a.name.unwrap_or_default(),
            service: a.service,
            caller_id: a.caller_id,
            address: a.address,
            uptime: a.uptime,
            encoding: a.encoding,
        })
        .collect();

    let server_interfaces = interfaces
        .unwrap_or_default()
        .into_iter()
        .map(|i| OpenVpnServerInterfaceResponse {
            id: i.id,
            name: i.name.unwrap_or_default(),
            user: i.user,
            running: i.running.as_deref() == Some("true"),
            client_address: i.client_address,
            encoding: i.encoding,
            uptime: i.uptime,
        })
        .collect();

    Ok(Json(OpenVpnDashboardResponse {
        mikrotik_available: true,
        server,
        clients,
        active_connections,
        server_interfaces,
    }))
}

/// GET /api/v1/openvpn/server
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OpenVpnServerResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    let cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch OpenVPN server config: {e}")))?;

    fn is_true(val: &Option<String>) -> bool {
        val.as_deref() == Some("true") || val.as_deref() == Some("yes")
    }

    Ok(Json(OpenVpnServerResponse {
        enabled: is_true(&cfg.enabled),
        port: cfg.port.as_deref().and_then(|s| s.parse().ok()),
        protocol: cfg.protocol,
        mode: cfg.mode,
        cipher: cfg.cipher,
        auth: cfg.auth,
        certificate: cfg.certificate,
        default_profile: cfg.default_profile,
        require_client_certificate: is_true(&cfg.require_client_certificate),
        netmask: cfg.netmask,
        tls_version: cfg.tls_version,
    }))
}

/// PATCH /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOpenVpnServerRequest>,
) -> Result<StatusCode, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    let req = OvpnServerConfigWriteRequest {
        enabled: body
            .enabled
            .map(|b| if b { "true" } else { "false" }.to_string()),
        port: body.port.map(|p| p.to_string()),
        protocol: body.protocol,
        mode: body.mode,
        cipher: body.cipher,
        auth: body.auth,
        certificate: body.certificate,
        default_profile: body.default_profile,
        netmask: body.netmask,
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "yes" } else { "no" }.to_string()),
    };

    client
        .update_ovpn_server_config(&req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OpenVPN server config: {e}")))?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/clients
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<OpenVpnClientResponse>>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    let secrets = client
        .ppp_secrets()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch PPP secrets: {e}")))?;

    let clients = secrets
        .into_iter()
        .map(|s| OpenVpnClientResponse {
            id: s.id.unwrap_or_default(),
            name: s.name.unwrap_or_default(),
            service: s.service,
            profile: s.profile,
            local_address: s.local_address,
            remote_address: s.remote_address,
            disabled: s.disabled.as_deref() == Some("true"),
            comment: s.comment,
        })
        .collect();

    Ok(Json(clients))
}

/// POST /api/v1/openvpn/clients
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<CreateOpenVpnClientRequest>,
) -> Result<StatusCode, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    let req = PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: body.service.or(Some("ovpn".to_string())),
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
    };

    client
        .create_ppp_secret(&req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create OpenVPN client: {e}")))?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/openvpn/clients/:id
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete OpenVPN client: {e}")))?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/clients/:name/export
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<ClientConfigExportResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable(
            "MikroTik not configured".into(),
        ))?;

    // Get server config for connection details
    let server_cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch server config: {e}")))?;

    // Get router IP from settings for remote address
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

    let port = server_cfg
        .port
        .as_deref()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1194);
    let proto = server_cfg.protocol.as_deref().unwrap_or("tcp");
    let cipher = server_cfg.cipher.as_deref().unwrap_or("AES-256-CBC");
    let auth = server_cfg.auth.as_deref().unwrap_or("SHA1");

    let config = format!(
        r#"client
dev tun
proto {proto}
remote {router_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {cipher}
auth {auth}
verb 3
auth-user-pass
# Paste CA certificate below or provide as a separate file
# <ca>
# -----BEGIN CERTIFICATE-----
# (paste your CA certificate here)
# -----END CERTIFICATE-----
# </ca>
"#,
    );

    Ok(Json(ClientConfigExportResponse {
        config,
        filename: format!("{name}.ovpn"),
    }))
}

/// GET /api/v1/certificates
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<CertificatesDashboardResponse>, AppError> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(CertificatesDashboardResponse {
                mikrotik_available: false,
                certificates: Vec::new(),
            }));
        }
    };

    let certs = client.certificates().await.unwrap_or_default();

    let certificates = certs
        .into_iter()
        .map(|c| {
            fn is_true(val: &Option<String>) -> bool {
                val.as_deref() == Some("true") || val.as_deref() == Some("yes")
            }
            CertificateResponse {
                id: c.id.unwrap_or_default(),
                name: c.name.unwrap_or_default(),
                common_name: c.common_name,
                fingerprint: c.fingerprint,
                key_size: c.key_size,
                days_valid: c.days_valid,
                trusted: is_true(&c.trusted),
                key_type: c.key_type,
                issuer: c.issuer,
                serial_number: c.serial_number,
                subject_alt_name: c.subject_alt_name,
                invalid_before: c.invalid_before,
                invalid_after: c.invalid_after,
                expires_after: c.expires_after,
                has_private_key: is_true(&c.private_key),
                is_ca: is_true(&c.ca) || is_true(&c.authority),
            }
        })
        .collect();

    Ok(Json(CertificatesDashboardResponse {
        mikrotik_available: true,
        certificates,
    }))
}
