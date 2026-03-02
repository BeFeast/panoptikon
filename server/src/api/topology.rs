use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::error;

use super::AppState;
use crate::mikrotik::client::MikrotikClient;

/// A single node's persisted position.
#[derive(Debug, Serialize, Deserialize)]
pub struct NodePosition {
    pub node_id: String,
    pub x: f64,
    pub y: f64,
    pub pinned: bool,
}

/// GET /api/v1/topology/positions — return all saved node positions.
pub async fn get_positions(
    State(state): State<AppState>,
) -> Result<Json<Vec<NodePosition>>, StatusCode> {
    let rows = sqlx::query_as::<_, (String, f64, f64, i32)>(
        "SELECT node_id, x, y, pinned FROM topology_positions",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch topology positions: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let positions = rows
        .into_iter()
        .map(|(node_id, x, y, pinned)| NodePosition {
            node_id,
            x,
            y,
            pinned: pinned != 0,
        })
        .collect();

    Ok(Json(positions))
}

/// Request body for saving positions — a list of node positions.
#[derive(Debug, Deserialize)]
pub struct SavePositionsRequest {
    pub positions: Vec<NodePosition>,
}

/// PUT /api/v1/topology/positions — save (upsert) node positions.
pub async fn save_positions(
    State(state): State<AppState>,
    Json(body): Json<SavePositionsRequest>,
) -> Result<StatusCode, StatusCode> {
    for pos in &body.positions {
        sqlx::query(
            "INSERT INTO topology_positions (node_id, x, y, pinned) VALUES (?, ?, ?, ?)
             ON CONFLICT(node_id) DO UPDATE SET x = excluded.x, y = excluded.y, pinned = excluded.pinned",
        )
        .bind(&pos.node_id)
        .bind(pos.x)
        .bind(pos.y)
        .bind(pos.pinned as i32)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to save topology position for '{}': {e}", pos.node_id);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/topology/positions — clear all saved positions (reset layout).
pub async fn delete_positions(State(state): State<AppState>) -> Result<StatusCode, StatusCode> {
    sqlx::query("DELETE FROM topology_positions")
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to clear topology positions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Topology Graph endpoint ─────────────────────────────────────────

/// A lightweight device node for the topology graph.
#[derive(Debug, Serialize)]
pub struct TopologyDevice {
    pub id: String,
    pub mac: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub is_online: bool,
    pub ips: Vec<String>,
    pub custom_name: Option<String>,
    pub custom_type: Option<String>,
    pub custom_vendor: Option<String>,
    pub device_type: Option<String>,
    pub device_model: Option<String>,
    pub device_brand: Option<String>,
    pub mdns_services: Option<String>,
    pub icon: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub os_family: Option<String>,
    pub os_version: Option<String>,
    pub location: Option<String>,
    pub owner: Option<String>,
    pub tags: Option<String>,
    pub rx_bps: i64,
    pub tx_bps: i64,
    /// DHCP lease status (e.g. "bound", "waiting") — enriched from router DHCP
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dhcp_lease_status: Option<String>,
    /// DHCP server name that issued the lease
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dhcp_server: Option<String>,
    /// DHCP lease expiry / remaining time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dhcp_expires: Option<String>,
    /// DHCP hostname (reported by the client to the DHCP server)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dhcp_hostname: Option<String>,
    /// Bridge port this device was last seen on (from MikroTik bridge host table)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_port: Option<String>,
    /// Bridge name (from MikroTik bridge host table)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bridge_name: Option<String>,
}

/// Router info for the topology hub node.
#[derive(Debug, Serialize)]
pub struct TopologyRouter {
    pub router_type: String, // "mikrotik" | "unknown"
    pub is_online: bool,
    pub wan_ip: Option<String>,
    pub hostname: Option<String>,
    pub version: Option<String>,
}

/// The complete topology graph response — all data needed for the visualization.
#[derive(Debug, Serialize)]
pub struct TopologyGraph {
    pub devices: Vec<TopologyDevice>,
    pub router: TopologyRouter,
    pub positions: Vec<NodePosition>,
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

/// GET /api/v1/topology/graph — return the complete topology graph in a single call.
///
/// Aggregates devices (from DB), traffic data, DHCP leases and bridge hosts
/// (from MikroTik, if configured), router interfaces, and saved positions.
pub async fn graph(State(state): State<AppState>) -> Result<Json<TopologyGraph>, StatusCode> {
    // 1. Fetch devices with traffic data from the database
    let rows = sqlx::query(
        r#"
        SELECT d.id, d.mac, d.name, d.hostname, d.vendor,
               COALESCE(d.icon, 'device') AS icon,
               d.is_online,
               d.mdns_services,
               d.custom_name, d.custom_type, d.custom_vendor,
               d.device_type, d.device_model, d.device_brand,
               d.first_seen_at, d.last_seen_at,
               d.os_family, d.os_version,
               d.location, d.owner, d.tags,
               COALESCE(ts.rx_bps, 0) AS rx_bps,
               COALESCE(ts.tx_bps, 0) AS tx_bps
        FROM devices d
        LEFT JOIN (
            SELECT device_id, rx_bps, tx_bps,
                   ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY sampled_at DESC) AS rn
            FROM traffic_samples
        ) ts ON ts.device_id = d.id AND ts.rn = 1
        ORDER BY d.last_seen_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch topology devices: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Fetch current IPs
    let ip_rows = sqlx::query("SELECT device_id, ip FROM device_ips WHERE is_current = 1")
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    // Group IPs by device_id
    let mut ip_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for row in &ip_rows {
        let device_id: String = row.try_get("device_id").unwrap_or_default();
        let ip: String = row.try_get("ip").unwrap_or_default();
        ip_map.entry(device_id).or_default().push(ip);
    }

    // Build device MAC → index map for DHCP/bridge enrichment
    let mut mac_to_idx: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    let mut devices: Vec<TopologyDevice> = rows
        .into_iter()
        .enumerate()
        .map(|(idx, r)| {
            let id: String = r.try_get("id").unwrap_or_default();
            let mac: String = r.try_get("mac").unwrap_or_default();
            let mac_lower = mac.to_lowercase();
            mac_to_idx.insert(mac_lower, idx);

            TopologyDevice {
                ips: ip_map.remove(&id).unwrap_or_default(),
                id,
                mac,
                name: r.try_get("name").unwrap_or(None),
                hostname: r.try_get("hostname").unwrap_or(None),
                vendor: r.try_get("vendor").unwrap_or(None),
                icon: r
                    .try_get::<String, _>("icon")
                    .unwrap_or_else(|_| "device".to_string()),
                is_online: r.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
                mdns_services: r.try_get("mdns_services").unwrap_or(None),
                custom_name: r.try_get("custom_name").unwrap_or(None),
                custom_type: r.try_get("custom_type").unwrap_or(None),
                custom_vendor: r.try_get("custom_vendor").unwrap_or(None),
                device_type: r.try_get("device_type").unwrap_or(None),
                device_model: r.try_get("device_model").unwrap_or(None),
                device_brand: r.try_get("device_brand").unwrap_or(None),
                first_seen_at: r.try_get("first_seen_at").unwrap_or_default(),
                last_seen_at: r.try_get("last_seen_at").unwrap_or_default(),
                os_family: r.try_get("os_family").unwrap_or(None),
                os_version: r.try_get("os_version").unwrap_or(None),
                location: r.try_get("location").unwrap_or(None),
                owner: r.try_get("owner").unwrap_or(None),
                tags: r.try_get("tags").unwrap_or(None),
                rx_bps: r.try_get("rx_bps").unwrap_or(0),
                tx_bps: r.try_get("tx_bps").unwrap_or(0),
                dhcp_lease_status: None,
                dhcp_server: None,
                dhcp_expires: None,
                dhcp_hostname: None,
                bridge_port: None,
                bridge_name: None,
            }
        })
        .collect();

    // 2. Fetch saved positions
    let positions = sqlx::query_as::<_, (String, f64, f64, i32)>(
        "SELECT node_id, x, y, pinned FROM topology_positions",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(node_id, x, y, pinned)| NodePosition {
        node_id,
        x,
        y,
        pinned: pinned != 0,
    })
    .collect();

    // 3. Build router info and enrich with DHCP/bridge data from MikroTik
    let mut router = TopologyRouter {
        router_type: "unknown".to_string(),
        is_online: false,
        wan_ip: None,
        hostname: None,
        version: None,
    };

    // Try MikroTik first
    if let Some(mt_client) = mikrotik_client(&state).await {
        // Router status
        if let Ok(res) = mt_client.system_resource().await {
            router = TopologyRouter {
                router_type: "mikrotik".to_string(),
                is_online: true,
                wan_ip: None, // populated below from interfaces
                hostname: res.board_name.clone(),
                version: res.version,
            };
        }

        // MikroTik interfaces — find WAN IP
        if let Ok(addrs) = mt_client.ip_addresses().await {
            // Use the first non-loopback address, prefer one on ether1
            for addr in &addrs {
                if let Some(ip) = &addr.address {
                    if router.wan_ip.is_none() || addr.interface.as_deref() == Some("ether1") {
                        // Strip CIDR prefix if present (e.g. "10.0.0.1/24" → "10.0.0.1")
                        router.wan_ip = Some(ip.split('/').next().unwrap_or(ip).to_string());
                    }
                }
            }
        }

        // Enrich with DHCP leases
        if let Ok(leases) = mt_client.dhcp_leases().await {
            for lease in leases {
                if let Some(mac) = &lease.mac_address {
                    let mac_lower = mac.to_lowercase();
                    if let Some(&idx) = mac_to_idx.get(&mac_lower) {
                        devices[idx].dhcp_lease_status = lease.status;
                        devices[idx].dhcp_server = lease.server;
                        devices[idx].dhcp_expires = lease.expires_after;
                        devices[idx].dhcp_hostname = lease.host_name;
                    }
                }
            }
        }

        // Enrich with bridge hosts
        if let Ok(hosts) = mt_client.bridge_hosts().await {
            for host in hosts {
                if let Some(mac) = &host.mac_address {
                    let mac_lower = mac.to_lowercase();
                    if let Some(&idx) = mac_to_idx.get(&mac_lower) {
                        devices[idx].bridge_port = host.on_interface.or(host.interface);
                        devices[idx].bridge_name = host.bridge;
                    }
                }
            }
        }
    }

    Ok(Json(TopologyGraph {
        devices,
        router,
        positions,
    }))
}
