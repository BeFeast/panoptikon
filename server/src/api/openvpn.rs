//! OpenVPN management API endpoints.
//!
//! Provides endpoints for managing OpenVPN server configuration on MikroTik,
//! viewing certificates, and exporting client configuration files.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::OvpnServerSettingsWriteRequest;

// ── Helper ──────────────────────────────────────────────

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

// ── Response types ──────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OpenVpnServerConfig {
    pub available: bool,
    pub enabled: bool,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: bool,
}

#[derive(Debug, Serialize)]
pub struct OpenVpnCertificate {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub fingerprint: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub has_private_key: bool,
    pub is_authority: bool,
    pub is_ca: bool,
    pub expired: bool,
    pub trusted: bool,
}

#[derive(Debug, Serialize)]
pub struct OpenVpnStatusResponse {
    pub server: OpenVpnServerConfig,
    pub certificates: Vec<OpenVpnCertificate>,
    pub connected_clients: Vec<OpenVpnConnectedClient>,
}

#[derive(Debug, Serialize)]
pub struct OpenVpnConnectedClient {
    pub name: String,
    pub client_address: Option<String>,
    pub encoding: Option<String>,
    pub uptime: Option<String>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOpenVpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub require_client_certificate: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ClientConfigResponse {
    pub config: String,
    pub filename: String,
}

// ── Handlers ────────────────────────────────────────────

/// GET /api/v1/openvpn/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<OpenVpnStatusResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let (server, certificates, connected_clients) = match client {
        Some(c) => {
            let settings = c.ovpn_server_settings().await.ok();
            let certs = c.certificates().await.unwrap_or_default();
            let interfaces = c.ovpn_server_interfaces().await.unwrap_or_default();

            let server = match settings {
                Some(s) => {
                    let is_true = |v: &Option<String>| v.as_deref() == Some("true");
                    OpenVpnServerConfig {
                        available: true,
                        enabled: is_true(&s.enabled),
                        port: s.port.and_then(|p| p.parse().ok()),
                        mode: s.mode,
                        protocol: s.protocol,
                        cipher: s.cipher,
                        auth: s.auth,
                        certificate: s.certificate,
                        default_profile: s.default_profile,
                        require_client_certificate: is_true(&s.require_client_certificate),
                    }
                }
                None => OpenVpnServerConfig {
                    available: false,
                    enabled: false,
                    port: None,
                    mode: None,
                    protocol: None,
                    cipher: None,
                    auth: None,
                    certificate: None,
                    default_profile: None,
                    require_client_certificate: false,
                },
            };

            let is_true = |v: &Option<String>| v.as_deref() == Some("true");

            let certificates: Vec<OpenVpnCertificate> = certs
                .into_iter()
                .map(|c| OpenVpnCertificate {
                    id: c.id.unwrap_or_default(),
                    name: c.name.unwrap_or_default(),
                    common_name: c.common_name,
                    key_size: c.key_size,
                    days_valid: c.days_valid,
                    fingerprint: c.fingerprint,
                    invalid_before: c.invalid_before,
                    invalid_after: c.invalid_after,
                    has_private_key: is_true(&c.private_key),
                    is_authority: is_true(&c.authority),
                    is_ca: c.ca.is_some() && !c.ca.as_deref().unwrap_or("").is_empty(),
                    expired: is_true(&c.expired),
                    trusted: is_true(&c.trusted),
                })
                .collect();

            let connected_clients: Vec<OpenVpnConnectedClient> = interfaces
                .into_iter()
                .filter(|i| i.running.as_deref() == Some("true"))
                .map(|i| OpenVpnConnectedClient {
                    name: i.name.unwrap_or_default(),
                    client_address: i.client_address,
                    encoding: i.encoding,
                    uptime: i.uptime,
                    status: "connected".to_string(),
                })
                .collect();

            (server, certificates, connected_clients)
        }
        None => (
            OpenVpnServerConfig {
                available: false,
                enabled: false,
                port: None,
                mode: None,
                protocol: None,
                cipher: None,
                auth: None,
                certificate: None,
                default_profile: None,
                require_client_certificate: false,
            },
            vec![],
            vec![],
        ),
    };

    Ok(Json(OpenVpnStatusResponse {
        server,
        certificates,
        connected_clients,
    }))
}

/// PATCH /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOpenVpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let req = OvpnServerSettingsWriteRequest {
        enabled: body
            .enabled
            .map(|b| if b { "true" } else { "false" }.into()),
        port: body.port.map(|p| p.to_string()),
        mode: body.mode,
        protocol: body.protocol,
        cipher: body.cipher,
        auth: body.auth,
        certificate: body.certificate,
        default_profile: body.default_profile,
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.into()),
    };

    client
        .update_ovpn_server_settings(&req)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OpenVPN settings: {e}")))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/v1/openvpn/export-client-config
pub async fn export_client_config(
    State(state): State<AppState>,
) -> Result<Json<ClientConfigResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::ServiceUnavailable("MikroTik not configured".into()))?;

    let settings = client
        .ovpn_server_settings()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch OpenVPN settings: {e}")))?;

    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_else(|| "router.example.com".to_string());

    // Extract the host portion from the MikroTik URL
    let remote_host = router_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split(':')
        .next()
        .unwrap_or("router.example.com")
        .split('/')
        .next()
        .unwrap_or("router.example.com")
        .to_string();

    let port = settings
        .port
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(1194);
    let protocol = settings.protocol.unwrap_or_else(|| "tcp".to_string());
    let cipher = settings.cipher.unwrap_or_else(|| "aes256-cbc".to_string());
    let auth = settings.auth.unwrap_or_else(|| "sha1".to_string());

    let config = format!(
        r#"client
dev tun
proto {protocol}
remote {remote_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {cipher}
auth {auth}
verb 3

# Paste your CA certificate, client certificate, and client key below:
<ca>
# CA certificate here
</ca>

<cert>
# Client certificate here
</cert>

<key>
# Client private key here
</key>
"#
    );

    Ok(Json(ClientConfigResponse {
        config,
        filename: format!("panoptikon-{remote_host}.ovpn"),
    }))
}
