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
    let enabled = get_setting(state, "xiaomi_mesh_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let ip = get_setting(state, "xiaomi_mesh_ip")
        .await
        .unwrap_or_else(|| "10.10.0.199".to_string());
    let password = get_setting(state, "xiaomi_mesh_password").await?;
    let proxy_host = get_setting(state, "xiaomi_mesh_proxy_host").await;

    Some(XiaomiClient::new(
        &ip,
        &password,
        state.xiaomi_http.clone(),
        proxy_host.as_deref(),
    ))
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
    pub uptime: Option<String>,
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
    /// Logical role within the mesh: "main" for the CAP router, "satellite" for
    /// downstream nodes. Lets the frontend label nodes without re-deriving role.
    #[serde(default)]
    pub role: Option<String>,
    /// True for the CAP/main router, false for satellites. Mirrors `role` for
    /// callers that prefer a boolean check.
    #[serde(default)]
    pub is_main: bool,
    /// Backhaul connection type from the Xiaomi `link_type` field: "wired",
    /// "wireless", or `None` for the main router.
    #[serde(default)]
    pub backhaul: Option<String>,
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
    pub ipv6_status: Option<String>,
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
    /// Explicit band label: "2.4GHz", "5GHz", or "6GHz".
    /// Inferred server-side from channel number, bandwidth string, or index
    /// position (see [`infer_band_label`]).
    pub band: String,
    pub ssid: Option<String>,
    pub channel: Option<String>,
    pub bandwidth: Option<String>,
    pub encryption: Option<String>,
    pub signal: Option<i32>,
    pub status: Option<String>,
    pub band_steering: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct XiaomiFirmwareResponse {
    pub configured: bool,
    pub reachable: bool,
    pub router_name: Option<String>,
    pub language: Option<String>,
    pub rom_version: Option<String>,
    pub hardware: Option<String>,
    pub model: Option<String>,
    pub country_code: Option<String>,
    pub update_available: bool,
    pub update_version: Option<String>,
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
                uptime: None,
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
            uptime: s.uptime,
        })),
        Err(e) => {
            tracing::warn!(
                error = %e,
                "MiWiFi status request failed, probing connectivity via init_info"
            );
            // Use unauthenticated init_info for the reachability probe.
            // The xqsystem/init_info endpoint does not require a stok token,
            // so this succeeds even when login/auth is broken — matching the
            // behaviour of the settings-page test-connection check.
            let reachable = client.init_info_no_auth().await.is_ok();
            if !reachable {
                tracing::error!("MiWiFi status and init_info probes both failed");
            }
            Ok(Json(XiaomiStatusResponse {
                configured: true,
                reachable,
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
                uptime: None,
            }))
        }
    }
}

/// Parse `online`/`onlines` which may be a JSON number or string.
fn parse_online_value(v: &serde_json::Value) -> Option<i32> {
    match v {
        serde_json::Value::Number(n) => n.as_i64().map(|v| v as i32),
        serde_json::Value::String(s) => s.trim().parse::<i32>().ok(),
        _ => None,
    }
}

/// Xiaomi mesh nodes that were never customized in the router admin UI come
/// back with `name: "default"`. Treat that — along with empty/whitespace — as
/// "no user-set name" so the frontend can fall back to locale/role/IP instead
/// of rendering a wall of indistinguishable `default` labels (issue #807).
pub(crate) fn sanitize_mesh_name(raw: Option<String>) -> Option<String> {
    raw.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("default") {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Locale on satellite mesh nodes is the user-set room/location ("Live Studio",
/// "Basement"). Apply the same "default" sanitization so role-coded locales
/// like `master`/`slave` survive while the placeholder string does not.
pub(crate) fn sanitize_mesh_locale(raw: Option<String>) -> Option<String> {
    sanitize_mesh_name(raw)
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
                    ip: None,
                    name: None,
                    locale: None,
                    hardware: None,
                    online: None,
                });

            let mut nodes: Vec<XiaomiTopoNodeResponse> = graph
                .nodes
                .into_iter()
                .enumerate()
                .map(|(idx, n)| {
                    let locale = sanitize_mesh_locale(n.locale);
                    // `nodes[0]` is the CAP/main router; the rest are satellites.
                    let is_main = idx == 0;
                    XiaomiTopoNodeResponse {
                        mac: n.mac,
                        name: sanitize_mesh_name(n.name),
                        locale: locale.clone(),
                        ip: n.ip,
                        online: n.online,
                        hardware: n.hardware,
                        model: n.model,
                        role: Some(if is_main { "main" } else { "satellite" }.to_string()),
                        is_main,
                        backhaul: None,
                    }
                })
                .collect();

            let mut leafs_out = Vec::new();

            // BE3600 (RD15) puts satellite mesh routers in `leafs` with
            // `link_type` and `onlines` instead of using `nodes`.
            // When `nodes` is empty, promote satellite leafs into nodes
            // and add the graph root as the main router node.
            if nodes.is_empty() && !graph.leafs.is_empty() {
                // Add the graph root (main router) as the first node.
                if graph.ip.is_some() {
                    let main_online = graph.online.as_ref().and_then(parse_online_value);
                    nodes.push(XiaomiTopoNodeResponse {
                        mac: None,
                        name: sanitize_mesh_name(graph.name),
                        locale: sanitize_mesh_locale(graph.locale),
                        ip: graph.ip,
                        online: main_online,
                        hardware: graph.hardware,
                        model: None,
                        role: Some("main".to_string()),
                        is_main: true,
                        backhaul: None,
                    });
                }

                // Promote satellite leafs (those with link_type) to nodes.
                for leaf in graph.leafs {
                    if let Some(link_type) = leaf.link_type.as_deref() {
                        let backhaul = match link_type {
                            "wire" | "wired" => "wired".to_string(),
                            "" => "unknown".to_string(),
                            other => other.to_string(),
                        };
                        nodes.push(XiaomiTopoNodeResponse {
                            mac: leaf.mac,
                            name: sanitize_mesh_name(leaf.name),
                            locale: sanitize_mesh_locale(leaf.locale),
                            ip: leaf.ip,
                            online: leaf.online,
                            hardware: leaf.hardware,
                            model: None,
                            role: Some("satellite".to_string()),
                            is_main: false,
                            backhaul: Some(backhaul),
                        });
                    } else {
                        leafs_out.push(XiaomiTopoLeafResponse {
                            mac: leaf.mac,
                            ip: leaf.ip,
                            name: sanitize_mesh_name(leaf.name),
                            online: leaf.online,
                            parent_id: leaf.parent_id,
                        });
                    }
                }
            } else {
                leafs_out = graph
                    .leafs
                    .into_iter()
                    .map(|l| XiaomiTopoLeafResponse {
                        mac: l.mac,
                        ip: l.ip,
                        name: sanitize_mesh_name(l.name),
                        online: l.online,
                        parent_id: l.parent_id,
                    })
                    .collect();
            }

            Ok(Json(XiaomiTopoResponse {
                nodes,
                leafs: leafs_out,
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
        Ok(info) => {
            let ipv6_status = info.ipv6.as_ref().map(|v| {
                if v.is_null() {
                    "disabled".to_string()
                } else if let Some(obj) = v.as_object() {
                    if obj.is_empty() {
                        "disabled".to_string()
                    } else {
                        "enabled".to_string()
                    }
                } else {
                    format!("{v}")
                }
            });
            Ok(Json(XiaomiWanInfoResponse {
                ip: info.ip,
                gateway: info.gateway,
                dns: info.dns,
                wan_type: info.wan_type,
                mask: info.mask,
                ipv6_status,
            }))
        }
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

// ── Band inference + deduplication helpers ─────────────────

/// Infer WiFi band label from channel number, bandwidth string, or index.
///
/// **Why position fallback is needed:**  
/// Xiaomi BE3600 (and similar mesh routers) report `channel: "0"` and
/// `bandwidth: "0"` for all radios when in auto-channel mode.  Channel-based
/// detection (`channel > 14 → 5 GHz`) therefore misclassifies every entry as
/// "2.4 GHz".  MiWiFi's `wifi_detail_all` consistently emits radios in
/// ascending-frequency order (2.4 GHz first, 5 GHz second), so the index
/// position is a reliable last-resort discriminator.
///
/// Priority chain:
/// 1. Channel number (1–14 → 2.4 GHz; ≥ 36 → 5 GHz)
/// 2. Bandwidth string prefix (HT → 2.4 GHz; VHT/HE/EHT → 5 GHz)
/// 3. Index position (0 → 2.4 GHz, 1+ → 5 GHz)
pub(crate) fn infer_band_label(
    channel: Option<&str>,
    bandwidth: Option<&str>,
    index: usize,
) -> &'static str {
    // Priority 1: channel number when non-zero.
    if let Some(ch) = channel {
        if let Ok(n) = ch.trim().parse::<u32>() {
            if (1..=14).contains(&n) {
                return "2.4GHz";
            }
            if n >= 36 {
                return "5GHz";
            }
            // n == 0  → fall through (auto-channel, cannot determine band)
        }
    }

    // Priority 2: bandwidth string prefix hints.
    if let Some(bw) = bandwidth {
        let bw_upper = bw.to_uppercase();
        // VHT (802.11ac), HE (802.11ax Wi-Fi 6), EHT (802.11be Wi-Fi 7) → 5/6 GHz
        if bw_upper.starts_with("VHT") || bw_upper.starts_with("HE") || bw_upper.starts_with("EHT")
        {
            return "5GHz";
        }
        // HT (802.11n) → 2.4 GHz (could also be 5 GHz, but 2.4 is more common
        // when combined with the other tiers)
        if bw_upper.starts_with("HT") {
            return "2.4GHz";
        }
    }

    // Priority 3: position-based fallback.
    // MiWiFi firmware consistently returns bands in 2.4 → 5 → (6) order.
    match index {
        0 => "2.4GHz",
        _ => "5GHz",
    }
}

/// Deduplicate a list of `WifiBandDetail` entries by `(inferred_band, ssid)`.
///
/// Motivation: on mesh systems the router may emit one entry *per satellite
/// node* for the same logical SSID+band, or emit the same 2.4 GHz entry
/// twice because all channels are `"0"` (auto-channel mode).  We keep the
/// entry with the strongest signal (closest to 0 dBm) from each group.
pub(crate) fn deduplicate_wifi_bands(
    bands: Vec<crate::xiaomi::types::WifiBandDetail>,
) -> Vec<XiaomiWifiBandResponse> {
    // Ordered map: dedup key → (slot index in `out`, stored response)
    let mut seen: std::collections::HashMap<String, usize> = Default::default();
    let mut out: Vec<XiaomiWifiBandResponse> = Vec::with_capacity(bands.len());

    for (i, b) in bands.into_iter().enumerate() {
        let band_label = infer_band_label(b.channel.as_deref(), b.bandwidth.as_deref(), i);
        let dedup_key = format!("{}|{}", band_label, b.ssid.as_deref().unwrap_or(""));

        let new_entry = XiaomiWifiBandResponse {
            band: band_label.to_string(),
            ssid: b.ssid,
            channel: b.channel,
            bandwidth: b.bandwidth,
            encryption: b.encryption,
            signal: b.signal,
            status: b.status,
            band_steering: b.band_steering,
        };

        if let Some(&slot) = seen.get(&dedup_key) {
            // Keep the entry with the better signal (less negative = stronger).
            let old_signal = out[slot].signal.unwrap_or(i32::MIN);
            let new_signal = new_entry.signal.unwrap_or(i32::MIN);
            if new_signal > old_signal {
                out[slot] = new_entry;
            }
        } else {
            seen.insert(dedup_key, out.len());
            out.push(new_entry);
        }
    }

    out
}

/// GET /xiaomi/wifi-bands — per-band WiFi details (SSID, channel, band steering).
///
/// Returns one entry per unique logical WiFi band+SSID pair.  The router may
/// report the same band multiple times (once per mesh node, or all with
/// `channel:"0"` in auto-channel mode); this handler deduplicates those
/// entries and adds an explicit `band` field so the frontend does not need to
/// re-infer it from channel numbers.
pub async fn wifi_bands(
    State(state): State<AppState>,
) -> Result<Json<Vec<XiaomiWifiBandResponse>>, StatusCode> {
    let client = match xiaomi_client(&state).await {
        Some(c) => c,
        None => return Err(StatusCode::SERVICE_UNAVAILABLE),
    };

    match client.wifi_detail_all().await {
        Ok(bands) => Ok(Json(deduplicate_wifi_bands(bands))),
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi wifi bands request failed");
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// GET /xiaomi/firmware — firmware version, hardware info, update check.
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
                language: None,
                rom_version: None,
                hardware: None,
                model: None,
                country_code: None,
                update_available: false,
                update_version: None,
            }));
        }
    };

    let init = match client.init_info().await {
        Ok(info) => info,
        Err(e) => {
            tracing::error!(error = %e, "MiWiFi init_info request failed");
            return Ok(Json(XiaomiFirmwareResponse {
                configured: true,
                reachable: false,
                router_name: None,
                language: None,
                rom_version: None,
                hardware: None,
                model: None,
                country_code: None,
                update_available: false,
                update_version: None,
            }));
        }
    };

    let (update_available, update_version) = match client.check_rom_update().await {
        Ok(Some(upd)) => {
            let available = upd.need_update.unwrap_or(0) != 0;
            (available, upd.version)
        }
        Ok(None) => (false, None),
        Err(e) => {
            tracing::warn!(error = %e, "MiWiFi check_rom_update failed, assuming no update");
            (false, None)
        }
    };

    Ok(Json(XiaomiFirmwareResponse {
        configured: true,
        reachable: true,
        router_name: init.router_name,
        language: init.language,
        rom_version: init.rom_version,
        hardware: init.hardware,
        model: init.model,
        country_code: init.countrycode,
        update_available,
        update_version,
    }))
}

// ── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::xiaomi::types::WifiBandDetail;

    fn band(channel: &str, bandwidth: &str, signal: i32) -> WifiBandDetail {
        WifiBandDetail {
            ssid: Some("OK Home".to_string()),
            channel: Some(channel.to_string()),
            bandwidth: Some(bandwidth.to_string()),
            encryption: Some("psk2".to_string()),
            signal: Some(signal),
            status: Some("1".to_string()),
            band_steering: None,
        }
    }

    // ── infer_band_label ──────────────────────────────────

    #[test]
    fn infer_band_explicit_24ghz_channel() {
        assert_eq!(infer_band_label(Some("1"), None, 99), "2.4GHz");
        assert_eq!(infer_band_label(Some("6"), None, 99), "2.4GHz");
        assert_eq!(infer_band_label(Some("14"), None, 99), "2.4GHz");
    }

    #[test]
    fn infer_band_explicit_5ghz_channel() {
        assert_eq!(infer_band_label(Some("36"), None, 99), "5GHz");
        assert_eq!(infer_band_label(Some("100"), None, 99), "5GHz");
        assert_eq!(infer_band_label(Some("149"), None, 99), "5GHz");
    }

    #[test]
    fn infer_band_zero_channel_falls_through_to_position() {
        // Production root-cause case: channel="0", bandwidth="0"
        assert_eq!(
            infer_band_label(Some("0"), Some("0"), 0),
            "2.4GHz",
            "index 0 with channel=0 must be 2.4GHz"
        );
        assert_eq!(
            infer_band_label(Some("0"), Some("0"), 1),
            "5GHz",
            "index 1 with channel=0 must be 5GHz"
        );
    }

    #[test]
    fn infer_band_bandwidth_fallback_vht() {
        // channel=0 but bandwidth gives 5GHz hint
        assert_eq!(infer_band_label(Some("0"), Some("VHT80"), 0), "5GHz");
        assert_eq!(infer_band_label(Some("0"), Some("HE80"), 0), "5GHz");
        assert_eq!(infer_band_label(Some("0"), Some("EHT160"), 0), "5GHz");
    }

    #[test]
    fn infer_band_bandwidth_fallback_ht() {
        assert_eq!(infer_band_label(Some("0"), Some("HT20"), 1), "2.4GHz");
        assert_eq!(infer_band_label(Some("0"), Some("HT40"), 1), "2.4GHz");
    }

    #[test]
    fn infer_band_none_channel_uses_position() {
        assert_eq!(infer_band_label(None, None, 0), "2.4GHz");
        assert_eq!(infer_band_label(None, None, 1), "5GHz");
        assert_eq!(infer_band_label(None, None, 2), "5GHz");
    }

    // ── deduplicate_wifi_bands ────────────────────────────

    #[test]
    fn dedup_production_root_cause_two_channel_zero_entries() {
        // This is the exact production payload that caused the bug:
        // both entries have channel="0", bandwidth="0" → both inferred as "2.4GHz"
        // before the fix.  After the fix, position-based inference gives
        // entry[0]→"2.4GHz" and entry[1]→"5GHz", so they are DIFFERENT keys
        // and both survive dedup.
        let raw = vec![
            band("0", "0", -93), // index 0 → 2.4GHz
            band("0", "0", -94), // index 1 → 5GHz
        ];
        let result = deduplicate_wifi_bands(raw);
        assert_eq!(result.len(), 2, "must have exactly 2 bands after dedup");
        assert_eq!(result[0].band, "2.4GHz");
        assert_eq!(result[1].band, "5GHz");
    }

    #[test]
    fn dedup_removes_genuine_duplicates_same_band_same_ssid() {
        // Mesh system emits the same SSID+channel combo for each satellite node.
        // e.g. 4 nodes × 2.4GHz = 4 identical entries → should become 1.
        let raw = vec![
            band("6", "HT20", -70),
            band("6", "HT20", -65), // better signal — should be kept
            band("6", "HT20", -80),
        ];
        let result = deduplicate_wifi_bands(raw);
        assert_eq!(
            result.len(),
            1,
            "three identical 2.4GHz entries collapse to 1"
        );
        assert_eq!(result[0].band, "2.4GHz");
        assert_eq!(result[0].signal, Some(-65), "keeps entry with best signal");
    }

    #[test]
    fn dedup_keeps_distinct_bands_and_ssids() {
        // Typical dual-band: 2.4 + 5, different channels → no dedup
        let raw = vec![
            band("6", "HT20", -70),   // 2.4GHz
            band("36", "VHT80", -60), // 5GHz
        ];
        let result = deduplicate_wifi_bands(raw);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].band, "2.4GHz");
        assert_eq!(result[1].band, "5GHz");
    }

    #[test]
    fn dedup_keeps_same_band_different_ssid() {
        // Guest SSID on same band as main SSID — both should appear
        let mut b1 = band("6", "HT20", -70);
        b1.ssid = Some("OK Home".to_string());
        let mut b2 = band("6", "HT20", -70);
        b2.ssid = Some("OK Home_Guest".to_string());
        let result = deduplicate_wifi_bands(vec![b1, b2]);
        assert_eq!(
            result.len(),
            2,
            "different SSIDs on same band must both survive"
        );
    }

    // ── sanitize_mesh_name / locale ─────────────────────────────
    //
    // Regression for #807: Xiaomi mesh satellites that were never renamed in
    // the router admin come back with `name: "default"`. Returning that
    // verbatim to the UI made every satellite render as the literal string
    // "default". The sanitizer drops "default"/empty/whitespace so the
    // frontend can fall back to a real identifier.

    #[test]
    fn sanitize_drops_literal_default() {
        assert_eq!(sanitize_mesh_name(Some("default".to_string())), None);
        assert_eq!(sanitize_mesh_name(Some("DEFAULT".to_string())), None);
        assert_eq!(sanitize_mesh_name(Some("Default".to_string())), None);
    }

    #[test]
    fn sanitize_drops_empty_and_whitespace() {
        assert_eq!(sanitize_mesh_name(None), None);
        assert_eq!(sanitize_mesh_name(Some(String::new())), None);
        assert_eq!(sanitize_mesh_name(Some("   ".to_string())), None);
        assert_eq!(sanitize_mesh_name(Some("\t".to_string())), None);
    }

    #[test]
    fn sanitize_preserves_real_names() {
        assert_eq!(
            sanitize_mesh_name(Some("Live Studio".to_string())),
            Some("Live Studio".to_string())
        );
        assert_eq!(
            sanitize_mesh_name(Some("  Basement  ".to_string())),
            Some("Basement".to_string()),
            "trims surrounding whitespace"
        );
    }

    #[test]
    fn sanitize_locale_keeps_role_strings() {
        // `locale` on the older firmware encodes the mesh role
        // (master/slave). Those are meaningful and must survive.
        assert_eq!(
            sanitize_mesh_locale(Some("master".to_string())),
            Some("master".to_string())
        );
        assert_eq!(
            sanitize_mesh_locale(Some("slave".to_string())),
            Some("slave".to_string())
        );
    }
}
