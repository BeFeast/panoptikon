//! OpenVPN management API endpoints.
//!
//! Provides configuration of OpenVPN server on MikroTik, client/secret
//! management, client config export, and certificate listing.

use axum::{
    extract::{Path, State},
    http::header,
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
    pub port: Option<u32>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub require_client_certificate: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnClient {
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
    pub clients: Vec<OvpnClient>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOvpnClientRequest {
    pub name: String,
    pub password: String,
    #[serde(default = "default_ovpn_service")]
    pub service: String,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
}

fn default_ovpn_service() -> String {
    "ovpn".to_string()
}

#[derive(Debug, Serialize)]
pub struct OvpnCertificate {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub issuer: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub trusted: bool,
    pub ca: bool,
    pub has_private_key: bool,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub expires_after: Option<String>,
    pub fingerprint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnCertificatesResponse {
    pub available: bool,
    pub certificates: Vec<OvpnCertificate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u32>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub require_client_certificate: Option<bool>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/server — fetch OpenVPN server configuration.
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, AppError> {
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
                default_profile: None,
                cipher: None,
                auth: None,
                require_client_certificate: false,
            }));
        }
    };

    let cfg = client.ovpn_server_config().await.unwrap_or_else(|_| {
        crate::mikrotik::types::OvpnServerConfig {
            enabled: Some("false".to_string()),
            port: None,
            mode: None,
            protocol: None,
            certificate: None,
            default_profile: None,
            cipher: None,
            auth: None,
            require_client_certificate: None,
            keepalive_timeout: None,
            max_mtu: None,
            netmask: None,
            mac_address: None,
        }
    });

    let is_true = |v: &Option<String>| v.as_deref() == Some("true") || v.as_deref() == Some("yes");

    Ok(Json(OvpnServerResponse {
        available: true,
        enabled: is_true(&cfg.enabled),
        port: cfg.port.and_then(|s| s.parse().ok()),
        mode: cfg.mode,
        protocol: cfg.protocol,
        certificate: cfg.certificate,
        default_profile: cfg.default_profile,
        cipher: cfg.cipher,
        auth: cfg.auth,
        require_client_certificate: is_true(&cfg.require_client_certificate),
    }))
}

/// POST /api/v1/openvpn/server — update OpenVPN server configuration.
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOvpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".to_string()))?;

    let mut payload = serde_json::Map::new();
    if let Some(enabled) = body.enabled {
        payload.insert(
            "enabled".into(),
            serde_json::Value::String(if enabled { "true" } else { "false" }.into()),
        );
    }
    if let Some(port) = body.port {
        payload.insert("port".into(), serde_json::Value::String(port.to_string()));
    }
    if let Some(ref protocol) = body.protocol {
        payload.insert(
            "protocol".into(),
            serde_json::Value::String(protocol.clone()),
        );
    }
    if let Some(ref certificate) = body.certificate {
        payload.insert(
            "certificate".into(),
            serde_json::Value::String(certificate.clone()),
        );
    }
    if let Some(ref profile) = body.default_profile {
        payload.insert(
            "default-profile".into(),
            serde_json::Value::String(profile.clone()),
        );
    }
    if let Some(ref cipher) = body.cipher {
        payload.insert("cipher".into(), serde_json::Value::String(cipher.clone()));
    }
    if let Some(ref auth) = body.auth {
        payload.insert("auth".into(), serde_json::Value::String(auth.clone()));
    }
    if let Some(req_cert) = body.require_client_certificate {
        payload.insert(
            "require-client-certificate".into(),
            serde_json::Value::String(if req_cert { "true" } else { "false" }.into()),
        );
    }

    client
        .update_ovpn_server_config(&serde_json::Value::Object(payload))
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OVPN server: {e}")))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// GET /api/v1/openvpn/clients — list PPP secrets for OpenVPN.
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<OvpnClientsResponse>, AppError> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(OvpnClientsResponse {
                available: false,
                clients: vec![],
            }));
        }
    };

    let secrets = client.ppp_secrets().await.unwrap_or_default();
    let clients = secrets
        .into_iter()
        .map(|s| OvpnClient {
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

    Ok(Json(OvpnClientsResponse {
        available: true,
        clients,
    }))
}

/// POST /api/v1/openvpn/clients — create a new PPP secret for OpenVPN.
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<CreateOvpnClientRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".to_string()))?;

    let mut payload = serde_json::json!({
        "name": body.name,
        "password": body.password,
        "service": body.service,
    });

    if let Some(ref profile) = body.profile {
        payload["profile"] = serde_json::Value::String(profile.clone());
    }
    if let Some(ref local) = body.local_address {
        payload["local-address"] = serde_json::Value::String(local.clone());
    }
    if let Some(ref remote) = body.remote_address {
        payload["remote-address"] = serde_json::Value::String(remote.clone());
    }
    if let Some(ref comment) = body.comment {
        payload["comment"] = serde_json::Value::String(comment.clone());
    }

    client
        .create_ppp_secret(&payload)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// DELETE /api/v1/openvpn/clients/:id — delete a PPP secret.
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".to_string()))?;

    client
        .delete_ppp_secret(&id)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete PPP secret: {e}")))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// GET /api/v1/openvpn/clients/:name/export — export an OpenVPN client config (.ovpn).
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".to_string()))?;

    // Fetch server config for port, protocol, cipher
    let server_cfg = client
        .ovpn_server_config()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to read OVPN server config: {e}")))?;

    // Fetch the router's external address from settings
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
    let protocol = server_cfg.protocol.as_deref().unwrap_or("tcp");
    let cipher = server_cfg.cipher.as_deref().unwrap_or("aes256-cbc");
    let auth = server_cfg.auth.as_deref().unwrap_or("sha1");

    // Map MikroTik cipher names to OpenVPN cipher names
    let ovpn_cipher = match cipher {
        "aes128-cbc" => "AES-128-CBC",
        "aes192-cbc" => "AES-192-CBC",
        "aes256-cbc" => "AES-256-CBC",
        "aes128-gcm" => "AES-128-GCM",
        "aes256-gcm" => "AES-256-GCM",
        other => other,
    };

    let ovpn_config = format!(
        r#"client
dev tun
proto {protocol}
remote {router_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {ovpn_cipher}
auth {auth}
auth-user-pass
verb 3
# User: {name}
# Generated by Panoptikon
"#
    );

    let filename = format!("{name}.ovpn");
    Ok((
        [
            (
                header::CONTENT_TYPE,
                "application/x-openvpn-profile".to_string(),
            ),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        ovpn_config,
    ))
}

/// GET /api/v1/openvpn/certificates — list certificates from MikroTik.
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<OvpnCertificatesResponse>, AppError> {
    let client = match mikrotik_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(OvpnCertificatesResponse {
                available: false,
                certificates: vec![],
            }));
        }
    };

    let certs = client.certificates().await.unwrap_or_default();
    let certificates = certs
        .into_iter()
        .map(|c| {
            let is_true =
                |v: &Option<String>| v.as_deref() == Some("true") || v.as_deref() == Some("yes");
            OvpnCertificate {
                id: c.id.unwrap_or_default(),
                name: c.name.unwrap_or_default(),
                common_name: c.common_name,
                issuer: c.issuer,
                key_size: c.key_size,
                days_valid: c.days_valid,
                trusted: is_true(&c.trusted),
                ca: is_true(&c.ca) || is_true(&c.authority),
                has_private_key: is_true(&c.private_key),
                invalid_before: c.invalid_before,
                invalid_after: c.invalid_after,
                expires_after: c.expires_after,
                fingerprint: c.fingerprint,
            }
        })
        .collect();

    Ok(Json(OvpnCertificatesResponse {
        available: true,
        certificates,
    }))
}
