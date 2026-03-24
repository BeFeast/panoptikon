//! OpenVPN management API endpoints.
//!
//! Manages OpenVPN server configuration on MikroTik routers,
//! PPP client accounts, client config export, and certificate listing.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::{OvpnServerWriteRequest, PppSecretWriteRequest};

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

// ── Response types ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OvpnServerResponse {
    pub enabled: bool,
    pub port: Option<u16>,
    pub default_profile: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub require_client_certificate: bool,
    pub mode: Option<String>,
    pub netmask: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientAccount {
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
    pub id: String,
    pub name: String,
    pub user: Option<String>,
    pub client_address: Option<String>,
    pub encoding: Option<String>,
    pub uptime: Option<String>,
    pub running: bool,
}

#[derive(Debug, Serialize)]
pub struct MtCertificateResponse {
    pub id: String,
    pub name: Option<String>,
    pub common_name: Option<String>,
    pub key_type: Option<String>,
    pub key_size: Option<String>,
    pub fingerprint: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub has_private_key: bool,
    pub ca: bool,
    pub trusted: bool,
    pub expired: bool,
    pub authority: bool,
    pub subject_alt_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientConfigResponse {
    pub config: String,
    pub filename: String,
}

// ── Request types ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub default_profile: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub require_client_certificate: Option<bool>,
    pub mode: Option<String>,
    pub netmask: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePppSecretRequest {
    pub name: String,
    pub password: Option<String>,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
}

// ── Helpers ────────────────────────────────────────────────

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

// ── Handlers ───────────────────────────────────────────────

/// GET /api/v1/openvpn/server
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let srv = client
        .ovpn_server()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(Json(OvpnServerResponse {
        enabled: is_true(&srv.enabled),
        port: srv.port.and_then(|p| p.parse().ok()),
        default_profile: srv.default_profile,
        protocol: srv.protocol,
        cipher: srv.cipher,
        auth: srv.auth,
        certificate: srv.certificate,
        require_client_certificate: is_true(&srv.require_client_certificate),
        mode: srv.mode,
        netmask: srv.netmask,
    }))
}

/// PATCH /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOvpnServerRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = OvpnServerWriteRequest {
        enabled: body
            .enabled
            .map(|b| if b { "true" } else { "false" }.into()),
        port: body.port.map(|p| p.to_string()),
        default_profile: body.default_profile,
        protocol: body.protocol,
        cipher: body.cipher,
        auth: body.auth,
        certificate: body.certificate,
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.into()),
        mode: body.mode,
        netmask: body.netmask,
    };

    client
        .update_ovpn_server(&req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/clients — list PPP secrets (client accounts)
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<OvpnClientAccount>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let secrets = client
        .ppp_secrets()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let accounts: Vec<OvpnClientAccount> = secrets
        .into_iter()
        .map(|s| OvpnClientAccount {
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

    Ok(Json(accounts))
}

/// POST /api/v1/openvpn/clients — create a PPP secret
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<CreatePppSecretRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: body.service,
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
        disabled: None,
    };

    client
        .create_ppp_secret(&req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/openvpn/clients/:id — delete a PPP secret
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/active — active OpenVPN connections
pub async fn active_connections(
    State(state): State<AppState>,
) -> Result<Json<Vec<OvpnActiveConnection>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let ifaces = client
        .ovpn_server_interfaces()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let conns: Vec<OvpnActiveConnection> = ifaces
        .into_iter()
        .map(|c| OvpnActiveConnection {
            id: c.id.unwrap_or_default(),
            name: c.name.unwrap_or_default(),
            user: c.user,
            client_address: c.client_address,
            encoding: c.encoding,
            uptime: c.uptime,
            running: is_true(&c.running),
        })
        .collect();

    Ok(Json(conns))
}

/// GET /api/v1/openvpn/certificates — list MikroTik certificates
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<MtCertificateResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let certs = client
        .certificates()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let result: Vec<MtCertificateResponse> = certs
        .into_iter()
        .map(|c| MtCertificateResponse {
            id: c.id.unwrap_or_default(),
            name: c.name.clone(),
            common_name: c.common_name,
            key_type: c.key_type,
            key_size: c.key_size,
            fingerprint: c.fingerprint,
            invalid_before: c.invalid_before,
            invalid_after: c.invalid_after,
            has_private_key: is_true(&c.private_key),
            ca: is_true(&c.ca),
            trusted: is_true(&c.trusted),
            expired: is_true(&c.expired),
            authority: is_true(&c.authority),
            subject_alt_name: c.subject_alt_name,
        })
        .collect();

    Ok(Json(result))
}

/// GET /api/v1/openvpn/export/:name — export an .ovpn client config
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<OvpnClientConfigResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    // Fetch server config to build the .ovpn template
    let srv = client
        .ovpn_server()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let mikrotik_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    // Extract host from URL for remote directive
    let remote_host = mikrotik_url
        .replace("https://", "")
        .replace("http://", "")
        .split(':')
        .next()
        .unwrap_or("router.example.com")
        .to_string();

    let port = srv.port.unwrap_or_else(|| "1194".into());
    let protocol = srv.protocol.clone().unwrap_or_else(|| "tcp".into());
    let cipher = srv.cipher.clone().unwrap_or_else(|| "aes256-cbc".into());
    let auth = srv.auth.clone().unwrap_or_else(|| "sha1".into());

    // Map MikroTik cipher names to OpenVPN names
    let ovpn_cipher = match cipher.as_str() {
        "aes128-cbc" => "AES-128-CBC",
        "aes192-cbc" => "AES-192-CBC",
        "aes256-cbc" => "AES-256-CBC",
        "aes128-gcm" => "AES-128-GCM",
        "aes256-gcm" => "AES-256-GCM",
        other => other,
    };

    let ovpn_auth = match auth.as_str() {
        "sha1" => "SHA1",
        "sha256" => "SHA256",
        "sha512" => "SHA512",
        "md5" => "MD5",
        other => other,
    };

    let proto_str = if protocol.contains("tcp") {
        "tcp"
    } else {
        "udp"
    };

    let config = format!(
        r#"client
dev tun
proto {proto_str}
remote {remote_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {ovpn_cipher}
auth {ovpn_auth}
auth-user-pass
verb 3

# Paste CA certificate below or use --ca option
# <ca>
# ... CA certificate PEM ...
# </ca>
"#
    );

    Ok(Json(OvpnClientConfigResponse {
        config,
        filename: format!("{name}.ovpn"),
    }))
}
