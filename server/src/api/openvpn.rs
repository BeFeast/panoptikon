//! OpenVPN management API endpoints for MikroTik.
//!
//! Provides server configuration, client (PPP secret) management,
//! client config export, and certificate listing.

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;

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
        return Err(AppError::ServiceUnavailable(
            "MikroTik integration is not enabled".into(),
        ));
    }

    let url = get_setting(state, "mikrotik_url")
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik URL not configured".into()))?;
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
    pub port: u16,
    pub mode: String,
    pub protocol: String,
    pub certificate: String,
    pub default_profile: String,
    pub cipher: String,
    pub auth: String,
    pub require_client_certificate: bool,
}

#[derive(Debug, Serialize)]
pub struct PppSecretResponse {
    pub id: String,
    pub name: String,
    pub service: String,
    pub profile: String,
    pub local_address: String,
    pub remote_address: String,
    pub disabled: bool,
    pub comment: String,
}

#[derive(Debug, Serialize)]
pub struct CertificateResponse {
    pub id: String,
    pub name: String,
    pub common_name: String,
    pub key_type: String,
    pub key_size: String,
    pub trusted: bool,
    pub ca: bool,
    pub issuer: String,
    pub serial_number: String,
    pub invalid_before: String,
    pub invalid_after: String,
    pub expired: bool,
    pub has_private_key: bool,
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
    pub require_client_certificate: Option<bool>,
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

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/server — fetch OpenVPN server config.
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, AppError> {
    let client = mikrotik_client(&state).await?;
    let cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch OpenVPN server config: {e}")))?;

    Ok(Json(OvpnServerResponse {
        enabled: cfg.enabled.as_deref() == Some("true"),
        port: cfg
            .port
            .as_deref()
            .and_then(|p| p.parse().ok())
            .unwrap_or(1194),
        mode: cfg.mode.unwrap_or_else(|| "ip".into()),
        protocol: cfg.protocol.unwrap_or_else(|| "tcp".into()),
        certificate: cfg.certificate.unwrap_or_default(),
        default_profile: cfg.default_profile.unwrap_or_else(|| "default".into()),
        cipher: cfg.cipher.unwrap_or_else(|| "aes256-cbc".into()),
        auth: cfg.auth.unwrap_or_else(|| "sha1".into()),
        require_client_certificate: cfg.require_client_certificate.as_deref() == Some("true"),
    }))
}

/// PATCH /api/v1/openvpn/server — update OpenVPN server config.
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOvpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;

    let req = crate::mikrotik::types::OvpnServerWriteRequest {
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
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.into()),
    };

    client
        .update_ovpn_server(&req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OpenVPN server: {e}")))?;

    Ok(Json(
        serde_json::json!({"message": "OpenVPN server configuration updated"}),
    ))
}

/// GET /api/v1/openvpn/clients — list PPP secrets (OpenVPN users).
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<PppSecretResponse>>, AppError> {
    let client = mikrotik_client(&state).await?;
    let secrets = client
        .ppp_secrets()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch PPP secrets: {e}")))?;

    let result: Vec<PppSecretResponse> = secrets
        .into_iter()
        .map(|s| PppSecretResponse {
            id: s.id.unwrap_or_default(),
            name: s.name.unwrap_or_default(),
            service: s.service.unwrap_or_else(|| "any".into()),
            profile: s.profile.unwrap_or_else(|| "default".into()),
            local_address: s.local_address.unwrap_or_default(),
            remote_address: s.remote_address.unwrap_or_default(),
            disabled: s.disabled.as_deref() == Some("true"),
            comment: s.comment.unwrap_or_default(),
        })
        .collect();

    Ok(Json(result))
}

/// POST /api/v1/openvpn/clients — create a PPP secret.
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<CreatePppSecretRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;

    let req = crate::mikrotik::types::PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: body.service,
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
    };

    client
        .create_ppp_secret(&req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({"message": "Client created"})))
}

/// DELETE /api/v1/openvpn/clients/:id — delete a PPP secret.
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;
    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({"message": "Client deleted"})))
}

/// GET /api/v1/openvpn/export/:name — export client .ovpn config.
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let mikrotik_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();

    // Extract host from MikroTik URL for the remote directive
    let server_host = mikrotik_url
        .strip_prefix("https://")
        .or_else(|| mikrotik_url.strip_prefix("http://"))
        .unwrap_or(&mikrotik_url)
        .split(':')
        .next()
        .unwrap_or("your-server-ip")
        .trim_end_matches('/')
        .to_string();

    let client = mikrotik_client(&state).await?;
    let cfg = client.ovpn_server_config().await.unwrap_or_else(|_| {
        crate::mikrotik::types::OvpnServerConfig {
            enabled: None,
            port: None,
            mode: None,
            protocol: None,
            certificate: None,
            default_profile: None,
            cipher: None,
            auth: None,
            require_client_certificate: None,
            redirect_gateway: None,
        }
    });

    let port = cfg
        .port
        .as_deref()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(1194);
    let proto = cfg.protocol.as_deref().unwrap_or("tcp");
    let cipher = cfg.cipher.as_deref().unwrap_or("aes256-cbc");
    let auth = cfg.auth.as_deref().unwrap_or("sha1");

    let ovpn_config = format!(
        r#"# OpenVPN client configuration for {name}
# Generated by Panoptikon
client
dev tun
proto {proto}
remote {server_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {cipher}
auth {auth}
auth-user-pass
verb 3

# Paste your CA certificate between the tags below
# <ca>
# -----BEGIN CERTIFICATE-----
# (your CA certificate here)
# -----END CERTIFICATE-----
# </ca>
"#
    );

    let filename = format!("{name}.ovpn");
    let disposition = format!("attachment; filename=\"{filename}\"");
    Ok((
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                "application/x-openvpn-profile".to_string(),
            ),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        ovpn_config,
    ))
}

/// GET /api/v1/openvpn/certificates — list router certificates.
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<CertificateResponse>>, AppError> {
    let client = mikrotik_client(&state).await?;
    let certs = client
        .certificates()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch certificates: {e}")))?;

    let result: Vec<CertificateResponse> = certs
        .into_iter()
        .map(|c| CertificateResponse {
            id: c.id.unwrap_or_default(),
            name: c.name.unwrap_or_default(),
            common_name: c.common_name.unwrap_or_default(),
            key_type: c.key_type.unwrap_or_default(),
            key_size: c.key_size.unwrap_or_default(),
            trusted: c.trusted.as_deref() == Some("true"),
            ca: c.ca.as_deref() == Some("true"),
            issuer: c.issuer.unwrap_or_default(),
            serial_number: c.serial_number.unwrap_or_default(),
            invalid_before: c.invalid_before.unwrap_or_default(),
            invalid_after: c.invalid_after.unwrap_or_default(),
            expired: c.expired.as_deref() == Some("true"),
            has_private_key: c.private_key.as_deref() == Some("true"),
        })
        .collect();

    Ok(Json(result))
}

/// DELETE /api/v1/openvpn/certificates/:id — delete a certificate.
pub async fn delete_certificate(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await?;
    client
        .delete_certificate(&id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete certificate: {e}")))?;

    Ok(Json(serde_json::json!({"message": "Certificate deleted"})))
}
