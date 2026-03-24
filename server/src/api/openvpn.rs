//! OpenVPN management API endpoints.
//!
//! Provides server configuration, client management (PPP secrets),
//! certificate listing, and client config export for MikroTik OpenVPN.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;
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

/// OpenVPN server configuration response.
#[derive(Debug, Serialize)]
pub struct OpenVpnServerResponse {
    pub enabled: bool,
    pub port: Option<u32>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub netmask: Option<String>,
    pub max_mtu: Option<u32>,
    pub require_client_certificate: bool,
}

/// OpenVPN client (PPP secret) response.
#[derive(Debug, Serialize)]
pub struct OpenVpnClientResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub disabled: bool,
    pub comment: Option<String>,
}

/// Certificate response.
#[derive(Debug, Serialize)]
pub struct CertificateResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub common_name: Option<String>,
    pub fingerprint: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub ca: bool,
    pub has_private_key: bool,
    pub expired: bool,
    pub trusted: bool,
}

/// Combined OpenVPN overview.
#[derive(Debug, Serialize)]
pub struct OpenVpnOverviewResponse {
    pub mikrotik_available: bool,
    pub server: Option<OpenVpnServerResponse>,
    pub clients: Vec<OpenVpnClientResponse>,
    pub certificates: Vec<CertificateResponse>,
}

/// Client config export response.
#[derive(Debug, Serialize)]
pub struct OpenVpnClientConfigResponse {
    pub config: String,
    pub filename: String,
}

// ── Request types ───────────────────────────────────────────

/// Update OpenVPN server configuration.
#[derive(Debug, Deserialize)]
pub struct UpdateOpenVpnServerRequest {
    pub enabled: Option<bool>,
    pub port: Option<u32>,
    pub mode: Option<String>,
    pub protocol: Option<String>,
    pub certificate: Option<String>,
    pub default_profile: Option<String>,
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub netmask: Option<String>,
    pub max_mtu: Option<u32>,
    pub require_client_certificate: Option<bool>,
}

/// Create/update OpenVPN client (PPP secret).
#[derive(Debug, Deserialize)]
pub struct OpenVpnClientRequest {
    pub name: String,
    pub password: Option<String>,
    pub service: Option<String>,
    pub profile: Option<String>,
    pub local_address: Option<String>,
    pub remote_address: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
}

fn is_true(val: &Option<String>) -> bool {
    val.as_deref()
        .map(|v| v == "true" || v == "yes")
        .unwrap_or(false)
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/overview
pub async fn overview(
    State(state): State<AppState>,
) -> Result<Json<OpenVpnOverviewResponse>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Ok(Json(OpenVpnOverviewResponse {
            mikrotik_available: false,
            server: None,
            clients: Vec::new(),
            certificates: Vec::new(),
        }));
    };

    let server = match client.ovpn_server_config().await {
        Ok(cfg) => Some(OpenVpnServerResponse {
            enabled: is_true(&cfg.enabled),
            port: cfg.port.and_then(|s| s.parse().ok()),
            mode: cfg.mode,
            protocol: cfg.protocol,
            certificate: cfg.certificate,
            default_profile: cfg.default_profile,
            auth: cfg.auth,
            cipher: cfg.cipher,
            netmask: cfg.netmask,
            max_mtu: cfg.max_mtu.and_then(|s| s.parse().ok()),
            require_client_certificate: is_true(&cfg.require_client_certificate),
        }),
        Err(e) => {
            error!("Failed to fetch OVPN server config: {e}");
            None
        }
    };

    let clients = match client.ppp_secrets().await {
        Ok(secrets) => secrets
            .into_iter()
            .filter(|s| {
                s.service
                    .as_deref()
                    .map(|v| v == "ovpn" || v == "any")
                    .unwrap_or(true)
            })
            .map(|s| OpenVpnClientResponse {
                id: s.id,
                name: s.name,
                service: s.service,
                profile: s.profile,
                local_address: s.local_address,
                remote_address: s.remote_address,
                disabled: is_true(&s.disabled),
                comment: s.comment,
            })
            .collect(),
        Err(e) => {
            error!("Failed to fetch PPP secrets: {e}");
            Vec::new()
        }
    };

    let certificates = match client.certificates().await {
        Ok(certs) => certs
            .into_iter()
            .map(|c| CertificateResponse {
                id: c.id,
                name: c.name,
                common_name: c.common_name,
                fingerprint: c.fingerprint,
                key_size: c.key_size,
                days_valid: c.days_valid,
                invalid_before: c.invalid_before,
                invalid_after: c.invalid_after,
                ca: is_true(&c.ca),
                has_private_key: is_true(&c.private_key),
                expired: is_true(&c.expired),
                trusted: is_true(&c.trusted),
            })
            .collect(),
        Err(e) => {
            error!("Failed to fetch certificates: {e}");
            Vec::new()
        }
    };

    Ok(Json(OpenVpnOverviewResponse {
        mikrotik_available: true,
        server,
        clients,
        certificates,
    }))
}

/// PATCH /api/v1/openvpn/server
pub async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateOpenVpnServerRequest>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    use crate::mikrotik::types::OvpnServerWriteRequest;

    let req = OvpnServerWriteRequest {
        enabled: body
            .enabled
            .map(|b| if b { "true" } else { "false" }.to_string()),
        port: body.port.map(|p| p.to_string()),
        mode: body.mode,
        protocol: body.protocol,
        certificate: body.certificate,
        default_profile: body.default_profile,
        auth: body.auth,
        cipher: body.cipher,
        netmask: body.netmask,
        max_mtu: body.max_mtu.map(|m| m.to_string()),
        require_client_certificate: body
            .require_client_certificate
            .map(|b| if b { "true" } else { "false" }.to_string()),
    };

    client.update_ovpn_server_config(&req).await.map_err(|e| {
        error!("Failed to update OVPN server config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

/// GET /api/v1/openvpn/clients
pub async fn list_clients(
    State(state): State<AppState>,
) -> Result<Json<Vec<OpenVpnClientResponse>>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let secrets = client.ppp_secrets().await.map_err(|e| {
        error!("Failed to fetch PPP secrets: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result: Vec<OpenVpnClientResponse> = secrets
        .into_iter()
        .filter(|s| {
            s.service
                .as_deref()
                .map(|v| v == "ovpn" || v == "any")
                .unwrap_or(true)
        })
        .map(|s| OpenVpnClientResponse {
            id: s.id,
            name: s.name,
            service: s.service,
            profile: s.profile,
            local_address: s.local_address,
            remote_address: s.remote_address,
            disabled: is_true(&s.disabled),
            comment: s.comment,
        })
        .collect();

    Ok(Json(result))
}

/// POST /api/v1/openvpn/clients
pub async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<OpenVpnClientRequest>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    use crate::mikrotik::types::PppSecretWriteRequest;

    let req = PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: body.service.or_else(|| Some("ovpn".to_string())),
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|b| if b { "true" } else { "false" }.to_string()),
    };

    client.create_ppp_secret(&req).await.map_err(|e| {
        error!("Failed to create PPP secret: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

/// PUT /api/v1/openvpn/clients/:id
pub async fn update_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<OpenVpnClientRequest>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    use crate::mikrotik::types::PppSecretWriteRequest;

    let req = PppSecretWriteRequest {
        name: body.name,
        password: body.password,
        service: body.service,
        profile: body.profile,
        local_address: body.local_address,
        remote_address: body.remote_address,
        comment: body.comment,
        disabled: body
            .disabled
            .map(|b| if b { "true" } else { "false" }.to_string()),
    };

    client.update_ppp_secret(&id, &req).await.map_err(|e| {
        error!("Failed to update PPP secret: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::OK)
}

/// DELETE /api/v1/openvpn/clients/:id
pub async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    client.delete_ppp_secret(&id).await.map_err(|e| {
        error!("Failed to delete PPP secret: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/openvpn/certificates
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<CertificateResponse>>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let certs = client.certificates().await.map_err(|e| {
        error!("Failed to fetch certificates: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let result: Vec<CertificateResponse> = certs
        .into_iter()
        .map(|c| CertificateResponse {
            id: c.id,
            name: c.name,
            common_name: c.common_name,
            fingerprint: c.fingerprint,
            key_size: c.key_size,
            days_valid: c.days_valid,
            invalid_before: c.invalid_before,
            invalid_after: c.invalid_after,
            ca: is_true(&c.ca),
            has_private_key: is_true(&c.private_key),
            expired: is_true(&c.expired),
            trusted: is_true(&c.trusted),
        })
        .collect();

    Ok(Json(result))
}

/// GET /api/v1/openvpn/export-config/:client_name
pub async fn export_client_config(
    State(state): State<AppState>,
    Path(client_name): Path<String>,
) -> Result<Json<OpenVpnClientConfigResponse>, StatusCode> {
    let Some(client) = mikrotik_client(&state).await else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    // Get server config to build the client .ovpn file
    let server = client.ovpn_server_config().await.map_err(|e| {
        error!("Failed to fetch OVPN server config: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let router_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    // Extract host from router URL for remote directive
    let remote_host = router_url
        .split("://")
        .nth(1)
        .unwrap_or(&router_url)
        .split(':')
        .next()
        .unwrap_or("router.example.com");

    let port = server.port.as_deref().unwrap_or("1194");
    let protocol = server.protocol.as_deref().unwrap_or("tcp");
    let proto = if protocol == "tcp" {
        "tcp-client"
    } else {
        "udp"
    };
    let cipher = server.cipher.as_deref().unwrap_or("AES-256-CBC");
    // Take first cipher if comma-separated
    let cipher = cipher.split(',').next().unwrap_or("AES-256-CBC");
    let auth = server.auth.as_deref().unwrap_or("SHA1");

    let config = format!(
        r#"client
dev tun
proto {proto}
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
</ca>

# Paste your client certificate between the tags below
<cert>
# Client certificate for {client_name} goes here
</cert>

# Paste your client key between the tags below
<key>
# Client private key for {client_name} goes here
</key>
"#
    );

    Ok(Json(OpenVpnClientConfigResponse {
        config,
        filename: format!("{client_name}.ovpn"),
    }))
}
