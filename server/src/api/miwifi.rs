//! Xiaomi MiWiFi mesh router WiFi client endpoints.
//!
//! Provides unified WiFi client data by merging:
//! - `wifi_connect_devices` (signal strength, band)
//! - `devicelist` (mesh node, connection type)
//!
//! Devices are matched by MAC address.

use std::collections::HashMap;

use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;

use super::AppState;
use crate::miwifi::client::MiWiFiClient;

// ── Helper: build a MiWiFi client from DB settings ──────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Try to construct a MiWiFi client from saved settings.
async fn miwifi_client(state: &AppState) -> Option<MiWiFiClient> {
    let url = get_setting(state, "miwifi_url").await?;
    let password = get_setting(state, "miwifi_password").await?;

    Some(MiWiFiClient::new(
        &url,
        &password,
        state.miwifi_http.clone(),
    ))
}

// ── Response types ──────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct MiWiFiStatusResponse {
    pub configured: bool,
    pub reachable: bool,
}

/// Unified WiFi client info, keyed by MAC address.
#[derive(Debug, Serialize)]
pub struct WifiClientInfo {
    pub mac: String,
    /// Signal strength in dBm (from wifi_connect_devices).
    pub signal_dbm: Option<i64>,
    /// WiFi band: "2.4GHz", "5GHz", or null.
    pub band: Option<String>,
    /// Connection type: "wifi" or "wired".
    pub connection_type: String,
    /// Parent mesh node name.
    pub mesh_node: Option<String>,
    /// Device IP address.
    pub ip: Option<String>,
    /// Whether device is currently online.
    pub online: bool,
    /// Upload speed (bytes/sec string from router).
    pub upload_speed: Option<String>,
    /// Download speed (bytes/sec string from router).
    pub download_speed: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WifiClientsResponse {
    pub configured: bool,
    pub reachable: bool,
    pub clients: Vec<WifiClientInfo>,
}

// ── Handlers ────────────────────────────────────────────────

/// Map wifiIndex to band string.
fn wifi_index_to_band(index: i32) -> &'static str {
    match index {
        1 => "2.4GHz",
        2 => "5GHz",
        3 => "6GHz",
        _ => "Unknown",
    }
}

/// Normalise a MAC address to uppercase colon-separated format.
fn normalise_mac(mac: &str) -> String {
    mac.to_uppercase().replace('-', ":").replace('.', ":")
}

/// GET /api/v1/miwifi/status — check if MiWiFi router is configured and reachable.
pub async fn status(State(state): State<AppState>) -> Json<MiWiFiStatusResponse> {
    let client = match miwifi_client(&state).await {
        Some(c) => c,
        None => {
            return Json(MiWiFiStatusResponse {
                configured: false,
                reachable: false,
            });
        }
    };

    let reachable = client.wifi_connect_devices().await.is_ok();

    Json(MiWiFiStatusResponse {
        configured: true,
        reachable,
    })
}

/// GET /api/v1/miwifi/wifi-clients — fetch all WiFi clients from the MiWiFi router.
///
/// Merges data from `wifi_connect_devices` and `devicelist` APIs, matching by MAC.
pub async fn wifi_clients(
    State(state): State<AppState>,
) -> Result<Json<WifiClientsResponse>, StatusCode> {
    let client = match miwifi_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(WifiClientsResponse {
                configured: false,
                reachable: false,
                clients: vec![],
            }));
        }
    };

    // Fetch both APIs concurrently.
    let (wifi_result, devices_result) =
        tokio::join!(client.wifi_connect_devices(), client.device_list());

    let wifi_clients = match wifi_result {
        Ok(list) => list,
        Err(e) => {
            tracing::warn!("MiWiFi wifi_connect_devices failed: {e:#}");
            return Ok(Json(WifiClientsResponse {
                configured: true,
                reachable: false,
                clients: vec![],
            }));
        }
    };

    let device_list = match devices_result {
        Ok(list) => list,
        Err(e) => {
            tracing::warn!("MiWiFi devicelist failed: {e:#}");
            vec![]
        }
    };

    // Index WiFi clients by normalised MAC for O(1) lookup.
    let mut wifi_by_mac: HashMap<String, &crate::miwifi::client::WifiClient> = HashMap::new();
    for wc in &wifi_clients {
        if let Some(ref mac) = wc.mac {
            wifi_by_mac.insert(normalise_mac(mac), wc);
        }
    }

    // Build unified client list from devicelist, enriching with WiFi signal data.
    let mut clients: Vec<WifiClientInfo> = Vec::new();

    for dev in &device_list {
        let mac = match dev.mac {
            Some(ref m) => normalise_mac(m),
            None => continue,
        };

        let connection_type = match dev.device_type {
            Some(0) => "wired",
            _ => "wifi",
        };

        let wifi_info = wifi_by_mac.get(&mac);

        let (ip, online, upload_speed, download_speed) = match &dev.ip {
            Some(ips) if !ips.is_empty() => {
                let first = &ips[0];
                (
                    first.ip.clone(),
                    first.online.as_deref() == Some("1"),
                    first.upspeed.clone(),
                    first.downspeed.clone(),
                )
            }
            _ => (None, dev.online.as_deref() == Some("1"), None, None),
        };

        clients.push(WifiClientInfo {
            mac,
            signal_dbm: wifi_info.and_then(|w| w.signal),
            band: wifi_info.and_then(|w| w.wifi_index.map(wifi_index_to_band).map(String::from)),
            connection_type: connection_type.to_string(),
            mesh_node: dev.parent.clone(),
            ip,
            online,
            upload_speed,
            download_speed,
        });
    }

    // Also add WiFi clients that weren't in devicelist (edge case).
    for wc in &wifi_clients {
        let mac = match wc.mac {
            Some(ref m) => normalise_mac(m),
            None => continue,
        };
        if clients.iter().any(|c| c.mac == mac) {
            continue;
        }
        clients.push(WifiClientInfo {
            mac,
            signal_dbm: wc.signal,
            band: wc.wifi_index.map(wifi_index_to_band).map(String::from),
            connection_type: "wifi".to_string(),
            mesh_node: None,
            ip: None,
            online: true,
            upload_speed: None,
            download_speed: None,
        });
    }

    Ok(Json(WifiClientsResponse {
        configured: true,
        reachable: true,
        clients,
    }))
}
