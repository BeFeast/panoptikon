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
    pub mem_hz: Option<String>,
    pub temperature: Option<f64>,
    pub uptime: Option<String>,
    pub wan_download: Option<String>,
    pub wan_upload: Option<String>,
    pub wan_max_download: Option<String>,
    pub wan_max_upload: Option<String>,
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
    pub configured: bool,
    pub reachable: bool,
    pub wan_ip: Option<String>,
    pub gateway: Option<String>,
    pub dns1: Option<String>,
    pub dns2: Option<String>,
    pub subnet_mask: Option<String>,
    pub wan_type: Option<String>,
    pub ipv6_ip: Option<String>,
    pub ipv6_gateway: Option<String>,
    pub ipv6_prefix: Option<String>,
    pub ipv6_dns1: Option<String>,
    pub ipv6_dns2: Option<String>,
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
pub struct XiaomiFirmwareResponse {
    pub configured: bool,
    pub reachable: bool,
    pub router_name: Option<String>,
    pub hardware: Option<String>,
    pub rom_version: Option<String>,
    pub locale: Option<String>,
    pub update_available: Option<bool>,
    pub latest_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiWifiBand {
    pub ifname: Option<String>,
    pub ssid: Option<String>,
    pub channel: Option<String>,
    pub bandwidth: Option<String>,
    pub clients: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiWifiResponse {
    pub configured: bool,
    pub reachable: bool,
    pub bands: Vec<XiaomiWifiBand>,
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
                mem_hz: None,
                temperature: None,
                uptime: None,
                wan_download: None,
                wan_upload: None,
                wan_max_download: None,
                wan_max_upload: None,
                devices_online: None,
                devices_total: None,
            }));
        }
    };

    if let Some(cached) = state.xiaomi_cache.get("status") {
        if let Ok(resp) = serde_json::from_value::<XiaomiStatusResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    match client.system_status().await {
        Ok(s) => {
            let resp = XiaomiStatusResponse {
                configured: true,
                reachable: true,
                cpu_cores: s.cpu.as_ref().and_then(|c| c.core),
                cpu_freq: s.cpu.as_ref().and_then(|c| c.hz.clone()),
                cpu_load: s.cpu.as_ref().and_then(|c| c.load),
                mem_usage: s.mem.as_ref().and_then(|m| m.usage),
                mem_total: s.mem.as_ref().and_then(|m| m.total.clone()),
                mem_type: s.mem.as_ref().and_then(|m| m.mem_type.clone()),
                mem_hz: s.mem.as_ref().and_then(|m| m.hz.clone()),
                temperature: s.temperature,
                uptime: s.uptime,
                wan_download: s.wan.as_ref().and_then(|w| w.downspeed.clone()),
                wan_upload: s.wan.as_ref().and_then(|w| w.upspeed.clone()),
                wan_max_download: s.wan.as_ref().and_then(|w| w.maxdownloadspeed.clone()),
                wan_max_upload: s.wan.as_ref().and_then(|w| w.maxuploadspeed.clone()),
                devices_online: s.count.as_ref().and_then(|c| c.online),
                devices_total: s.count.as_ref().and_then(|c| c.all),
            };
            state
                .xiaomi_cache
                .set("status".to_string(), serde_json::to_value(&resp).unwrap());
            Ok(Json(resp))
        }
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
                mem_hz: None,
                temperature: None,
                uptime: None,
                wan_download: None,
                wan_upload: None,
                wan_max_download: None,
                wan_max_upload: None,
                devices_online: None,
                devices_total: None,
            }))
        }
    }
}

/// GET /xiaomi/topology — mesh topology graph.
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

/// GET /xiaomi/wan-info — WAN connection details (IPv4 + IPv6).
pub async fn wan_info(
    State(state): State<AppState>,
) -> Result<Json<XiaomiWanInfoResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(XiaomiWanInfoResponse {
                configured: false,
                reachable: false,
                wan_ip: None,
                gateway: None,
                dns1: None,
                dns2: None,
                subnet_mask: None,
                wan_type: None,
                ipv6_ip: None,
                ipv6_gateway: None,
                ipv6_prefix: None,
                ipv6_dns1: None,
                ipv6_dns2: None,
            }));
        }
    };

    if let Some(cached) = state.xiaomi_cache.get("wan_info") {
        if let Ok(resp) = serde_json::from_value::<XiaomiWanInfoResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    match client.wan_info().await {
        Ok(wan) => {
            let info = wan.info.as_ref();
            let ipv4 = info.and_then(|i| i.ipv4.as_ref());
            let ipv6 = info.and_then(|i| i.ipv6.as_ref());
            let resp = XiaomiWanInfoResponse {
                configured: true,
                reachable: true,
                wan_ip: ipv4
                    .and_then(|v| v.ip.clone())
                    .or_else(|| info.and_then(|i| i.ip.clone())),
                gateway: ipv4
                    .and_then(|v| v.gateway.clone())
                    .or_else(|| info.and_then(|i| i.gateway.clone())),
                dns1: ipv4.and_then(|v| v.dns1.clone()),
                dns2: ipv4.and_then(|v| v.dns2.clone()),
                subnet_mask: ipv4
                    .and_then(|v| v.mask.clone())
                    .or_else(|| info.and_then(|i| i.mask.clone())),
                wan_type: info.and_then(|i| i.wan_type.clone()),
                ipv6_ip: ipv6.and_then(|v| v.ip.clone()),
                ipv6_gateway: ipv6.and_then(|v| v.gateway.clone()),
                ipv6_prefix: ipv6.and_then(|v| v.prefix.clone()),
                ipv6_dns1: ipv6.and_then(|v| v.dns1.clone()),
                ipv6_dns2: ipv6.and_then(|v| v.dns2.clone()),
            };
            state
                .xiaomi_cache
                .set("wan_info".to_string(), serde_json::to_value(&resp).unwrap());
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi WAN info request failed");
            Ok(Json(XiaomiWanInfoResponse {
                configured: true,
                reachable: false,
                wan_ip: None,
                gateway: None,
                dns1: None,
                dns2: None,
                subnet_mask: None,
                wan_type: None,
                ipv6_ip: None,
                ipv6_gateway: None,
                ipv6_prefix: None,
                ipv6_dns1: None,
                ipv6_dns2: None,
            }))
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

/// GET /xiaomi/firmware — firmware version and update check.
pub async fn firmware(
    State(state): State<AppState>,
) -> Result<Json<XiaomiFirmwareResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(XiaomiFirmwareResponse {
                configured: false,
                reachable: false,
                router_name: None,
                hardware: None,
                rom_version: None,
                locale: None,
                update_available: None,
                latest_version: None,
            }));
        }
    };

    if let Some(cached) = state.xiaomi_cache.get("firmware") {
        if let Ok(resp) = serde_json::from_value::<XiaomiFirmwareResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    // Fetch both init_info and check_rom_update concurrently.
    let (init_res, update_res) = tokio::join!(client.init_info(), client.check_rom_update());

    match init_res {
        Ok(init) => {
            let update = update_res.ok();
            let resp = XiaomiFirmwareResponse {
                configured: true,
                reachable: true,
                router_name: init.router_name,
                hardware: init.hardware,
                rom_version: init.rom_version,
                locale: init.locale,
                update_available: update.as_ref().and_then(|u| u.need_update),
                latest_version: update.as_ref().and_then(|u| u.latest.clone()),
            };
            state
                .xiaomi_cache
                .set("firmware".to_string(), serde_json::to_value(&resp).unwrap());
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi firmware info request failed");
            Ok(Json(XiaomiFirmwareResponse {
                configured: true,
                reachable: false,
                router_name: None,
                hardware: None,
                rom_version: None,
                locale: None,
                update_available: None,
                latest_version: None,
            }))
        }
    }
}

/// GET /xiaomi/wifi — WiFi bands summary.
pub async fn wifi(State(state): State<AppState>) -> Result<Json<XiaomiWifiResponse>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => {
            return Ok(Json(XiaomiWifiResponse {
                configured: false,
                reachable: false,
                bands: vec![],
            }));
        }
    };

    if let Some(cached) = state.xiaomi_cache.get("wifi") {
        if let Ok(resp) = serde_json::from_value::<XiaomiWifiResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    // Fetch wifi details and new status concurrently.
    let (detail_res, newstatus_res) = tokio::join!(client.wifi_detail_all(), client.new_status());

    match detail_res {
        Ok(detail) => {
            let newstatus = newstatus_res.ok();
            let bands: Vec<XiaomiWifiBand> = detail
                .info
                .unwrap_or_default()
                .into_iter()
                .map(|band| {
                    // Try to get client counts from newstatus per-band info.
                    let clients = band
                        .ifname
                        .as_deref()
                        .and_then(|ifname| {
                            let ns = newstatus.as_ref()?;
                            if ifname.contains("2g")
                                || ifname.contains("2.4")
                                || ifname.starts_with("wl0")
                            {
                                ns.band_2g.as_ref().and_then(|b| b.online)
                            } else if ifname.contains("5g") || ifname.starts_with("wl1") {
                                ns.band_5g.as_ref().and_then(|b| b.online)
                            } else {
                                None
                            }
                        })
                        .or_else(|| band.status.as_deref().and_then(|s| s.parse().ok()));
                    XiaomiWifiBand {
                        ifname: band.ifname,
                        ssid: band.ssid,
                        channel: band.channel,
                        bandwidth: band.bandwidth,
                        clients,
                    }
                })
                .collect();

            let resp = XiaomiWifiResponse {
                configured: true,
                reachable: true,
                bands,
            };
            state
                .xiaomi_cache
                .set("wifi".to_string(), serde_json::to_value(&resp).unwrap());
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi WiFi info request failed");
            Ok(Json(XiaomiWifiResponse {
                configured: true,
                reachable: false,
                bands: vec![],
            }))
        }
    }
}
