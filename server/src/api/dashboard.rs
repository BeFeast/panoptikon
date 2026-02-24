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

    // Check router connectivity — try MikroTik first (primary), then VyOS (legacy).
    let router_status = {
        let mut status = "unconfigured".to_string();

        // Try MikroTik first (primary router)
        if let Some(client) = mikrotik_client(&state).await {
            match tokio::time::timeout(Duration::from_secs(5), client.system_resource()).await {
                Ok(Ok(_)) => status = "connected".to_string(),
                _ => status = "disconnected".to_string(),
            }
        }

        // Fall back to VyOS if MikroTik is not configured
        if status == "unconfigured" {
            if let Some(client) =
                super::vyos::get_vyos_client_from_db(&state.db, &state.config, &state.vyos_http)
                    .await
            {
                match tokio::time::timeout(
                    Duration::from_secs(5),
                    client.show(&["system", "uptime"]),
                )
                .await
                {
                    Ok(Ok(_)) => status = "connected".to_string(),
                    _ => status = "disconnected".to_string(),
                }
            }
        }

        status
    };

    // Latest WAN traffic — check both MikroTik and VyOS sources, use the most recent.
    let (wan_rx_bps, wan_tx_bps): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(rx_bps, 0), COALESCE(tx_bps, 0)
         FROM traffic_samples
         WHERE source IN ('vyos', 'mikrotik')
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

/// Try to construct a MikroTik client from saved settings.
async fn mikrotik_client(state: &AppState) -> Option<MikrotikClient> {
    let get_setting = |key: &str| {
        let db = state.db.clone();
        let key = key.to_string();
        async move {
            sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
                .bind(&key)
                .fetch_optional(&db)
                .await
                .ok()
                .flatten()
                .filter(|v| !v.is_empty())
        }
    };

    let enabled = get_setting("mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting("mikrotik_url").await?;
    let user = get_setting("mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting("mikrotik_password").await.unwrap_or_default();

    Some(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        state.mikrotik_http.clone(),
    ))
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
