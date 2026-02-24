//! Xiaomi MiWiFi API handler endpoints.
//!
//! These endpoints proxy requests to a Xiaomi router via its MiWiFi API,
//! handling SHA256 auth + stok token management transparently.

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::xiaomi::client::XiaomiClient;

// ── Helper: build a Xiaomi client from DB settings ─────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Try to construct a Xiaomi client from saved settings.
/// Returns `None` if Xiaomi integration is not configured or not enabled.
async fn xiaomi_client(state: &AppState) -> Option<XiaomiClient> {
    let enabled = get_setting(state, "xiaomi_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let ip = get_setting(state, "xiaomi_ip")
        .await
        .unwrap_or_else(|| "10.10.0.199".to_string());
    let password = get_setting(state, "xiaomi_password").await?;

    Some(XiaomiClient::new(&ip, &password, state.xiaomi_http.clone()))
}

// ── Response types ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiStatusResponse {
    pub configured: bool,
    pub reachable: bool,
    pub cpu_cores: Option<i32>,
    pub cpu_freq: Option<String>,
    pub cpu_load: Option<f64>,
    pub mem_usage: Option<f64>,
    pub mem_total: Option<String>,
    pub mem_type: Option<String>,
    pub temperature: Option<i32>,
    pub wan_download: Option<String>,
    pub wan_upload: Option<String>,
    pub devices_online: Option<i32>,
    pub devices_total: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiTopoNodeResponse {
    pub mac: Option<String>,
    pub name: Option<String>,
    pub locale: Option<String>,
    pub ip: Option<String>,
    pub online: Option<i32>,
    pub hardware: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiTopoLeafResponse {
    pub mac: Option<String>,
    pub ip: Option<String>,
    pub name: Option<String>,
    pub online: Option<i32>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiTopoResponse {
    pub nodes: Vec<XiaomiTopoNodeResponse>,
    pub leafs: Vec<XiaomiTopoLeafResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiDeviceResponse {
    pub mac: Option<String>,
    pub name: Option<String>,
    pub ip: Option<String>,
    pub download_speed: Option<String>,
    pub upload_speed: Option<String>,
    pub online: bool,
    pub device_type: Option<i32>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiWifiDeviceResponse {
    pub mac: Option<String>,
    pub ip: Option<String>,
    pub name: Option<String>,
    pub signal: Option<i32>,
    pub band: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiWanInfoResponse {
    pub ip: Option<String>,
    pub gateway: Option<String>,
    pub dns: Option<String>,
    pub wan_type: Option<String>,
    pub mask: Option<String>,
    pub ipv6: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiLanPortResponse {
    pub port: Option<i32>,
    pub link_status: Option<String>,
    pub speed: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiLanInfoResponse {
    pub ip: Option<String>,
    pub mask: Option<String>,
    pub ports: Vec<XiaomiLanPortResponse>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiNewStatusResponse {
    pub mac: Option<String>,
    pub platform: Option<String>,
    pub version: Option<String>,
    pub sn: Option<String>,
    pub devices_online: Option<i32>,
    pub devices_total: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiWifiBandResponse {
    pub ssid: Option<String>,
    pub channel: Option<String>,
    pub bandwidth: Option<String>,
    pub signal: Option<i32>,
    pub status: Option<String>,
    pub ifname: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiInitInfoResponse {
    pub router_name: Option<String>,
    pub hardware: Option<String>,
    pub rom_version: Option<String>,
    pub language: Option<String>,
    pub countrycode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiRomUpdateResponse {
    pub update_available: bool,
    pub latest_version: Option<String>,
    pub changelog_url: Option<String>,
}

// ── Handlers ───────────────────────────────────────────────

/// GET /xiaomi/status — system status (CPU, memory, temp, speeds).
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<XiaomiStatusResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(XiaomiStatusResponse {
                configured: false,
                reachable: false,
                cpu_cores: None,
                cpu_freq: None,
                cpu_load: None,
                mem_usage: None,
                mem_total: None,
                mem_type: None,
                temperature: None,
                wan_download: None,
                wan_upload: None,
                devices_online: None,
                devices_total: None,
            }));
        }
    };

    match client.system_status().await {
        Ok(s) => Ok(Json(XiaomiStatusResponse {
            configured: true,
            reachable: true,
            cpu_cores: s.cpu.as_ref().and_then(|c| c.core),
            cpu_freq: s.cpu.as_ref().and_then(|c| c.hz.clone()),
            cpu_load: s.cpu.as_ref().and_then(|c| c.load),
            mem_usage: s.mem.as_ref().and_then(|m| m.usage),
            mem_total: s.mem.as_ref().and_then(|m| m.total.clone()),
            mem_type: s.mem.as_ref().and_then(|m| m.mem_type.clone()),
            temperature: s.temperature,
            wan_download: s.wan.as_ref().and_then(|w| w.downspeed.clone()),
            wan_upload: s.wan.as_ref().and_then(|w| w.upspeed.clone()),
            devices_online: s.count.as_ref().and_then(|c| c.online),
            devices_total: s.count.as_ref().and_then(|c| c.all),
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi status request failed");
            Ok(Json(XiaomiStatusResponse {
                configured: true,
                reachable: false,
                cpu_cores: None,
                cpu_freq: None,
                cpu_load: None,
                mem_usage: None,
                mem_total: None,
                mem_type: None,
                temperature: None,
                wan_download: None,
                wan_upload: None,
                devices_online: None,
                devices_total: None,
            }))
        }
    }
}

/// GET /xiaomi/topology — mesh topology graph (no auth required).
pub async fn topology(
    State(state): State<AppState>,
) -> Result<Json<XiaomiTopoResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.topo_graph().await {
        Ok(topo) => {
            let graph = topo
                .graph
                .unwrap_or_else(|| crate::xiaomi::types::TopoGraphInner {
                    nodes: vec![],
                    leafs: vec![],
                });
            Ok(Json(XiaomiTopoResponse {
                nodes: graph
                    .nodes
                    .into_iter()
                    .map(|n| XiaomiTopoNodeResponse {
                        mac: n.mac,
                        name: n.name,
                        locale: n.locale,
                        ip: n.ip,
                        online: n.online,
                        hardware: n.hardware,
                        model: n.model,
                    })
                    .collect(),
                leafs: graph
                    .leafs
                    .into_iter()
                    .map(|l| XiaomiTopoLeafResponse {
                        mac: l.mac,
                        ip: l.ip,
                        name: l.name,
                        online: l.online,
                        parent_id: l.parent_id,
                    })
                    .collect(),
            }))
        }
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi topology request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/devices — all connected devices.
pub async fn devices(
    State(state): State<AppState>,
) -> Result<Json<Vec<XiaomiDeviceResponse>>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.device_list().await {
        Ok(list) => Ok(Json(
            list.into_iter()
                .map(|d| {
                    let first_ip = d.ip.first();
                    XiaomiDeviceResponse {
                        mac: d.mac,
                        name: d.name,
                        ip: first_ip.and_then(|i| i.ip.clone()),
                        download_speed: first_ip.and_then(|i| i.downspeed.clone()),
                        upload_speed: first_ip.and_then(|i| i.upspeed.clone()),
                        online: d.online.as_deref() == Some("1"),
                        device_type: d.device_type,
                        parent_id: d.parent_id,
                    }
                })
                .collect(),
        )),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi device list request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/new-status — hardware info + connected count.
pub async fn new_status(
    State(state): State<AppState>,
) -> Result<Json<XiaomiNewStatusResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.new_status().await {
        Ok(ns) => Ok(Json(XiaomiNewStatusResponse {
            mac: ns.hardware.as_ref().and_then(|h| h.mac.clone()),
            platform: ns.hardware.as_ref().and_then(|h| h.platform.clone()),
            version: ns.hardware.as_ref().and_then(|h| h.version.clone()),
            sn: ns.hardware.as_ref().and_then(|h| h.sn.clone()),
            devices_online: ns.count.as_ref().and_then(|c| c.online),
            devices_total: ns.count.as_ref().and_then(|c| c.all),
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi new status request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/wifi-devices — WiFi clients with signal + band.
pub async fn wifi_devices(
    State(state): State<AppState>,
) -> Result<Json<Vec<XiaomiWifiDeviceResponse>>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.wifi_devices().await {
        Ok(list) => Ok(Json(
            list.into_iter()
                .map(|d| XiaomiWifiDeviceResponse {
                    mac: d.mac,
                    ip: d.ip,
                    name: d.name,
                    signal: d.signal,
                    band: d.band,
                })
                .collect(),
        )),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi wifi devices request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/wan-info — WAN connection details.
pub async fn wan_info(
    State(state): State<AppState>,
) -> Result<Json<XiaomiWanInfoResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.wan_info().await {
        Ok(info) => Ok(Json(XiaomiWanInfoResponse {
            ip: info.ip,
            gateway: info.gateway,
            dns: info.dns,
            wan_type: info.wan_type,
            mask: info.mask,
            ipv6: info.ipv6,
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi WAN info request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/lan-info — LAN IP, subnet, port status.
pub async fn lan_info(
    State(state): State<AppState>,
) -> Result<Json<XiaomiLanInfoResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.lan_info().await {
        Ok(info) => Ok(Json(XiaomiLanInfoResponse {
            ip: info.ip,
            mask: info.mask,
            ports: info
                .ports
                .into_iter()
                .map(|p| XiaomiLanPortResponse {
                    port: p.port,
                    link_status: p.linkstatus,
                    speed: p.speed,
                })
                .collect(),
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi LAN info request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/wifi-detail-all — per-band WiFi details.
pub async fn wifi_detail_all(
    State(state): State<AppState>,
) -> Result<Json<Vec<XiaomiWifiBandResponse>>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.wifi_detail_all().await {
        Ok(bands) => Ok(Json(
            bands
                .into_iter()
                .map(|b| XiaomiWifiBandResponse {
                    ssid: b.ssid,
                    channel: b.channel,
                    bandwidth: b.bandwidth,
                    signal: b.signal,
                    status: b.status,
                    ifname: b.ifname,
                })
                .collect(),
        )),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi wifi_detail_all request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/init-info — router identity, firmware version, locale.
pub async fn init_info(
    State(state): State<AppState>,
) -> Result<Json<XiaomiInitInfoResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.init_info().await {
        Ok(info) => Ok(Json(XiaomiInitInfoResponse {
            router_name: info.router_name,
            hardware: info.hardware,
            rom_version: info.rom_version,
            language: info.language,
            countrycode: info.countrycode,
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi init_info request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/rom-update — check for firmware update.
pub async fn rom_update(
    State(state): State<AppState>,
) -> Result<Json<XiaomiRomUpdateResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.check_rom_update().await {
        Ok(update) => Ok(Json(XiaomiRomUpdateResponse {
            update_available: update.need_update.unwrap_or(0) == 1,
            latest_version: update.version,
            changelog_url: update.changelog_url,
        })),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi check_rom_update request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}
