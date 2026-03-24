//! DNS Security settings — DoT (DNS-over-TLS) and DNSSEC configuration.
//!
//! Stores settings in the key-value `settings` table:
//! - `dot_enabled`       — "true" / "false"
//! - `dot_servers`       — JSON array of DoT upstream server objects
//! - `dnssec_enabled`    — "true" / "false"

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::{AppError, AppState};

// ─── DTOs ──────────────────────────────────────────────────

/// A single DoT upstream server entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DotServer {
    /// Server address (IP or hostname), e.g. "1.1.1.1" or "dns.google".
    pub address: String,
    /// TLS port (default 853).
    #[serde(default = "default_dot_port")]
    pub port: u16,
    /// Friendly name for display, e.g. "Cloudflare".
    #[serde(default)]
    pub name: String,
    /// Whether this upstream is active.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_dot_port() -> u16 {
    853
}

fn default_true() -> bool {
    true
}

/// Response from GET /api/v1/dns-security.
#[derive(Debug, Serialize)]
pub struct DnsSecurityResponse {
    pub dot_enabled: bool,
    pub dot_servers: Vec<DotServer>,
    pub dnssec_enabled: bool,
}

/// Request body for PATCH /api/v1/dns-security.
#[derive(Debug, Deserialize)]
pub struct DnsSecurityUpdateRequest {
    #[serde(default)]
    pub dot_enabled: Option<bool>,
    #[serde(default)]
    pub dot_servers: Option<Vec<DotServer>>,
    #[serde(default)]
    pub dnssec_enabled: Option<bool>,
}

// ─── Helpers ───────────────────────────────────────────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

async fn set_setting(state: &AppState, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to set setting {key}: {e}");
            AppError::Internal(e.to_string())
        })?;
    Ok(())
}

// ─── Handlers ──────────────────────────────────────────────

/// GET /api/v1/dns-security — return current DoT + DNSSEC settings.
pub async fn get_dns_security(
    State(state): State<AppState>,
) -> Result<Json<DnsSecurityResponse>, AppError> {
    let dot_enabled = get_setting(&state, "dot_enabled")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);

    let dot_servers: Vec<DotServer> = get_setting(&state, "dot_servers")
        .await
        .and_then(|v| serde_json::from_str(&v).ok())
        .unwrap_or_default();

    let dnssec_enabled = get_setting(&state, "dnssec_enabled")
        .await
        .map(|v| v == "true")
        .unwrap_or(false);

    Ok(Json(DnsSecurityResponse {
        dot_enabled,
        dot_servers,
        dnssec_enabled,
    }))
}

/// PATCH /api/v1/dns-security — update DoT + DNSSEC settings.
pub async fn update_dns_security(
    State(state): State<AppState>,
    Json(body): Json<DnsSecurityUpdateRequest>,
) -> Result<Json<DnsSecurityResponse>, AppError> {
    if let Some(enabled) = body.dot_enabled {
        set_setting(
            &state,
            "dot_enabled",
            if enabled { "true" } else { "false" },
        )
        .await?;
        info!(dot_enabled = enabled, "Updated DoT enabled setting");
    }

    if let Some(ref servers) = body.dot_servers {
        let json = serde_json::to_string(servers).map_err(|e| {
            error!("Failed to serialize DoT servers: {e}");
            AppError::Internal(e.to_string())
        })?;
        set_setting(&state, "dot_servers", &json).await?;
        info!(count = servers.len(), "Updated DoT upstream servers");
    }

    if let Some(enabled) = body.dnssec_enabled {
        set_setting(
            &state,
            "dnssec_enabled",
            if enabled { "true" } else { "false" },
        )
        .await?;
        info!(dnssec_enabled = enabled, "Updated DNSSEC enabled setting");
    }

    // Return updated state.
    get_dns_security(State(state)).await
}
