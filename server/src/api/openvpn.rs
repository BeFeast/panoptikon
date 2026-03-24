//! OpenVPN management API endpoints.
//!
//! Server configuration, PPP client CRUD, client config export,
//! and certificate listing for MikroTik-based OpenVPN.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::{OvpnServerWriteRequest, PppSecretWriteRequest};

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
    pub default_profile: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub netmask: Option<String>,
    pub require_client_certificate: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientResponse {
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
pub struct CertificateResponse {
    pub id: String,
    pub name: Option<String>,
    pub common_name: Option<String>,
    pub fingerprint: Option<String>,
    pub key_type: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub trusted: bool,
    pub ca: bool,
    pub issuer: Option<String>,
    pub serial_number: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub expires_after: Option<String>,
    pub has_private_key: bool,
    pub authority: bool,
}

// ── Request types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub netmask: Option<String>,
    pub require_client_certificate: Option<bool>,
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

// ── Handlers ────────────────────────────────────────────────

fn is_true(val: &Option<String>) -> bool {
    matches!(val.as_deref(), Some("true") | Some("yes"))
}

/// GET /api/v1/openvpn/server
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    match client.ovpn_server().await {
        Ok(srv) => Ok(Json(OvpnServerResponse {
            available: true,
            enabled: is_true(&srv.enabled),
            port: srv.port.and_then(|p| p.parse().ok()),
            mode: srv.mode,
            protocol: srv.protocol,
            certificate: srv.certificate,
            default_profile: srv.default_profile,
            cipher: srv.cipher,
            auth: srv.auth,
            netmask: srv.netmask,
            require_client_certificate: is_true(&srv.require_client_certificate),
        })),
        Err(e) => {
            tracing::warn!("Failed to fetch OVPN server config: {e}");
            Ok(Json(OvpnServerResponse {
                available: false,
                enabled: false,
                port: None,
                mode: None,
                protocol: None,
                certificate: None,
                default_profile: None,
                cipher: None,
                auth: None,
                netmask: None,
                require_client_certificate: false,
            }))
        }
    }
}

/// POST /api/v1/openvpn/server
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
        mode: body.mode,
        protocol: body.protocol,
        certificate: body.certificate,
        default_profile: body.default_profile,
        cipher: body.cipher,
        auth: body.auth,
        netmask: body.netmask,
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.into()),
    };

    client.update_ovpn_server(&req).await.map_err(|e| {
        tracing::error!("Failed to update OVPN server: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/clients
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<OvpnClientResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let secrets = client.ppp_secrets().await.map_err(|e| {
        tracing::error!("Failed to fetch PPP secrets: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let clients: Vec<OvpnClientResponse> = secrets
        .into_iter()
        .filter(|s| {
            // Include secrets for ovpn or "any" service
            match s.service.as_deref() {
                Some("ovpn") | Some("any") | None => true,
                _ => false,
            }
        })
        .map(|s| OvpnClientResponse {
            id: s.id.unwrap_or_default(),
            name: s.name.unwrap_or_default(),
            service: s.service,
            profile: s.profile,
            local_address: s.local_address,
            remote_address: s.remote_address,
            disabled: is_true(&s.disabled),
            comment: s.comment,
        })
        .collect();

    Ok(Json(clients))
}

/// POST /api/v1/openvpn/clients
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<CreateOvpnClientRequest>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: Some(body.service.unwrap_or_else(|| "ovpn".to_string())),
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
    };

    client.create_ppp_secret(&req).await.map_err(|e| {
        tracing::error!("Failed to create PPP secret: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::CREATED)
}

/// DELETE /api/v1/openvpn/clients/:id
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    client.delete_ppp_secret(&id).await.map_err(|e| {
        tracing::error!("Failed to delete PPP secret: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/clients/:name/export
///
/// Generates a `.ovpn` client config file for the given client name.
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<
    (
        StatusCode,
        [(axum::http::header::HeaderName, String); 2],
        String,
    ),
    StatusCode,
> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let server = client.ovpn_server().await.map_err(|e| {
        tracing::error!("Failed to fetch OVPN server for export: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    // Get the MikroTik router's URL to extract the host
    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    // Simple host extraction: strip scheme, strip path/port
    let router_host = router_url
        .strip_prefix("https://")
        .or_else(|| router_url.strip_prefix("http://"))
        .unwrap_or(&router_url)
        .split('/')
        .next()
        .and_then(|h| h.split(':').next())
        .filter(|h| !h.is_empty())
        .unwrap_or("router.example.com")
        .to_string();

    let port = server.port.as_deref().unwrap_or("1194").to_string();
    let proto = match server.protocol.as_deref() {
        Some("udp") => "udp",
        _ => "tcp-client",
    };
    let cipher = server.cipher.as_deref().unwrap_or("aes256");
    let auth = server.auth.as_deref().unwrap_or("sha1");

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
auth-user-pass
verb 3
# Client: {name}
# Generated by Panoptikon
"#,
    );

    let filename = format!("{name}.ovpn");
    Ok((
        StatusCode::OK,
        [
            (
                axum::http::header::CONTENT_TYPE,
                "application/x-openvpn-profile".to_string(),
            ),
            (
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        config,
    ))
}

/// GET /api/v1/certificates
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<CertificateResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let certs = client.certificates().await.map_err(|e| {
        tracing::error!("Failed to fetch certificates: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<CertificateResponse> = certs
        .into_iter()
        .map(|c| CertificateResponse {
            id: c.id.unwrap_or_default(),
            name: c.name,
            common_name: c.common_name,
            fingerprint: c.fingerprint,
            key_type: c.key_type,
            key_size: c.key_size,
            days_valid: c.days_valid,
            trusted: is_true(&c.trusted),
            ca: is_true(&c.ca),
            issuer: c.issuer,
            serial_number: c.serial_number,
            invalid_before: c.invalid_before,
            invalid_after: c.invalid_after,
            expires_after: c.expires_after,
            has_private_key: is_true(&c.private_key),
            authority: is_true(&c.authority),
        })
        .collect();

    Ok(Json(result))
}
