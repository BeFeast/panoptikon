//! OpenVPN management API endpoints.
//!
//! Provides server configuration, client (PPP secret) management,
//! certificate listing, and client config export via MikroTik REST API.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::PppSecretWriteRequest;

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

// ── Response types ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OvpnServerResponse {
    pub available: bool,
    pub enabled: bool,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: bool,
    pub redirect_gateway: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientEntry {
    pub id: String,
    pub name: String,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientsResponse {
    pub available: bool,
    pub clients: Vec<OvpnClientEntry>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOvpnClientRequest {
    pub name: String,
    pub password: String,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnExportResponse {
    pub config: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct MtCertificateEntry {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub key_type: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub trusted: bool,
    pub ca: bool,
    pub issuer: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub has_private_key: bool,
    pub expired: bool,
    pub fingerprint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CertificatesResponse {
    pub available: bool,
    pub certificates: Vec<MtCertificateEntry>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/server — Fetch OpenVPN server configuration.
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, StatusCode> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(OvpnServerResponse {
                available: false,
                enabled: false,
                port: None,
                mode: None,
                protocol: None,
                certificate: None,
                cipher: None,
                auth: None,
                default_profile: None,
                require_client_certificate: false,
                redirect_gateway: None,
            }));
        }
    };

    let config = client
        .ovpn_server_config()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    fn is_true(val: &Option<String>) -> bool {
        val.as_deref() == Some("true") || val.as_deref() == Some("yes")
    }

    Ok(Json(OvpnServerResponse {
        available: true,
        enabled: is_true(&config.enabled),
        port: config.port.as_deref().and_then(|s| s.parse().ok()),
        mode: config.mode,
        protocol: config.protocol,
        certificate: config.certificate,
        cipher: config.cipher,
        auth: config.auth,
        default_profile: config.default_profile,
        require_client_certificate: is_true(&config.require_client_certificate),
        redirect_gateway: config.redirect_gateway,
    }))
}

/// GET /api/v1/openvpn/clients — List PPP secrets (VPN users).
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<OvpnClientsResponse>, StatusCode> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(OvpnClientsResponse {
                available: false,
                clients: vec![],
            }));
        }
    };

    let secrets = client
        .ppp_secrets()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let clients = secrets
        .into_iter()
        .map(|s| {
            let disabled = s.disabled.as_deref() == Some("true");
            OvpnClientEntry {
                id: s.id.unwrap_or_default(),
                name: s.name.unwrap_or_default(),
                service: s.service,
                profile: s.profile,
                local_address: s.local_address,
                remote_address: s.remote_address,
                disabled,
                comment: s.comment,
            }
        })
        .collect();

    Ok(Json(OvpnClientsResponse {
        available: true,
        clients,
    }))
}

/// POST /api/v1/openvpn/clients — Create a new PPP secret.
pub async fn create_client(
    State(state): State<AppState>,
    Json(req): Json<CreateOvpnClientRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::BAD_GATEWAY)?;

    let write_req = PppSecretWriteRequest {
        name: req.name,
        password: req.password,
        service: req.service.or(Some("ovpn".to_string())),
        profile: req.profile,
        local_address: req.local_address,
        remote_address: req.remote_address,
        comment: req.comment,
    };

    client
        .create_ppp_secret(&write_req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/openvpn/clients/:id — Delete a PPP secret.
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::BAD_GATEWAY)?;

    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/export/:name — Generate an OpenVPN client config.
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<OvpnExportResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::BAD_GATEWAY)?;

    let config = client
        .ovpn_server_config()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    // Build the router address from settings
    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    // Extract hostname from URL (e.g., "https://10.0.0.1:443" -> "10.0.0.1")
    let router_host = router_url
        .replace("https://", "")
        .replace("http://", "")
        .split(':')
        .next()
        .unwrap_or("ROUTER_IP")
        .to_string();

    let port = config.port.as_deref().unwrap_or("1194").to_string();
    let proto = match config.protocol.as_deref() {
        Some("udp") => "udp",
        _ => "tcp-client",
    };
    let cipher = config.cipher.as_deref().unwrap_or("aes256-cbc");
    let auth = config.auth.as_deref().unwrap_or("sha1");

    let ovpn_config = format!(
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
auth-user-pass
verb 3
# Add your CA certificate below:
# <ca>
# -----BEGIN CERTIFICATE-----
# ... paste CA certificate here ...
# -----END CERTIFICATE-----
# </ca>
"#
    );

    Ok(Json(OvpnExportResponse {
        config: ovpn_config,
        filename: format!("{name}.ovpn"),
    }))
}

/// GET /api/v1/certificates — List MikroTik certificates.
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<CertificatesResponse>, StatusCode> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(CertificatesResponse {
                available: false,
                certificates: vec![],
            }));
        }
    };

    let certs = client
        .certificates()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let entries = certs
        .into_iter()
        .map(|c| {
            fn is_true(val: &Option<String>) -> bool {
                val.as_deref() == Some("true") || val.as_deref() == Some("yes")
            }
            MtCertificateEntry {
                id: c.id.unwrap_or_default(),
                name: c.name.unwrap_or_default(),
                common_name: c.common_name,
                key_type: c.key_type,
                key_size: c.key_size,
                days_valid: c.days_valid,
                trusted: is_true(&c.trusted),
                ca: is_true(&c.ca) || is_true(&c.authority),
                issuer: c.issuer,
                invalid_before: c.invalid_before,
                invalid_after: c.invalid_after,
                has_private_key: is_true(&c.private_key),
                expired: is_true(&c.expired),
                fingerprint: c.fingerprint,
            }
        })
        .collect();

    Ok(Json(CertificatesResponse {
        available: true,
        certificates: entries,
    }))
}
