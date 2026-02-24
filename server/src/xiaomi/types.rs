//! Deserialization types for Xiaomi MiWiFi API responses.

use serde::{Deserialize, Serialize};

/// Generic MiWiFi API response wrapper.
#[derive(Debug, Clone, Deserialize)]
pub struct MiWiFiResponse<T> {
    pub code: i32,
    #[serde(flatten)]
    pub data: T,
}

/// `api/misystem/status` response.
#[derive(Debug, Clone, Deserialize)]
pub struct SystemStatusData {
    pub mem: Option<MemInfo>,
    pub cpu: Option<CpuInfo>,
    pub wan: Option<WanTraffic>,
    pub count: Option<DeviceCount>,
    pub temperature: Option<f64>,
    pub uptime: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemInfo {
    pub usage: Option<f64>,
    pub total: Option<String>,
    pub hz: Option<String>,
    #[serde(rename = "type")]
    pub mem_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CpuInfo {
    pub core: Option<u32>,
    pub hz: Option<String>,
    pub load: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanTraffic {
    pub downspeed: Option<String>,
    pub upspeed: Option<String>,
    pub maxdownloadspeed: Option<String>,
    pub maxuploadspeed: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeviceCount {
    pub online: Option<u32>,
    pub all: Option<u32>,
    #[serde(rename = "online_without_mash")]
    pub online_without_mesh: Option<u32>,
    #[serde(rename = "all_without_mash")]
    pub all_without_mesh: Option<u32>,
}

/// `api/xqnetwork/wan_info` response.
#[derive(Debug, Clone, Deserialize)]
pub struct WanInfoData {
    pub info: Option<WanDetail>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanDetail {
    #[serde(rename = "wanType")]
    pub wan_type: Option<String>,
    pub ipv4: Option<WanIpv4>,
    pub ipv6: Option<WanIpv6>,
    pub details: Option<WanDetails>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanIpv4 {
    pub ip: Option<String>,
    pub mask: Option<String>,
    pub gateway: Option<String>,
    pub dns1: Option<String>,
    pub dns2: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanIpv6 {
    pub ip: Option<String>,
    pub gateway: Option<String>,
    pub dns1: Option<String>,
    pub dns2: Option<String>,
    pub prefix: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WanDetails {
    #[serde(rename = "wanType")]
    pub wan_type: Option<String>,
    pub pppname: Option<String>,
}

/// `api/xqsystem/init_info` response.
#[derive(Debug, Clone, Deserialize)]
pub struct InitInfoData {
    #[serde(rename = "routername")]
    pub router_name: Option<String>,
    #[serde(rename = "romversion")]
    pub rom_version: Option<String>,
    pub hardware: Option<String>,
    pub language: Option<String>,
}

/// `api/xqsystem/check_rom_update` response.
#[derive(Debug, Clone, Deserialize)]
pub struct RomUpdateData {
    #[serde(rename = "needUpdate")]
    pub need_update: Option<i32>,
}

/// `api/misystem/newstatus` response — WiFi band info.
#[derive(Debug, Clone, Deserialize)]
pub struct NewStatusData {
    #[serde(rename = "2g")]
    pub band_2g: Option<BandInfo>,
    #[serde(rename = "5g")]
    pub band_5g: Option<BandInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BandInfo {
    pub ssid: Option<String>,
    pub channel: Option<u32>,
    pub bandwidth: Option<String>,
}

/// `api/xqnetwork/wifi_detail_all` response.
#[derive(Debug, Clone, Deserialize)]
pub struct WifiDetailAllData {
    pub info: Option<Vec<WifiBandDetail>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WifiBandDetail {
    #[serde(rename = "ifname")]
    pub if_name: Option<String>,
    pub ssid: Option<String>,
    pub status: Option<String>,
    pub channel: Option<serde_json::Value>,
    pub bandwidth: Option<String>,
    pub encryption: Option<String>,
    #[serde(rename = "bandsteering")]
    pub band_steering: Option<String>,
}

/// Token response from `api/xqsystem/login`.
#[derive(Debug, Clone, Deserialize)]
pub struct LoginResponse {
    pub code: i32,
    pub token: Option<String>,
}

// ── Serialized API response types (sent to frontend) ─────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiStatusResponse {
    pub configured: bool,
    pub reachable: bool,
    pub cpu: Option<XiaomiCpu>,
    pub mem: Option<XiaomiMem>,
    pub temperature: Option<f64>,
    pub uptime: Option<String>,
    pub wan_traffic: Option<XiaomiWanTraffic>,
    pub device_count: Option<XiaomiDeviceCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiCpu {
    pub cores: Option<u32>,
    pub frequency: Option<String>,
    pub load: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiMem {
    pub usage: Option<f64>,
    pub total: Option<String>,
    pub frequency: Option<String>,
    pub mem_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiWanTraffic {
    pub download_speed: Option<String>,
    pub upload_speed: Option<String>,
    pub max_download_speed: Option<String>,
    pub max_upload_speed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiDeviceCount {
    pub online: Option<u32>,
    pub total: Option<u32>,
    pub online_without_mesh: Option<u32>,
    pub total_without_mesh: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiWanInfoResponse {
    pub wan_type: Option<String>,
    pub ip: Option<String>,
    pub mask: Option<String>,
    pub gateway: Option<String>,
    pub dns_servers: Vec<String>,
    pub ipv6_ip: Option<String>,
    pub ipv6_gateway: Option<String>,
    pub ipv6_dns: Vec<String>,
    pub ipv6_prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiWifiBand {
    pub name: String,
    pub ssid: Option<String>,
    pub channel: Option<String>,
    pub bandwidth: Option<String>,
    pub encryption: Option<String>,
    pub band_steering: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiWifiResponse {
    pub bands: Vec<XiaomiWifiBand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiFirmwareResponse {
    pub router_name: Option<String>,
    pub rom_version: Option<String>,
    pub hardware: Option<String>,
    pub language: Option<String>,
    pub update_available: bool,
}
