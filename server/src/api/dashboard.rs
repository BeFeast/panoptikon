use crate::api::AppState;
use crate::mikrotik::client::MikrotikClient;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize)]
pub struct DashboardStats {
    pub router_status: String, // "connected" | "disconnected" | "unconfigured"
    pub devices_online: i64,
    pub devices_total: i64,
    pub alerts_unread: i64,
    pub wan_rx_bps: i64,
    pub wan_tx_bps: i64,
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

/// Check MikroTik router connectivity with a 5-second timeout.
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
    match tokio::time::timeout(Duration::from_secs(5), client.system_resource()).await {
        Ok(Ok(_)) => Some(true),   // connected
        Ok(Err(_)) => Some(false), // configured but unreachable
        Err(_) => Some(false),     // timeout
    }
}

/// Check VyOS router connectivity with a 5-second timeout.
async fn check_vyos(state: &AppState) -> Option<bool> {
    let db_url = get_setting(state, "vyos_url").await;
    let db_key = get_setting(state, "vyos_api_key").await;

    let url = db_url.or_else(|| state.config.vyos.url.clone());
    let key = db_key.or_else(|| state.config.vyos.api_key.clone());

    match (url, key) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => {
            let client = crate::vyos::client::VyosClient::new(&u, &k);
            match tokio::time::timeout(Duration::from_secs(5), client.show(&["system", "uptime"]))
                .await
            {
                Ok(Ok(_)) => Some(true), // connected
                _ => Some(false),        // configured but unreachable
            }
        }
        _ => None, // not configured
    }
}

/// GET /api/v1/dashboard/stats
pub async fn stats(State(state): State<AppState>) -> Json<DashboardStats> {
    let devices_online: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let devices_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    let alerts_unread: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE is_read = 0")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    // Check both MikroTik and VyOS router connectivity in parallel.
    let (mikrotik_result, vyos_result) = tokio::join!(check_mikrotik(&state), check_vyos(&state));

    let router_status = match (mikrotik_result, vyos_result) {
        // Either router is connected → "connected"
        (Some(true), _) | (_, Some(true)) => "connected".to_string(),
        // At least one is configured but not reachable → "disconnected"
        (Some(false), _) | (_, Some(false)) => "disconnected".to_string(),
        // Neither is configured
        _ => "unconfigured".to_string(),
    };

    // Latest WAN traffic — check all sources (mikrotik, netflow, agent),
    // not just 'vyos' which is never inserted.
    let (wan_rx_bps, wan_tx_bps): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(rx_bps, 0), COALESCE(tx_bps, 0)
         FROM traffic_samples
         ORDER BY sampled_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or((0, 0));

    Json(DashboardStats {
        router_status,
        devices_online,
        devices_total,
        alerts_unread,
        wan_rx_bps,
        wan_tx_bps,
    })
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
