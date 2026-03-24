//! OpenVPN management API endpoints.
//!
//! Provides configuration, client export, and certificate management
//! for OpenVPN on MikroTik routers.

use axum::{extract::State, Json};
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
pub struct OvpnServerConfig {
    pub available: bool,
    pub enabled: bool,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub require_client_certificate: bool,
    pub keepalive_timeout: Option<String>,
    pub connected_clients: usize,
}

#[derive(Debug, Serialize)]
pub struct OvpnConnectedClient {
    pub name: String,
    pub client_address: Option<String>,
    pub uptime: Option<String>,
    pub encoding: Option<String>,
    pub rx_bytes: Option<u64>,
    pub tx_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct OvpnStatusResponse {
    pub server: OvpnServerConfig,
    pub clients: Vec<OvpnConnectedClient>,
}

#[derive(Debug, Deserialize)]
pub struct OvpnServerUpdateRequest {
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

#[derive(Debug, Serialize)]
pub struct OvpnClientExport {
    pub config: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct CertificateInfo {
    pub id: String,
    pub name: String,
    pub common_name: Option<String>,
    pub issuer: Option<String>,
    pub key_size: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub is_ca: bool,
    pub has_private_key: bool,
    pub expired: bool,
    pub trusted: bool,
    pub fingerprint: Option<String>,
    pub key_type: Option<String>,
    pub authority: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CertificatesResponse {
    pub available: bool,
    pub certificates: Vec<CertificateInfo>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/status — fetch OpenVPN server config + connected clients.
pub async fn status(State(state): State<AppState>) -> Result<Json<OvpnStatusResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let (server, clients) = if let Some(client) = client {
        let srv = client.ovpn_server().await.ok();
        let bindings = client.ovpn_server_bindings().await.unwrap_or_default();

        let clients: Vec<OvpnConnectedClient> = bindings
            .into_iter()
            .filter(|b| b.running.as_deref().map(|v| v == "true").unwrap_or(false))
            .map(|b| OvpnConnectedClient {
                name: b.name.unwrap_or_default(),
                client_address: b.client_address,
                uptime: b.uptime,
                encoding: b.encoding,
                rx_bytes: b.rx_byte.as_deref().and_then(|s| s.parse().ok()),
                tx_bytes: b.tx_byte.as_deref().and_then(|s| s.parse().ok()),
            })
            .collect();

        let server = if let Some(s) = srv {
            fn is_true(val: &Option<String>) -> bool {
                val.as_deref() == Some("true") || val.as_deref() == Some("yes")
            }
            OvpnServerConfig {
                available: true,
                enabled: is_true(&s.enabled),
                port: s.port.as_deref().and_then(|p| p.parse().ok()),
                mode: s.mode,
                protocol: s.protocol,
                certificate: s.certificate,
                default_profile: s.default_profile,
                cipher: s.cipher,
                auth: s.auth,
                require_client_certificate: is_true(&s.require_client_certificate),
                keepalive_timeout: s.keepalive_timeout,
                connected_clients: clients.len(),
            }
        } else {
            OvpnServerConfig {
                available: true,
                enabled: false,
                port: None,
                mode: None,
                protocol: None,
                certificate: None,
                default_profile: None,
                cipher: None,
                auth: None,
                require_client_certificate: false,
                keepalive_timeout: None,
                connected_clients: 0,
            }
        };

        (server, clients)
    } else {
        let server = OvpnServerConfig {
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
            keepalive_timeout: None,
            connected_clients: 0,
        };
        (server, vec![])
    };

    Ok(Json(OvpnStatusResponse { server, clients }))
}

/// PATCH /api/v1/openvpn/server — update OpenVPN server configuration.
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<OvpnServerUpdateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".into()))?;

    let mut payload = serde_json::Map::new();

    if let Some(enabled) = body.enabled {
        payload.insert(
            "enabled".into(),
            serde_json::Value::String(if enabled { "yes".into() } else { "no".into() }),
        );
    }
    if let Some(port) = body.port {
        payload.insert("port".into(), serde_json::Value::String(port.to_string()));
    }
    if let Some(ref mode) = body.mode {
        payload.insert("mode".into(), serde_json::Value::String(mode.clone()));
    }
    if let Some(ref protocol) = body.protocol {
        payload.insert(
            "protocol".into(),
            serde_json::Value::String(protocol.clone()),
        );
    }
    if let Some(ref cert) = body.certificate {
        payload.insert(
            "certificate".into(),
            serde_json::Value::String(cert.clone()),
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
            serde_json::Value::String(if req_cert { "yes".into() } else { "no".into() }),
        );
    }

    let payload_val = serde_json::Value::Object(payload);
    client
        .update_ovpn_server(&payload_val)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update OpenVPN server: {e}")))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/v1/openvpn/export-client — generate an OpenVPN client configuration.
pub async fn export_client(
    State(state): State<AppState>,
) -> Result<Json<OvpnClientExport>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or_else(|| AppError::Validation("MikroTik is not configured".into()))?;

    let srv = client
        .ovpn_server()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch OpenVPN config: {e}")))?;

    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_else(|| "router.example.com".to_string());

    // Extract host from the router URL
    let host = router_url
        .replace("https://", "")
        .replace("http://", "")
        .split(':')
        .next()
        .unwrap_or("router.example.com")
        .to_string();

    let port = srv.port.as_deref().unwrap_or("1194");
    let protocol = srv.protocol.as_deref().unwrap_or("tcp");

    let config = format!(
        r#"client
dev tun
proto {protocol}
remote {host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-CBC
auth SHA1
verb 3

# Paste your certificates below or use separate files:
# <ca>
# ... CA certificate ...
# </ca>
# <cert>
# ... Client certificate ...
# </cert>
# <key>
# ... Client private key ...
# </key>
"#
    );

    Ok(Json(OvpnClientExport {
        config,
        filename: format!("panoptikon-ovpn-{host}.ovpn"),
    }))
}

/// GET /api/v1/certificates — fetch certificate list from MikroTik.
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<CertificatesResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    if let Some(client) = client {
        let certs = client.certificates().await.unwrap_or_default();

        let certificates: Vec<CertificateInfo> = certs
            .into_iter()
            .map(|c| {
                fn is_true(val: &Option<String>) -> bool {
                    val.as_deref() == Some("true") || val.as_deref() == Some("yes")
                }
                CertificateInfo {
                    id: c.id.unwrap_or_default(),
                    name: c.name.unwrap_or_default(),
                    common_name: c.common_name,
                    issuer: c.issuer,
                    key_size: c.key_size,
                    invalid_before: c.invalid_before,
                    invalid_after: c.invalid_after,
                    is_ca: is_true(&c.ca),
                    has_private_key: is_true(&c.private_key),
                    expired: is_true(&c.expired),
                    trusted: is_true(&c.trusted),
                    fingerprint: c.fingerprint,
                    key_type: c.key_type,
                    authority: c.authority,
                }
            })
            .collect();

        Ok(Json(CertificatesResponse {
            available: true,
            certificates,
        }))
    } else {
        Ok(Json(CertificatesResponse {
            available: false,
            certificates: vec![],
        }))
    }
}
