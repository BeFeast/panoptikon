use crate::api::AppState;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

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

    // Check VyOS connectivity
    let router_status = match (&state.config.vyos.url, &state.config.vyos.api_key) {
        (Some(url), Some(key)) if !url.contains("192.168.1.1") => {
            let client = crate::vyos::client::VyosClient::new(url, key);
            match client.show(&["system", "host-name"]).await {
                Ok(_) => "connected".to_string(),
                Err(_) => "disconnected".to_string(),
            }
        }
        _ => "unconfigured".to_string(),
    };

    // Latest WAN traffic from traffic_samples (source = 'vyos'), most recent entry
    let (wan_rx_bps, wan_tx_bps): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(rx_bps, 0), COALESCE(tx_bps, 0)
         FROM traffic_samples
         WHERE source = 'vyos'
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
