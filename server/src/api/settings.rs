use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use crate::{netflow, webhook};

/// Settings object returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub webhook_url: Option<String>,
    pub vyos_url: Option<String>,
    /// Masked API key — never return the full key to the frontend.
    pub vyos_api_key_set: bool,
    // --- Network Scanner ---
    pub scan_interval_seconds: Option<u64>,
    pub scan_subnets: Option<String>,
    pub ping_sweep_enabled: Option<bool>,
    // --- Data Retention ---
    pub retention_traffic_hours: Option<u64>,
    pub retention_alerts_days: Option<u64>,
    pub retention_agent_reports_days: Option<u64>,
    // --- Speed Test ---
    pub speedtest_retention_days: Option<u64>,
    pub speedtest_auto_interval_hours: Option<u64>,
    // --- Nginx Proxy Manager ---
    pub npm_url: Option<String>,
    pub npm_email: Option<String>,
    /// Never return the password to the frontend — just whether one is set.
    pub npm_password_set: bool,
    // --- MikroTik ---
    pub mikrotik_url: Option<String>,
    pub mikrotik_user: Option<String>,
    /// Never return the password to the frontend — just whether one is set.
    pub mikrotik_password_set: bool,
    pub mikrotik_enabled: bool,
    // --- Unbound DNS ---
    pub unbound_control_path: Option<String>,
    // --- Caddy Reverse Proxy ---
    pub caddy_admin_url: Option<String>,
    // --- Xiaomi Mesh ---
    pub xiaomi_mesh_enabled: bool,
    pub xiaomi_mesh_ip: Option<String>,
    /// Never return the password to the frontend — just whether one is set.
    pub xiaomi_mesh_password_set: bool,
    pub xiaomi_mesh_poll_interval: Option<u64>,
    /// Optional proxy host (IP:port) for reaching the Xiaomi router when direct
    /// access is blocked (e.g. router filters port 80 from non-DHCP clients).
    pub xiaomi_mesh_proxy_host: Option<String>,
    // --- Cloudflare Tunnel ---
    pub cloudflare_api_token_set: bool,
    pub cloudflare_account_id: Option<String>,
    pub cloudflare_tunnel_id: Option<String>,
    // --- Advanced / Legacy ---
    pub show_legacy_routers: bool,
}

/// Request body for updating settings.
#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub webhook_url: Option<String>,
    pub vyos_url: Option<String>,
    pub vyos_api_key: Option<String>,
    // --- Network Scanner ---
    pub scan_interval_seconds: Option<u64>,
    pub scan_subnets: Option<String>,
    pub ping_sweep_enabled: Option<bool>,
    // --- Data Retention ---
    pub retention_traffic_hours: Option<u64>,
    pub retention_alerts_days: Option<u64>,
    pub retention_agent_reports_days: Option<u64>,
    // --- Speed Test ---
    pub speedtest_retention_days: Option<u64>,
    pub speedtest_auto_interval_hours: Option<u64>,
    // --- Nginx Proxy Manager ---
    pub npm_url: Option<String>,
    pub npm_email: Option<String>,
    pub npm_password: Option<String>,
    // --- MikroTik ---
    pub mikrotik_url: Option<String>,
    pub mikrotik_user: Option<String>,
    pub mikrotik_password: Option<String>,
    pub mikrotik_enabled: Option<bool>,
    // --- Unbound DNS ---
    pub unbound_control_path: Option<String>,
    // --- Caddy Reverse Proxy ---
    pub caddy_admin_url: Option<String>,
    // --- Xiaomi Mesh ---
    pub xiaomi_mesh_enabled: Option<bool>,
    pub xiaomi_mesh_ip: Option<String>,
    pub xiaomi_mesh_password: Option<String>,
    pub xiaomi_mesh_poll_interval: Option<u64>,
    pub xiaomi_mesh_proxy_host: Option<String>,
    // --- Cloudflare Tunnel ---
    pub cloudflare_api_token: Option<String>,
    pub cloudflare_account_id: Option<String>,
    pub cloudflare_tunnel_id: Option<String>,
    // --- Advanced / Legacy ---
    pub show_legacy_routers: Option<bool>,
}

/// Helper: read a string setting from the settings table.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// GET /api/v1/settings — return current settings.
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    let webhook_url = webhook::get_webhook_url(&state.db).await;

    // Keep legacy compatibility: if DB settings are absent, fall back to
    // values from panoptikon.toml so existing VyOS setups remain detected.
    let vyos_url = get_setting(&state, "vyos_url").await.or_else(|| {
        state
            .config
            .vyos
            .url
            .clone()
            .filter(|v| !v.trim().is_empty())
    });

    let vyos_api_key_set = get_setting(&state, "vyos_api_key")
        .await
        .or_else(|| {
            state
                .config
                .vyos
                .api_key
                .clone()
                .filter(|v| !v.trim().is_empty())
        })
        .is_some();

    // Network Scanner settings (fall back to config defaults).
    let scan_interval_seconds = get_setting(&state, "scan_interval_seconds")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.scanner.interval_seconds));

    let scan_subnets = get_setting(&state, "scan_subnets")
        .await
        .or_else(|| Some(state.config.scanner.subnets.join(",")));

    let ping_sweep_enabled = get_setting(&state, "ping_sweep_enabled")
        .await
        .map(|v| v == "true")
        .or(Some(true));

    // Data Retention settings (fall back to config defaults).
    let retention_traffic_hours = get_setting(&state, "retention_traffic_hours")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.traffic_samples_hours));

    let retention_alerts_days = get_setting(&state, "retention_alerts_days")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.alerts_days));

    let retention_agent_reports_days = get_setting(&state, "retention_agent_reports_days")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(state.config.retention.agent_reports_days));

    // Speed Test settings.
    let speedtest_retention_days = get_setting(&state, "speedtest_retention_days")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(90));

    let speedtest_auto_interval_hours = get_setting(&state, "speedtest_auto_interval_hours")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(0));

    // Nginx Proxy Manager settings.
    let npm_url = get_setting(&state, "npm_url").await;
    let npm_email = get_setting(&state, "npm_email").await;
    let npm_password_set = get_setting(&state, "npm_password").await.is_some();

    // MikroTik settings.
    let mikrotik_url = get_setting(&state, "mikrotik_url").await;
    let mikrotik_user = get_setting(&state, "mikrotik_user").await;
    let mikrotik_password_set = get_setting(&state, "mikrotik_password").await.is_some();
    let mikrotik_enabled = get_setting(&state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(true);

    // Unbound DNS settings.
    let unbound_control_path = get_setting(&state, "unbound_control_path").await;

    // Caddy settings.
    let caddy_admin_url = get_setting(&state, "caddy_admin_url").await;

    // Xiaomi Mesh settings.
    let xiaomi_mesh_enabled = get_setting(&state, "xiaomi_mesh_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    let xiaomi_mesh_ip = get_setting(&state, "xiaomi_mesh_ip").await;
    let xiaomi_mesh_password_set = get_setting(&state, "xiaomi_mesh_password").await.is_some();
    let xiaomi_mesh_poll_interval = get_setting(&state, "xiaomi_mesh_poll_interval")
        .await
        .and_then(|v| v.parse().ok())
        .or(Some(30));
    let xiaomi_mesh_proxy_host = get_setting(&state, "xiaomi_mesh_proxy_host").await;

    // Cloudflare Tunnel settings.
    let cloudflare_api_token_set = get_setting(&state, "cloudflare_api_token").await.is_some();
    let cloudflare_account_id = get_setting(&state, "cloudflare_account_id").await;
    let cloudflare_tunnel_id = get_setting(&state, "cloudflare_tunnel_id").await;

    // Advanced / Legacy settings.
    let show_legacy_routers = get_setting(&state, "show_legacy_routers")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    Ok(Json(SettingsResponse {
        webhook_url,
        vyos_url,
        vyos_api_key_set,
        scan_interval_seconds,
        scan_subnets,
        ping_sweep_enabled,
        retention_traffic_hours,
        retention_alerts_days,
        retention_agent_reports_days,
        speedtest_retention_days,
        speedtest_auto_interval_hours,
        npm_url,
        npm_email,
        npm_password_set,
        mikrotik_url,
        mikrotik_user,
        mikrotik_password_set,
        mikrotik_enabled,
        unbound_control_path,
        caddy_admin_url,
        xiaomi_mesh_enabled,
        xiaomi_mesh_ip,
        xiaomi_mesh_password_set,
        xiaomi_mesh_poll_interval,
        xiaomi_mesh_proxy_host,
        cloudflare_api_token_set,
        cloudflare_account_id,
        cloudflare_tunnel_id,
        show_legacy_routers,
    }))
}

/// PATCH /api/v1/settings — update settings.
pub async fn update_settings(
    State(state): State<AppState>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Result<Json<SettingsResponse>, StatusCode> {
    if let Some(ref url) = body.webhook_url {
        upsert_setting(&state, "webhook_url", url).await?;
        info!(webhook_url = %url, "Webhook URL updated");
    }

    if let Some(ref url) = body.vyos_url {
        upsert_setting(&state, "vyos_url", url).await?;
        info!(vyos_url = %url, "VyOS URL updated");
    }

    if let Some(ref key) = body.vyos_api_key {
        // NOTE: The VyOS API key is stored unencrypted in SQLite.
        // This is intentional for a single-user self-hosted deployment where
        // the database file is protected by OS filesystem permissions and the
        // server requires authentication to read or modify settings.
        // TODO: Add at-rest encryption (e.g. AES-GCM with a server-generated
        // key stored outside the database) if multi-user or remote DB support
        // is added in the future.
        upsert_setting(&state, "vyos_api_key", key).await?;
        info!("VyOS API key updated");
    }

    // --- Network Scanner settings ---
    if let Some(interval) = body.scan_interval_seconds {
        upsert_setting(&state, "scan_interval_seconds", &interval.to_string()).await?;
        info!(scan_interval_seconds = interval, "Scan interval updated");
    }

    if let Some(ref subnets) = body.scan_subnets {
        upsert_setting(&state, "scan_subnets", subnets).await?;
        info!(scan_subnets = %subnets, "Scan subnets updated");
    }

    if let Some(enabled) = body.ping_sweep_enabled {
        upsert_setting(&state, "ping_sweep_enabled", &enabled.to_string()).await?;
        info!(ping_sweep_enabled = enabled, "Ping sweep toggle updated");
    }

    // --- Data Retention settings ---
    if let Some(hours) = body.retention_traffic_hours {
        upsert_setting(&state, "retention_traffic_hours", &hours.to_string()).await?;
        info!(retention_traffic_hours = hours, "Traffic retention updated");
    }

    if let Some(days) = body.retention_alerts_days {
        upsert_setting(&state, "retention_alerts_days", &days.to_string()).await?;
        info!(retention_alerts_days = days, "Alerts retention updated");
    }

    if let Some(days) = body.retention_agent_reports_days {
        upsert_setting(&state, "retention_agent_reports_days", &days.to_string()).await?;
        info!(
            retention_agent_reports_days = days,
            "Agent reports retention updated"
        );
    }

    // --- Speed Test settings ---
    if let Some(days) = body.speedtest_retention_days {
        upsert_setting(&state, "speedtest_retention_days", &days.to_string()).await?;
        info!(
            speedtest_retention_days = days,
            "Speedtest retention updated"
        );
    }

    if let Some(hours) = body.speedtest_auto_interval_hours {
        upsert_setting(&state, "speedtest_auto_interval_hours", &hours.to_string()).await?;
        info!(
            speedtest_auto_interval_hours = hours,
            "Speedtest auto-run interval updated"
        );
    }

    // --- Nginx Proxy Manager settings ---
    if let Some(ref url) = body.npm_url {
        upsert_setting(&state, "npm_url", url).await?;
        info!(npm_url = %url, "NPM URL updated");
    }

    if let Some(ref email) = body.npm_email {
        upsert_setting(&state, "npm_email", email).await?;
        info!(npm_email = %email, "NPM email updated");
    }

    if let Some(ref password) = body.npm_password {
        upsert_setting(&state, "npm_password", password).await?;
        info!("NPM password updated");
    }

    // --- MikroTik settings ---
    if let Some(ref url) = body.mikrotik_url {
        upsert_setting(&state, "mikrotik_url", url).await?;
        info!(mikrotik_url = %url, "MikroTik URL updated");
    }

    if let Some(ref user) = body.mikrotik_user {
        upsert_setting(&state, "mikrotik_user", user).await?;
        info!(mikrotik_user = %user, "MikroTik user updated");
    }

    if let Some(ref password) = body.mikrotik_password {
        upsert_setting(&state, "mikrotik_password", password).await?;
        info!("MikroTik password updated");
    }

    if let Some(enabled) = body.mikrotik_enabled {
        upsert_setting(&state, "mikrotik_enabled", if enabled { "1" } else { "0" }).await?;
        info!(
            mikrotik_enabled = enabled,
            "MikroTik enabled toggle updated"
        );
    }

    // --- Unbound DNS settings ---
    if let Some(ref path) = body.unbound_control_path {
        upsert_setting(&state, "unbound_control_path", path).await?;
        info!(unbound_control_path = %path, "Unbound control path updated");
    }

    // --- Caddy Reverse Proxy settings ---
    if let Some(ref url) = body.caddy_admin_url {
        upsert_setting(&state, "caddy_admin_url", url).await?;
        info!(caddy_admin_url = %url, "Caddy admin URL updated");
    }

    // --- Xiaomi Mesh settings ---
    if let Some(enabled) = body.xiaomi_mesh_enabled {
        upsert_setting(
            &state,
            "xiaomi_mesh_enabled",
            if enabled { "1" } else { "0" },
        )
        .await?;
        info!(
            xiaomi_mesh_enabled = enabled,
            "Xiaomi Mesh enabled toggle updated"
        );
    }

    if let Some(ref ip) = body.xiaomi_mesh_ip {
        upsert_setting(&state, "xiaomi_mesh_ip", ip).await?;
        info!(xiaomi_mesh_ip = %ip, "Xiaomi Mesh IP updated");
    }

    if let Some(ref password) = body.xiaomi_mesh_password {
        upsert_setting(&state, "xiaomi_mesh_password", password).await?;
        info!("Xiaomi Mesh password updated");
    }

    if let Some(interval) = body.xiaomi_mesh_poll_interval {
        upsert_setting(&state, "xiaomi_mesh_poll_interval", &interval.to_string()).await?;
        info!(
            xiaomi_mesh_poll_interval = interval,
            "Xiaomi Mesh poll interval updated"
        );
    }

    if let Some(ref proxy_host) = body.xiaomi_mesh_proxy_host {
        upsert_setting(&state, "xiaomi_mesh_proxy_host", proxy_host).await?;
        info!(xiaomi_mesh_proxy_host = %proxy_host, "Xiaomi Mesh proxy host updated");
    }

    // --- Cloudflare Tunnel settings ---
    if let Some(ref token) = body.cloudflare_api_token {
        upsert_setting(&state, "cloudflare_api_token", token).await?;
        info!("Cloudflare API token updated");
    }

    if let Some(ref account_id) = body.cloudflare_account_id {
        upsert_setting(&state, "cloudflare_account_id", account_id).await?;
        info!(cloudflare_account_id = %account_id, "Cloudflare account ID updated");
    }

    if let Some(ref tunnel_id) = body.cloudflare_tunnel_id {
        upsert_setting(&state, "cloudflare_tunnel_id", tunnel_id).await?;
        info!(cloudflare_tunnel_id = %tunnel_id, "Cloudflare tunnel ID updated");
    }

    // --- Advanced / Legacy settings ---
    if let Some(enabled) = body.show_legacy_routers {
        upsert_setting(
            &state,
            "show_legacy_routers",
            if enabled { "1" } else { "0" },
        )
        .await?;
        info!(
            show_legacy_routers = enabled,
            "Show legacy routers toggle updated"
        );
    }

    // Return current state.
    get_settings(State(state)).await
}

/// POST /api/v1/settings/test-webhook — send a test webhook.
///
/// Uses the same format auto-detection as real alerts, so the test message
/// will appear correctly in Discord, ntfy.sh, Telegram, or generic endpoints.
pub async fn test_webhook(
    State(state): State<AppState>,
) -> Result<StatusCode, (StatusCode, String)> {
    let url = webhook::get_webhook_url(&state.db).await.ok_or((
        StatusCode::BAD_REQUEST,
        "No webhook URL configured".to_string(),
    ))?;

    let data = serde_json::json!({
        "message": "Panoptikon webhook test — if you see this, webhooks are working!",
    });

    // For test, we actually await the result so we can report success/failure.
    webhook::send_alert_webhook(&url, "test", &data).await;

    Ok(StatusCode::NO_CONTENT)
}

/// Response for the netflow-status endpoint.
#[derive(Debug, Serialize)]
pub struct NetflowStatusResponse {
    pub enabled: bool,
    pub port: u16,
    pub flows_received: u64,
}

/// GET /api/v1/settings/netflow-status — return NetFlow collector status.
pub async fn netflow_status(State(state): State<AppState>) -> Json<NetflowStatusResponse> {
    Json(NetflowStatusResponse {
        enabled: state.config.scanner.netflow_enabled,
        port: state.config.scanner.netflow_port,
        flows_received: netflow::flows_received(),
    })
}

/// Response for the db-size endpoint.
#[derive(Debug, Serialize)]
pub struct DbSizeResponse {
    pub size_bytes: u64,
}

/// GET /api/v1/settings/db-size — return the current database file size.
pub async fn db_size(State(state): State<AppState>) -> Result<Json<DbSizeResponse>, StatusCode> {
    // Use SQLite's page_count * page_size to get the logical size.
    let page_count: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get page_count: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let page_size: i64 = sqlx::query_scalar("PRAGMA page_size")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get page_size: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let size_bytes = (page_count * page_size) as u64;
    Ok(Json(DbSizeResponse { size_bytes }))
}

/// POST /api/v1/settings/vacuum — manually trigger a database VACUUM.
pub async fn vacuum(State(state): State<AppState>) -> Result<StatusCode, (StatusCode, String)> {
    info!("Manual VACUUM requested");

    // Checkpoint WAL first.
    if let Err(e) = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&state.db)
        .await
    {
        error!("WAL checkpoint failed: {e}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("WAL checkpoint failed: {e}"),
        ));
    }

    // Run VACUUM.
    if let Err(e) = sqlx::query("VACUUM").execute(&state.db).await {
        error!("VACUUM failed: {e}");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("VACUUM failed: {e}"),
        ));
    }

    // Update last_vacuum_at.
    let _ = sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES ('last_vacuum_at', datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = datetime('now')"#,
    )
    .execute(&state.db)
    .await;

    info!("Manual VACUUM completed successfully");
    Ok(StatusCode::NO_CONTENT)
}

/// Helper to upsert a key-value pair into the settings table.
async fn upsert_setting(state: &AppState, key: &str, value: &str) -> Result<(), StatusCode> {
    sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
    )
    .bind(key)
    .bind(value)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to save setting '{key}': {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(())
}
