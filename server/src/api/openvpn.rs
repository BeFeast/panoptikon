//! OpenVPN Management API endpoints.
//!
//! Provides endpoints for reading/writing the MikroTik OpenVPN server
//! configuration, listing certificates, and exporting client `.ovpn` files.

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

fn is_true(val: &Option<String>) -> bool {
    matches!(val.as_deref(), Some("1") | Some("true"))
}

async fn mikrotik_client(state: &AppState) -> Option<MikrotikClient> {
    let enabled = get_setting(state, "mikrotik_enabled").await;
    if !is_true(&enabled) {
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
pub struct OvpnServerSettingsResponse {
    pub mikrotik_available: bool,
    pub enabled: bool,
    pub port: Option<u32>,
    pub default_profile: Option<String>,
    pub certificate: Option<String>,
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub protocol: Option<String>,
    pub require_client_certificate: bool,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OvpnServerSettingsWriteRequest {
    pub enabled: Option<bool>,
    pub port: Option<u32>,
    pub default_profile: Option<String>,
    pub certificate: Option<String>,
    pub auth: Option<String>,
    pub cipher: Option<String>,
    pub protocol: Option<String>,
    pub require_client_certificate: Option<bool>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Certificate {
    pub name: String,
    pub common_name: Option<String>,
    pub key_type: Option<String>,
    pub key_size: Option<String>,
    pub days_valid: Option<String>,
    pub fingerprint: Option<String>,
    pub ca: bool,
    pub has_private_key: bool,
    pub trusted: bool,
    pub invalid_before: Option<String>,
    pub invalid_after: Option<String>,
    pub expired: bool,
    pub revoked: bool,
    pub serial_number: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OvpnStatusResponse {
    pub mikrotik_available: bool,
    pub settings: Option<OvpnServerSettingsResponse>,
    pub certificates: Vec<Certificate>,
}

// ── Handlers ────────────────────────────────────────────────

/// GET /api/v1/openvpn/status — fetch OpenVPN server settings + certificates
pub async fn openvpn_status(
    State(state): State<AppState>,
) -> Result<Json<OvpnStatusResponse>, AppError> {
    let client = mikrotik_client(&state).await;

    let Some(client) = client else {
        return Ok(Json(OvpnStatusResponse {
            mikrotik_available: false,
            settings: None,
            certificates: vec![],
        }));
    };

    let settings = match client.ovpn_server_settings().await {
        Ok(s) => Some(OvpnServerSettingsResponse {
            mikrotik_available: true,
            enabled: is_true(&s.enabled),
            port: s.port.and_then(|p| p.parse().ok()),
            default_profile: s.default_profile,
            certificate: s.certificate,
            auth: s.auth,
            cipher: s.cipher,
            protocol: s.protocol,
            require_client_certificate: is_true(&s.require_client_certificate),
            mode: s.mode,
        }),
        Err(_) => None,
    };

    let certs = client.certificates().await.unwrap_or_default();
    let certificates: Vec<Certificate> = certs
        .into_iter()
        .map(|c| Certificate {
            name: c.name.unwrap_or_default(),
            common_name: c.common_name,
            key_type: c.key_type,
            key_size: c.key_size,
            days_valid: c.days_valid,
            fingerprint: c.fingerprint,
            ca: is_true(&c.ca),
            has_private_key: is_true(&c.private_key),
            trusted: is_true(&c.trusted),
            invalid_before: c.invalid_before,
            invalid_after: c.invalid_after,
            expired: is_true(&c.expired),
            revoked: is_true(&c.revoked),
            serial_number: c.serial_number,
        })
        .collect();

    Ok(Json(OvpnStatusResponse {
        mikrotik_available: true,
        settings,
        certificates,
    }))
}

/// PATCH /api/v1/openvpn/server — update OpenVPN server settings
pub async fn update_openvpn_server(
    State(state): State<AppState>,
    Json(body): Json<OvpnServerSettingsWriteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await.ok_or_else(|| {
        AppError::ServiceUnavailable("MikroTik integration is not configured".to_string())
    })?;

    let mut update = serde_json::Map::new();

    if let Some(enabled) = body.enabled {
        update.insert(
            "enabled".to_string(),
            serde_json::Value::String(if enabled {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
        );
    }
    if let Some(port) = body.port {
        update.insert(
            "port".to_string(),
            serde_json::Value::String(port.to_string()),
        );
    }
    if let Some(ref profile) = body.default_profile {
        update.insert(
            "default-profile".to_string(),
            serde_json::Value::String(profile.clone()),
        );
    }
    if let Some(ref cert) = body.certificate {
        update.insert(
            "certificate".to_string(),
            serde_json::Value::String(cert.clone()),
        );
    }
    if let Some(ref auth) = body.auth {
        update.insert("auth".to_string(), serde_json::Value::String(auth.clone()));
    }
    if let Some(ref cipher) = body.cipher {
        update.insert(
            "cipher".to_string(),
            serde_json::Value::String(cipher.clone()),
        );
    }
    if let Some(ref protocol) = body.protocol {
        update.insert(
            "protocol".to_string(),
            serde_json::Value::String(protocol.clone()),
        );
    }
    if let Some(require) = body.require_client_certificate {
        update.insert(
            "require-client-certificate".to_string(),
            serde_json::Value::String(if require {
                "yes".to_string()
            } else {
                "no".to_string()
            }),
        );
    }
    if let Some(ref mode) = body.mode {
        update.insert("mode".to_string(), serde_json::Value::String(mode.clone()));
    }

    client
        .update_ovpn_server_settings(&serde_json::Value::Object(update))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /api/v1/openvpn/export-client-config — generate a `.ovpn` client config
pub async fn export_client_config(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let client = mikrotik_client(&state).await.ok_or_else(|| {
        AppError::ServiceUnavailable("MikroTik integration is not configured".to_string())
    })?;

    let settings = client
        .ovpn_server_settings()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mikrotik_url = get_setting(&state, "mikrotik_url")
        .await
        .unwrap_or_default();
    // Extract host from URL (e.g., "https://10.0.0.1" → "10.0.0.1")
    let server_host = mikrotik_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split(':')
        .next()
        .unwrap_or("ROUTER_IP");

    let port = settings.port.as_deref().unwrap_or("1194");
    let protocol = settings.protocol.as_deref().unwrap_or("tcp");
    let cipher = settings.cipher.as_deref().unwrap_or("aes256-cbc");
    let auth = settings.auth.as_deref().unwrap_or("sha1");

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
remote {server_host} {port}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher {ovpn_cipher}
auth {auth}
auth-user-pass
verb 3

# Paste your CA certificate below
# <ca>
# -----BEGIN CERTIFICATE-----
# ... your CA cert here ...
# -----END CERTIFICATE-----
# </ca>
"#,
        protocol = protocol,
        server_host = server_host,
        port = port,
        ovpn_cipher = ovpn_cipher,
        auth = auth,
    );

    Ok(Json(serde_json::json!({
        "config": ovpn_config,
        "filename": format!("panoptikon-{server_host}.ovpn"),
    })))
}
