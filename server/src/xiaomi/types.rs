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

// ── System status ───────────────────────────────────────────

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCount {
    #[serde(default)]
    pub online: Option<i32>,
    #[serde(default)]
    pub all: Option<i32>,
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
    pub temperature: Option<i32>,
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

// ── New status ──────────────────────────────────────────────

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

#[derive(Debug, Clone, Deserialize)]
pub struct NewStatus {
    #[serde(default)]
    pub hardware: Option<HardwareInfo>,
    #[serde(default)]
    pub wan: Option<serde_json::Value>,
    #[serde(default)]
    pub count: Option<DeviceCount>,
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

// ── WAN info ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanInfo {
    #[serde(default)]
    pub ip: Option<String>,
    #[serde(default)]
    pub gateway: Option<String>,
    #[serde(default)]
    pub dns: Option<String>,
    #[serde(default, rename = "wanType")]
    pub wan_type: Option<String>,
    #[serde(default)]
    pub mask: Option<String>,
    #[serde(default, rename = "ipv6")]
    pub ipv6: Option<serde_json::Value>,
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
