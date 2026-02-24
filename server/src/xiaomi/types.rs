//! Deserialization types for Xiaomi MiWiFi API responses.

use serde::{Deserialize, Serialize};

// ── Wrapper: every MiWiFi response has `{ "code": 0, ... }` ──

/// Generic MiWiFi API response wrapper.
#[derive(Debug, Clone, Deserialize)]
pub struct MiWiFiResponse<T> {
    pub code: i32,
    #[serde(flatten)]
    pub data: T,
}

// ── Login ───────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct LoginResponse {
    pub token: Option<String>,
}

// ── Topology (topo_graph) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopoNode {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub online: Option<i32>,
    #[serde(default)]
    pub hardware: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopoLeaf {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub online: Option<i32>,
    #[serde(default, rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TopoGraph {
    #[serde(default)]
    pub graph: Option<TopoGraphInner>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TopoGraphInner {
    #[serde(default)]
    pub nodes: Vec<TopoNode>,
    #[serde(default)]
    pub leafs: Vec<TopoLeaf>,
}

// ── System status (misystem/status) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemInfo {
    #[serde(default)]
    pub usage: Option<f64>,
    #[serde(default)]
    pub total: Option<String>,
    #[serde(default)]
    pub hz: Option<String>,
    #[serde(default, rename = "type")]
    pub mem_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    #[serde(default)]
    pub core: Option<i32>,
    #[serde(default)]
    pub hz: Option<String>,
    #[serde(default)]
    pub load: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanSpeed {
    #[serde(default)]
    pub downspeed: Option<String>,
    #[serde(default)]
    pub upspeed: Option<String>,
    #[serde(default)]
    pub maxdownloadspeed: Option<String>,
    #[serde(default)]
    pub maxuploadspeed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCount {
    #[serde(default)]
    pub online: Option<i32>,
    #[serde(default)]
    pub all: Option<i32>,
    #[serde(default, rename = "online_without_mash")]
    pub online_without_mesh: Option<i32>,
    #[serde(default, rename = "all_without_mash")]
    pub all_without_mesh: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemStatus {
    #[serde(default)]
    pub mem: Option<MemInfo>,
    #[serde(default)]
    pub cpu: Option<CpuInfo>,
    #[serde(default)]
    pub wan: Option<WanSpeed>,
    #[serde(default)]
    pub count: Option<DeviceCount>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub uptime: Option<String>,
}

// ── Device list ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiWiFiDevice {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub ip: Vec<MiWiFiDeviceIp>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "type")]
    pub device_type: Option<i32>,
    #[serde(default)]
    pub online: Option<String>,
    #[serde(default)]
    pub authority: Option<serde_json::Value>,
    #[serde(default, rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiWiFiDeviceIp {
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub downspeed: Option<String>,
    #[serde(default)]
    pub upspeed: Option<String>,
    #[serde(default)]
    pub online: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeviceListResponse {
    #[serde(default)]
    pub list: Vec<MiWiFiDevice>,
}

// ── New status (misystem/newstatus) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareInfo {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub sn: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandStatus {
    #[serde(default)]
    pub online: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewStatus {
    #[serde(default)]
    pub hardware: Option<HardwareInfo>,
    #[serde(default)]
    pub wan: Option<serde_json::Value>,
    #[serde(default)]
    pub count: Option<DeviceCount>,
    #[serde(default, rename = "2g")]
    pub band_2g: Option<BandStatus>,
    #[serde(default, rename = "5g")]
    pub band_5g: Option<BandStatus>,
}

// ── WiFi connected devices ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiDevice {
    #[serde(default)]
    pub mac: Option<String>,
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub signal: Option<i32>,
    #[serde(default)]
    pub band: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WifiDevicesResponse {
    #[serde(default)]
    pub list: Vec<WifiDevice>,
}

// ── WAN info (xqnetwork/wan_info) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanIpv4 {
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default, rename = "dns1")]
    pub dns1: Option<String>,
    #[serde(default, rename = "dns2")]
    pub dns2: Option<String>,
    #[serde(default)]
    pub mask: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanIpv6 {
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub prefix: Option<String>,
    #[serde(default, rename = "dns1")]
    pub dns1: Option<String>,
    #[serde(default, rename = "dns2")]
    pub dns2: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanInfo {
    #[serde(default)]
    pub ipv4: Option<WanIpv4>,
    #[serde(default)]
    pub ipv6: Option<WanIpv6>,
    #[serde(default, rename = "wanType")]
    pub wan_type: Option<String>,
    // Flat fields — some routers return these at the top level.
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Option<String>,
    #[serde(default)]
    pub mask: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanInfoResponse {
    #[serde(default)]
    pub info: Option<WanInfo>,
}

// ── LAN info ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanPort {
    #[serde(default)]
    pub port: Option<i32>,
    #[serde(default)]
    pub linkstatus: Option<String>,
    #[serde(default)]
    pub speed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanInfo {
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub mask: Option<String>,
    #[serde(default)]
    pub ports: Vec<LanPort>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LanInfoResponse {
    #[serde(default)]
    pub info: Option<LanInfo>,
}

// ── Init info (xqsystem/init_info) ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitInfoResponse {
    #[serde(default)]
    pub code: Option<i32>,
    #[serde(default, rename = "routername")]
    pub router_name: Option<String>,
    #[serde(default)]
    pub hardware: Option<String>,
    #[serde(default, rename = "romversion")]
    pub rom_version: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
}

// ── ROM update check (xqsystem/check_rom_update) ───────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckRomUpdateResponse {
    #[serde(default)]
    pub code: Option<i32>,
    #[serde(default, rename = "needUpdate")]
    pub need_update: Option<bool>,
    #[serde(default)]
    pub latest: Option<String>,
}

// ── WiFi detail (xqnetwork/wifi_detail_all) ─────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiBandDetail {
    #[serde(default)]
    pub ifname: Option<String>,
    #[serde(default)]
    pub ssid: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub bandwidth: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiDetailAllResponse {
    #[serde(default)]
    pub code: Option<i32>,
    #[serde(default)]
    pub info: Option<Vec<WifiBandDetail>>,
}
