//! Xiaomi MiWiFi API handler endpoints.
//!
//! These endpoints proxy requests to a Xiaomi router via its MiWiFi HTTP API,
//! using cached responses to avoid redundant network calls.

use axum::{extract::State, http::StatusCode, Json};

use super::AppState;
use crate::xiaomi::client::XiaomiClient;
use crate::xiaomi::types::*;

// ── Helper: build a Xiaomi client from DB settings ──────

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
/// Returns `None` if Xiaomi is not configured or not enabled.
async fn xiaomi_client(state: &AppState) -> Option<XiaomiClient> {
    let enabled = get_setting(state, "xiaomi_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting(state, "xiaomi_url").await?;
    let password = get_setting(state, "xiaomi_password")
        .await
        .unwrap_or_default();

    Some(XiaomiClient::with_http(
        &url,
        &password,
        state.xiaomi_http.clone(),
    ))
}

// ── Endpoints ──────────────────────────────────────────────

/// GET /api/v1/xiaomi/status
pub async fn status(
    State(state): State<AppState>,
) -> Result<Json<XiaomiStatusResponse>, StatusCode> {
    let Some(client) = xiaomi_client(&state).await else {
        return Ok(Json(XiaomiStatusResponse {
            configured: false,
            reachable: false,
            cpu: None,
            mem: None,
            temperature: None,
            uptime: None,
            wan_traffic: None,
            device_count: None,
        }));
    };

    if let Some(cached) = state.xiaomi_cache.get("status") {
        if let Ok(resp) = serde_json::from_value::<XiaomiStatusResponse>(cached) {
            return Ok(Json(resp));
        }
    }

    match client.system_status().await {
        Ok(data) => {
            let resp = XiaomiStatusResponse {
                configured: true,
                reachable: true,
                cpu: data.cpu.map(|c| XiaomiCpu {
                    cores: c.core,
                    frequency: c.hz,
                    load: c.load,
                }),
                mem: data.mem.map(|m| XiaomiMem {
                    usage: m.usage,
                    total: m.total,
                    frequency: m.hz,
                    mem_type: m.mem_type,
                }),
                temperature: data.temperature,
                uptime: data.uptime,
                wan_traffic: data.wan.map(|w| XiaomiWanTraffic {
                    download_speed: w.downspeed,
                    upload_speed: w.upspeed,
                    max_download_speed: w.maxdownloadspeed,
                    max_upload_speed: w.maxuploadspeed,
                }),
                device_count: data.count.map(|c| XiaomiDeviceCount {
                    online: c.online,
                    total: c.all,
                    online_without_mesh: c.online_without_mesh,
                    total_without_mesh: c.all_without_mesh,
                }),
            };
            if let Ok(val) = serde_json::to_value(&resp) {
                state.xiaomi_cache.set("status".into(), val);
            }
            Ok(Json(resp))
        }
        Err(e) => {
            tracing::warn!("Xiaomi status check failed: {e}");
            Ok(Json(XiaomiStatusResponse {
                configured: true,
                reachable: false,
                cpu: None,
                mem: None,
                temperature: None,
                uptime: None,
                wan_traffic: None,
                device_count: None,
            }))
        }
    }
}

/// GET /api/v1/xiaomi/wan
pub async fn wan_info(
    State(state): State<AppState>,
) -> Result<Json<XiaomiWanInfoResponse>, StatusCode> {
    let client = xiaomi_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.xiaomi_cache.get("wan") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let data = client.wan_info().await.map_err(|e| {
        tracing::error!("Xiaomi WAN info error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let detail = data.info.unwrap_or(WanDetail {
        wan_type: None,
        ipv4: None,
        ipv6: None,
        details: None,
    });

    let mut dns_servers = Vec::new();
    if let Some(ref v4) = detail.ipv4 {
        if let Some(ref d) = v4.dns1 {
            if !d.is_empty() {
                dns_servers.push(d.clone());
            }
        }
        if let Some(ref d) = v4.dns2 {
            if !d.is_empty() {
                dns_servers.push(d.clone());
            }
        }
    }

    let mut ipv6_dns = Vec::new();
    if let Some(ref v6) = detail.ipv6 {
        if let Some(ref d) = v6.dns1 {
            if !d.is_empty() {
                ipv6_dns.push(d.clone());
            }
        }
        if let Some(ref d) = v6.dns2 {
            if !d.is_empty() {
                ipv6_dns.push(d.clone());
            }
        }
    }

    let wan_type = detail
        .details
        .as_ref()
        .and_then(|d| d.wan_type.clone())
        .or(detail.wan_type);

    let resp = XiaomiWanInfoResponse {
        wan_type,
        ip: detail.ipv4.as_ref().and_then(|v| v.ip.clone()),
        mask: detail.ipv4.as_ref().and_then(|v| v.mask.clone()),
        gateway: detail.ipv4.as_ref().and_then(|v| v.gateway.clone()),
        dns_servers,
        ipv6_ip: detail.ipv6.as_ref().and_then(|v| v.ip.clone()),
        ipv6_gateway: detail.ipv6.as_ref().and_then(|v| v.gateway.clone()),
        ipv6_dns,
        ipv6_prefix: detail.ipv6.as_ref().and_then(|v| v.prefix.clone()),
    };

    if let Ok(val) = serde_json::to_value(&resp) {
        state.xiaomi_cache.set("wan".into(), val);
    }
    Ok(Json(resp))
}

/// GET /api/v1/xiaomi/wifi
pub async fn wifi(State(state): State<AppState>) -> Result<Json<XiaomiWifiResponse>, StatusCode> {
    let client = xiaomi_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.xiaomi_cache.get("wifi") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let wifi_detail = client
        .wifi_detail_all()
        .await
        .unwrap_or(WifiDetailAllData { info: None });

    let bands: Vec<XiaomiWifiBand> = wifi_detail
        .info
        .unwrap_or_default()
        .into_iter()
        .map(|b| {
            let channel_str = b.channel.map(|c| match c {
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::String(s) => s,
                other => other.to_string(),
            });
            let name = b.if_name.clone().unwrap_or_else(|| "unknown".to_string());
            XiaomiWifiBand {
                name,
                ssid: b.ssid,
                channel: channel_str,
                bandwidth: b.bandwidth,
                encryption: b.encryption,
                band_steering: b.band_steering,
                status: b.status,
            }
        })
        .collect();

    let resp = XiaomiWifiResponse { bands };

    if let Ok(val) = serde_json::to_value(&resp) {
        state.xiaomi_cache.set("wifi".into(), val);
    }
    Ok(Json(resp))
}

/// GET /api/v1/xiaomi/firmware
pub async fn firmware(
    State(state): State<AppState>,
) -> Result<Json<XiaomiFirmwareResponse>, StatusCode> {
    let client = xiaomi_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.xiaomi_cache.get("firmware") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let init = client.init_info().await.map_err(|e| {
        tracing::error!("Xiaomi init info error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let update = client.check_rom_update().await.unwrap_or(RomUpdateData {
        need_update: Some(0),
    });

    let resp = XiaomiFirmwareResponse {
        router_name: init.router_name,
        rom_version: init.rom_version,
        hardware: init.hardware,
        language: init.language,
        update_available: update.need_update.unwrap_or(0) == 1,
    };

    if let Ok(val) = serde_json::to_value(&resp) {
        state.xiaomi_cache.set("firmware".into(), val);
    }
    Ok(Json(resp))
}
