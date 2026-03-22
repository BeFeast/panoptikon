//! Deserialization types for pfSense bridge responses.
//!
//! ## ID strategy
//! - Firewall rules: `tracker` field (pfSense-native, unique per rule)
//! - NAT port-forward rules: `tracker` field (same as firewall)
//! - DHCP static mappings: SHA-256(mac + ip + interface), truncated to 16 hex chars
//! - DNS host overrides: SHA-256(host + domain + ip), truncated to 16 hex chars
//! - Aliases: `name` (natural unique key)

use serde::{Deserialize, Serialize};

/// pfSense system information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseSystemInfo {
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub cpu_usage: Option<f64>,
    pub memory_total: Option<u64>,
    pub memory_used: Option<u64>,
    pub platform: Option<String>,
}

/// pfSense network interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseInterface {
    pub name: Option<String>,
    pub descr: Option<String>,
    #[serde(alias = "type")]
    pub iface_type: Option<String>,
    pub status: Option<String>,
    pub ip_address: Option<String>,
    pub subnet: Option<String>,
    pub mac: Option<String>,
    pub mtu: Option<String>,
    pub media: Option<String>,
}

/// pfSense gateway entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseGateway {
    pub name: Option<String>,
    pub interface: Option<String>,
    pub gateway_ip: Option<String>,
    pub monitor_ip: Option<String>,
    pub status: Option<String>,
    pub delay: Option<String>,
    pub stddev: Option<String>,
    pub loss: Option<String>,
}

/// pfSense static route.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseRoute {
    pub network: Option<String>,
    pub gateway: Option<String>,
    pub interface: Option<String>,
    pub flags: Option<String>,
}

/// pfSense DHCP lease.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseDhcpLease {
    pub ip: Option<String>,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub status: Option<String>,
    pub interface: Option<String>,
}

/// pfSense DHCP static mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseDhcpStaticMapping {
    pub id: Option<String>,
    pub mac: Option<String>,
    pub ip: Option<String>,
    pub hostname: Option<String>,
    pub description: Option<String>,
    pub interface: Option<String>,
}

/// pfSense firewall filter rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseFirewallRule {
    pub id: Option<String>,
    #[serde(alias = "type")]
    pub action: Option<String>,
    pub interface: Option<String>,
    pub protocol: Option<String>,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub port: Option<String>,
    pub description: Option<String>,
    pub disabled: Option<bool>,
    pub log: Option<bool>,
    pub tracker: Option<String>,
}

/// pfSense NAT port-forward rule (v1 scope: port forwards only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseNatRule {
    /// Stable ID: pfSense tracker field.
    pub id: Option<String>,
    pub interface: Option<String>,
    pub protocol: Option<String>,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub target: Option<String>,
    pub local_port: Option<String>,
    pub description: Option<String>,
    pub disabled: Option<bool>,
    pub tracker: Option<String>,
}

/// pfSense firewall alias.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseAlias {
    pub name: Option<String>,
    #[serde(alias = "type")]
    pub alias_type: Option<String>,
    pub address: Option<String>,
    pub description: Option<String>,
    pub detail: Option<String>,
}

/// pfSense DNS configuration (Unbound resolver only in v1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseDnsConfig {
    pub resolver_enabled: Option<bool>,
    pub servers: Option<Vec<String>>,
}

/// pfSense DNS host override.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseDnsOverride {
    pub id: Option<String>,
    pub host: Option<String>,
    pub domain: Option<String>,
    pub ip: Option<String>,
    pub description: Option<String>,
}

/// pfSense config backup snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseConfigSnapshot {
    pub id: Option<String>,
    pub timestamp: Option<String>,
    pub description: Option<String>,
    pub size_bytes: Option<u64>,
}

/// pfSense config diff result (preview + audit).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseConfigDiff {
    /// Short semantic description for UI preview (e.g. "modified firewall rules, modified NAT rules").
    pub summary: Option<String>,
    /// Raw XML unified diff for technical detail and audit storage.
    pub diff: Option<String>,
}

/// pfSense audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseAuditEntry {
    pub id: Option<String>,
    pub timestamp: Option<String>,
    pub action: Option<String>,
    pub description: Option<String>,
    pub diff: Option<String>,
    pub success: Option<bool>,
}

/// Composite pfSense status (connection + system info).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PfsenseStatus {
    pub configured: bool,
    pub reachable: bool,
    pub hostname: Option<String>,
    pub domain: Option<String>,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub cpu_usage: Option<f64>,
    pub memory_total: Option<u64>,
    pub memory_used: Option<u64>,
    pub platform: Option<String>,
}

/// Generic bridge response wrapper.
#[derive(Debug, Clone, Deserialize)]
pub struct BridgeResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}
