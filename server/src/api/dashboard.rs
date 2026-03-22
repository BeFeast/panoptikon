use crate::api::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::pfsense::client::{PfsenseAuth, PfsenseClient};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize)]
pub struct DashboardStats {
    pub router_status: String, // "connected" | "disconnected" | "unconfigured"
    pub router_type: String,   // "mikrotik" | "pfsense" | "none"
    pub devices_online: i64,
    pub devices_total: i64,
    pub alerts_unread: i64,
    pub wan_rx_bps: i64,
    pub wan_tx_bps: i64,
    /// Number of critical (infra) devices currently online.
    pub critical_online: i64,
    /// Total number of critical (infra) devices.
    pub critical_total: i64,
}

#[derive(Serialize)]
pub struct TopDevice {
    pub id: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub ip: Option<String>,
    pub vendor: Option<String>,
    pub rx_bps: i64,
    pub tx_bps: i64,
}

#[derive(Deserialize)]
pub struct LimitQuery {
    pub limit: Option<i64>,
}

/// Read a single setting value from the DB.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Dashboard-specific timeout for router connectivity checks (500ms).
const DASHBOARD_ROUTER_TIMEOUT: Duration = Duration::from_millis(500);

/// Check MikroTik router connectivity with a short timeout for the dashboard.
async fn check_mikrotik(state: &AppState) -> Option<bool> {
    let enabled = get_setting(state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None; // not configured
    }

    let url = get_setting(state, "mikrotik_url").await?;
    let user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    let client = MikrotikClient::with_http(&url, &user, &password, state.mikrotik_http.clone());
    match tokio::time::timeout(DASHBOARD_ROUTER_TIMEOUT, client.system_resource()).await {
        Ok(Ok(_)) => Some(true),   // connected
        Ok(Err(_)) => Some(false), // configured but unreachable
        Err(_) => Some(false),     // timeout
    }
}

/// Check pfSense router connectivity with a short timeout for the dashboard.
async fn check_pfsense(state: &AppState) -> Option<bool> {
    let enabled = get_setting(state, "pfsense_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let host = get_setting(state, "pfsense_host").await?;
    let port: u16 = get_setting(state, "pfsense_port")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(22);
    let username = get_setting(state, "pfsense_username")
        .await
        .unwrap_or_else(|| "root".to_string());

    let auth_type = get_setting(state, "pfsense_auth_type")
        .await
        .unwrap_or_else(|| "password".to_string());

    let auth = if auth_type == "key" {
        let key = get_setting(state, "pfsense_private_key").await?;
        PfsenseAuth::Key(key)
    } else {
        let password = get_setting(state, "pfsense_password")
            .await
            .unwrap_or_default();
        PfsenseAuth::Password(password)
    };

    let client = PfsenseClient::new(&host, port, &username, auth);
    match tokio::time::timeout(DASHBOARD_ROUTER_TIMEOUT, async {
        tokio::task::spawn_blocking(move || client.test_connection())
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))
            .and_then(|r| r)
    })
    .await
    {
        Ok(Ok(())) => Some(true),
        Ok(Err(_)) => Some(false),
        Err(_) => Some(false),
    }
}

/// Determine which router is the "active" one based on settings.
/// Returns `("mikrotik" | "pfsense" | "none", Option<bool>)` — router type and
/// connectivity result (None = unconfigured, Some(true) = connected, Some(false) = unreachable).
async fn active_router(state: &AppState) -> (&'static str, Option<bool>) {
    // Check default_router preference first.
    let default_router = get_setting(state, "default_router").await;

    // If user explicitly chose pfSense as default, try it first.
    if default_router.as_deref() == Some("pfsense") {
        let result = check_pfsense(state).await;
        if result.is_some() {
            return ("pfsense", result);
        }
    }

    // MikroTik: check if enabled.
    let mikrotik_enabled = get_setting(state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    if mikrotik_enabled {
        return ("mikrotik", check_mikrotik(state).await);
    }

    // pfSense fallback (if not already tried above).
    if default_router.as_deref() != Some("pfsense") {
        let result = check_pfsense(state).await;
        if result.is_some() {
            return ("pfsense", result);
        }
    }

    ("none", None)
}

/// GET /api/v1/dashboard/stats
///
/// Fetches all dashboard data concurrently so the response is never blocked
/// by a slow or offline router.  DB queries and router connectivity check
/// run in parallel via `tokio::join!`.
pub async fn stats(State(state): State<AppState>) -> Json<DashboardStats> {
    // Phase 1: run DB counts and the router check concurrently.
    let (
        devices_online,
        devices_total,
        alerts_unread,
        critical_online,
        critical_total,
        (router_type, ping_result),
    ) = tokio::join!(
        async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM devices WHERE is_online = 1")
                .fetch_one(&state.db)
                .await
                .unwrap_or(0)
        },
        async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM devices")
                .fetch_one(&state.db)
                .await
                .unwrap_or(0)
        },
        async {
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM alerts WHERE is_read = 0")
                .fetch_one(&state.db)
                .await
                .unwrap_or(0)
        },
        async {
            let q = format!(
                "SELECT COUNT(*) FROM devices WHERE is_online = 1 AND ({AUTO_INFRA_CONDITION})"
            );
            sqlx::query_scalar::<_, i64>(&q)
                .fetch_one(&state.db)
                .await
                .unwrap_or(0)
        },
        async {
            let q = format!("SELECT COUNT(*) FROM devices WHERE ({AUTO_INFRA_CONDITION})");
            sqlx::query_scalar::<_, i64>(&q)
                .fetch_one(&state.db)
                .await
                .unwrap_or(0)
        },
        active_router(&state),
    );

    let router_status = match ping_result {
        Some(true) => "connected".to_string(),
        Some(false) => "disconnected".to_string(),
        None => "unconfigured".to_string(),
    };

    // Phase 2: WAN traffic lookup (fast DB query, depends on router_type).
    let (wan_rx_bps, wan_tx_bps): (i64, i64) = if router_type != "none" {
        sqlx::query_as(
            "SELECT COALESCE(rx_bps, 0), COALESCE(tx_bps, 0)
             FROM traffic_samples
             WHERE source = ?
             ORDER BY sampled_at DESC LIMIT 1",
        )
        .bind(router_type)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None)
        .unwrap_or((0, 0))
    } else {
        sqlx::query_as(
            "SELECT COALESCE(rx_bps, 0), COALESCE(tx_bps, 0)
             FROM traffic_samples
             ORDER BY sampled_at DESC LIMIT 1",
        )
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None)
        .unwrap_or((0, 0))
    };

    Json(DashboardStats {
        router_status,
        router_type: router_type.to_string(),
        devices_online,
        devices_total,
        alerts_unread,
        wan_rx_bps,
        wan_tx_bps,
        critical_online,
        critical_total,
    })
}

/// A single critical device returned by the critical-devices endpoint.
#[derive(Serialize)]
pub struct CriticalDevice {
    pub id: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub ip: Option<String>,
    pub vendor: Option<String>,
    pub device_type: Option<String>,
    pub is_online: bool,
    pub last_seen_at: Option<String>,
    /// How the device was classified: "pinned" or "auto".
    pub classification: String,
}

/// SQL condition for auto-detected infrastructure devices (when is_critical IS NULL).
const AUTO_INFRA_CONDITION: &str = r#"
    (is_critical = 1)
    OR (
        is_critical IS NULL
        AND (
            COALESCE(custom_type, device_type) IN ('router', 'switch', 'access_point', 'server', 'nas', 'ups', 'workstation')
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*synology*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*qnap*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*supermicro*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*ubiquiti*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*unifi*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*mikrotik*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*cisco*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*juniper*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*aruba*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*fortinet*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*truenas*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*freenas*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*ixsystems*'
            OR LOWER(COALESCE(custom_vendor, vendor, '')) GLOB '*asustor*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*server*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*nas*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*proxmox*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*pve*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*truenas*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*docker*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*router*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*gateway*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*switch*'
            OR LOWER(COALESCE(hostname, '')) GLOB '*firewall*'
        )
    )
"#;

/// GET /api/v1/dashboard/critical-devices
///
/// Returns the list of devices that make up the Infrastructure Health metric.
pub async fn critical_devices(State(state): State<AppState>) -> Json<Vec<CriticalDevice>> {
    let q = format!(
        r#"SELECT d.id, COALESCE(d.custom_name, d.name) AS name, d.hostname,
                  di.ip, COALESCE(d.custom_vendor, d.vendor) AS vendor,
                  COALESCE(d.custom_type, d.device_type) AS device_type,
                  d.is_online, d.last_seen_at, d.is_critical
           FROM devices d
           LEFT JOIN device_ips di ON di.device_id = d.id AND di.is_current = 1
           WHERE ({AUTO_INFRA_CONDITION})
           ORDER BY d.is_online DESC, COALESCE(d.custom_name, d.name, d.hostname, d.id)"#
    );

    #[allow(clippy::type_complexity)]
    let rows: Vec<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        bool,
        Option<String>,
        Option<i32>,
    )> = sqlx::query_as(&q)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    Json(
        rows.into_iter()
            .map(
                |(
                    id,
                    name,
                    hostname,
                    ip,
                    vendor,
                    device_type,
                    is_online,
                    last_seen_at,
                    is_critical,
                )| {
                    CriticalDevice {
                        id,
                        name,
                        hostname,
                        ip,
                        vendor,
                        device_type,
                        is_online,
                        last_seen_at,
                        classification: if is_critical == Some(1) {
                            "pinned".to_string()
                        } else {
                            "auto".to_string()
                        },
                    }
                },
            )
            .collect(),
    )
}

/// GET /api/v1/dashboard/top-devices?limit=5
pub async fn top_devices(
    State(state): State<AppState>,
    Query(q): Query<LimitQuery>,
) -> Json<Vec<TopDevice>> {
    let limit = q.limit.unwrap_or(5);

    // Join devices with their latest traffic sample
    #[allow(clippy::type_complexity)]
    let rows: Vec<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        i64,
    )> = sqlx::query_as(
        "SELECT d.id, d.name, d.hostname, di.ip, d.vendor,
                    COALESCE(ts.rx_bps, 0) as rx_bps,
                    COALESCE(ts.tx_bps, 0) as tx_bps
             FROM devices d
             LEFT JOIN device_ips di ON di.device_id = d.id AND di.is_current = 1
             LEFT JOIN (
                 SELECT device_id, rx_bps, tx_bps,
                        ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY sampled_at DESC) as rn
                 FROM traffic_samples
             ) ts ON ts.device_id = d.id AND ts.rn = 1
             WHERE d.is_online = 1
             ORDER BY (COALESCE(ts.rx_bps, 0) + COALESCE(ts.tx_bps, 0)) DESC
             LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(
        rows.into_iter()
            .map(
                |(id, name, hostname, ip, vendor, rx_bps, tx_bps)| TopDevice {
                    id,
                    name,
                    hostname,
                    ip,
                    vendor,
                    rx_bps,
                    tx_bps,
                },
            )
            .collect(),
    )
}
