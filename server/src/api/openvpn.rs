//! OpenVPN management API endpoints.
//!
//! Provides endpoints for configuring OpenVPN servers on MikroTik,
//! exporting client configurations, and listing certificates.

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use super::{AppError, AppState};
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::OvpnServerWriteRequest;

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

/// Extract the host from a URL string without depending on the `url` crate.
fn extract_host(raw: &str) -> Option<String> {
    let after_scheme = raw
        .strip_prefix("https://")
        .or_else(|| raw.strip_prefix("http://"))
        .unwrap_or(raw);
    let host = after_scheme.split('/').next().unwrap_or(after_scheme);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
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
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub default_profile: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnConnectedClient {
    pub name: String,
    pub client_address: Option<String>,
    pub uptime: Option<String>,
    pub encoding: Option<String>,
    pub caller_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientsResponse {
    pub available: bool,
    pub clients: Vec<OvpnConnectedClient>,
}

#[derive(Debug, Serialize)]
pub struct OvpnCertificate {
    pub name: Option<String>,
    pub common_name: Option<String>,
    pub fingerprint: Option<String>,
    pub key_type: Option<String>,
    pub expires_after: Option<String>,
    pub trusted: bool,
    pub has_private_key: bool,
    pub ca: bool,
}

#[derive(Debug, Serialize)]
pub struct OvpnCertificatesResponse {
    pub available: bool,
    pub certificates: Vec<OvpnCertificate>,
}

#[derive(Debug, Serialize)]
pub struct OvpnClientConfigResponse {
    pub config: String,
}

#[derive(Debug, Deserialize)]
pub struct OvpnClientConfigQuery {
    pub remote_host: Option<String>,
}

// ── Request types ───────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UpdateOvpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u16>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub default_profile: Option<String>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/server
pub async fn get_server(
    State(state): State<AppState>,
) -> Result<Json<OvpnServerResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let Some(client) = client else {
        return Ok(Json(OvpnServerResponse {
            available: false,
            enabled: false,
            port: None,
            mode: None,
            protocol: None,
            certificate: None,
            auth: None,
            cipher: None,
            default_profile: None,
        }));
    };

    match client.ovpn_server().await {
        Ok(server) => {
            let enabled = server
                .enabled
                .as_deref()
                .map(|v| v == "true" || v == "yes")
                .unwrap_or(false);
            Ok(Json(OvpnServerResponse {
                available: true,
                enabled,
                port: server.port.as_deref().and_then(|p| p.parse().ok()),
                mode: server.mode,
                protocol: server.protocol,
                certificate: server.certificate,
                auth: server.auth,
                cipher: server.cipher,
                default_profile: server.default_profile,
            }))
        }
        Err(_) => Ok(Json(OvpnServerResponse {
            available: false,
            enabled: false,
            port: None,
            mode: None,
            protocol: None,
            certificate: None,
            auth: None,
            cipher: None,
            default_profile: None,
        })),
    }
}

/// PUT /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(req): Json<UpdateOvpnServerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::Validation("MikroTik not configured".to_string()))?;

    let write_req = OvpnServerWriteRequest {
        enabled: req
            .enabled
            .map(|b| if b { "yes" } else { "no" }.to_string()),
        port: req.port.map(|p| p.to_string()),
        mode: req.mode,
        protocol: req.protocol,
        certificate: req.certificate,
        auth: req.auth,
        cipher: req.cipher,
        default_profile: req.default_profile,
        require_client_certificate: None,
        netmask: None,
    };

    client
        .update_ovpn_server(&write_req)
        .await
        .map_err(|e| AppError::BadGateway(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/v1/openvpn/clients
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<OvpnClientsResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let Some(client) = client else {
        return Ok(Json(OvpnClientsResponse {
            available: false,
            clients: vec![],
        }));
    };

    // Fetch active PPP connections (includes OpenVPN)
    let active = client.ppp_active().await.unwrap_or_default();

    let clients: Vec<OvpnConnectedClient> = active
        .into_iter()
        .filter(|c| c.service.as_deref() == Some("ovpn"))
        .map(|c| OvpnConnectedClient {
            name: c.name.unwrap_or_default(),
            client_address: c.address,
            uptime: c.uptime,
            encoding: c.encoding,
            caller_id: c.caller_id,
        })
        .collect();

    Ok(Json(OvpnClientsResponse {
        available: true,
        clients,
    }))
}

/// GET /api/v1/openvpn/certificates
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<OvpnCertificatesResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let Some(client) = client else {
        return Ok(Json(OvpnCertificatesResponse {
            available: false,
            certificates: vec![],
        }));
    };

    match client.certificates().await {
        Ok(certs) => {
            let certificates: Vec<OvpnCertificate> = certs
                .into_iter()
                .map(|c| OvpnCertificate {
                    name: c.name,
                    common_name: c.common_name,
                    fingerprint: c.fingerprint,
                    key_type: c.key_type,
                    expires_after: c.expires_after,
                    trusted: c
                        .trusted
                        .as_deref()
                        .map(|v| v == "true" || v == "yes")
                        .unwrap_or(false),
                    has_private_key: c
                        .private_key
                        .as_deref()
                        .map(|v| v == "true" || v == "yes")
                        .unwrap_or(false),
                    ca: c
                        .ca
                        .as_deref()
                        .map(|v| v == "true" || v == "yes")
                        .unwrap_or(false),
                })
                .collect();

            Ok(Json(OvpnCertificatesResponse {
                available: true,
                certificates,
            }))
        }
        Err(_) => Ok(Json(OvpnCertificatesResponse {
            available: false,
            certificates: vec![],
        })),
    }
}

/// GET /api/v1/openvpn/export-config
pub async fn export_client_config(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<OvpnClientConfigQuery>,
) -> Result<Json<OvpnClientConfigResponse>, AppError> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(AppError::Validation("MikroTik not configured".to_string()))?;

    let server = client
        .ovpn_server()
        .await
        .map_err(|e| AppError::BadGateway(e.to_string()))?;

    let port = server.port.as_deref().unwrap_or("1194");
    let protocol = server
        .protocol
        .as_deref()
        .unwrap_or("tcp")
        .to_lowercase()
        .replace("tcp", "tcp-client");
    let cipher = server.cipher.as_deref().unwrap_or("aes256");
    let auth = server.auth.as_deref().unwrap_or("sha1");

    // Use the MikroTik URL's host as the default remote host
    let mikrotik_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    let default_host = extract_host(&mikrotik_url).unwrap_or("YOUR_SERVER_IP".to_string());
    let remote_host = query.remote_host.unwrap_or(default_host);

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

# Paste your CA certificate between the tags below
<ca>
# CA certificate goes here
# Export from MikroTik: /certificate export-certificate <ca-name>
</ca>

# Paste your client certificate between the tags below
<cert>
# Client certificate goes here
</cert>

# Paste your client private key between the tags below
<key>
# Client private key goes here
</key>
"#
    );

    Ok(Json(OvpnClientConfigResponse { config }))
}
