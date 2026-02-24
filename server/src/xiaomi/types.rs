//! Deserialization types for Xiaomi MiWiFi API responses.

use serde::{Deserialize, Deserializer, Serialize};

fn de_opt_string_from_any<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::String(s) => {
            if s.trim().is_empty() {
                None
            } else {
                Some(s)
            }
        }
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }))
}

fn de_opt_f64_from_any<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
        serde_json::Value::Bool(b) => Some(if b { 1.0 } else { 0.0 }),
        _ => None,
    }))
}

fn de_opt_i32_from_any<'de, D>(deserializer: D) -> Result<Option<i32>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(value.and_then(|v| match v {
        serde_json::Value::Number(n) => n
            .as_i64()
            .and_then(|v| i32::try_from(v).ok())
            .or_else(|| n.as_u64().and_then(|v| i32::try_from(v).ok()))
            .or_else(|| n.as_f64().map(|v| v.round() as i32)),
        serde_json::Value::String(s) => s.trim().parse::<f64>().ok().map(|v| v.round() as i32),
        serde_json::Value::Bool(b) => Some(if b { 1 } else { 0 }),
        _ => None,
    }))
}

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
    #[serde(default, deserialize_with = "de_opt_f64_from_any")]
    pub usage: Option<f64>,
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub total: Option<String>,
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub hz: Option<String>,
    #[serde(default, rename = "type", deserialize_with = "de_opt_string_from_any")]
    pub mem_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    #[serde(default, deserialize_with = "de_opt_i32_from_any")]
    pub core: Option<i32>,
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub hz: Option<String>,
    #[serde(default, deserialize_with = "de_opt_f64_from_any")]
    pub load: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WanSpeed {
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub downspeed: Option<String>,
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub upspeed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCount {
    #[serde(default, deserialize_with = "de_opt_i32_from_any")]
    pub online: Option<i32>,
    #[serde(default, deserialize_with = "de_opt_i32_from_any")]
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
    #[serde(default, deserialize_with = "de_opt_i32_from_any")]
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

// ── WiFi detail per band ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiBandDetail {
    #[serde(default)]
    pub ssid: Option<String>,
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub bandwidth: Option<String>,
    #[serde(default)]
    pub encryption: Option<String>,
    #[serde(default)]
    pub signal: Option<i32>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default, rename = "bandsteering")]
    pub band_steering: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WifiDetailAllResponse {
    #[serde(default)]
    pub info: Vec<WifiBandDetail>,
}

// ── Init info (firmware / hardware) ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitInfo {
    #[serde(default, rename = "routername")]
    pub router_name: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default, rename = "romversion")]
    pub rom_version: Option<String>,
    #[serde(default)]
    pub hardware: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub countrycode: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
}

// ── ROM update check ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RomUpdateInfo {
    #[serde(default, rename = "needUpdate")]
    pub need_update: Option<i32>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default, rename = "changelogUrl")]
    pub changelog_url: Option<String>,
    #[serde(default, rename = "fileSize")]
    pub file_size: Option<String>,
}

// ── System status with uptime ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UptimeResponse {
    #[serde(default, deserialize_with = "de_opt_string_from_any")]
    pub uptime: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_status_deserializes_mixed_scalar_types() {
        let payload = serde_json::json!({
            "code": 0,
            "mem": {
                "usage": "0.42",
                "total": 256,
                "hz": 2400,
                "type": 1
            },
            "cpu": {
                "core": "4",
                "hz": 880,
                "load": "12.5"
            },
            "wan": {
                "downspeed": 12345,
                "upspeed": "9876"
            },
            "count": {
                "online": "7",
                "all": 11
            },
            "temperature": "46"
        });

        let parsed: SystemStatus = serde_json::from_value(payload).expect("status should parse");
        assert_eq!(parsed.mem.and_then(|m| m.total), Some("256".to_string()));
        assert_eq!(parsed.cpu.and_then(|c| c.core), Some(4));
        assert_eq!(parsed.temperature, Some(46));
    }

    #[test]
    fn uptime_deserializes_from_number() {
        let payload = serde_json::json!({ "uptime": 123 });
        let parsed: UptimeResponse = serde_json::from_value(payload).expect("uptime should parse");
        assert_eq!(parsed.uptime, Some("123".to_string()));
    }
}
