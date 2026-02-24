//! Deserialization types for MikroTik RouterOS REST API responses.

use serde::{Deserialize, Serialize};

/// MikroTik system resource (`/rest/system/resource`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResource {
    pub uptime: Option<String>,
    pub version: Option<String>,
    #[serde(rename = "cpu-load")]
    pub cpu_load: Option<String>,
    #[serde(rename = "free-memory")]
    pub free_memory: Option<String>,
    #[serde(rename = "total-memory")]
    pub total_memory: Option<String>,
    #[serde(rename = "cpu")]
    pub cpu: Option<String>,
    #[serde(rename = "cpu-count")]
    pub cpu_count: Option<String>,
    #[serde(rename = "board-name")]
    pub board_name: Option<String>,
    pub architecture: Option<String>,
    #[serde(rename = "platform")]
    pub platform: Option<String>,
    #[serde(rename = "free-hdd-space")]
    pub free_hdd_space: Option<String>,
    #[serde(rename = "total-hdd-space")]
    pub total_hdd_space: Option<String>,
}

/// MikroTik interface (`/rest/interface`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtInterface {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub iface_type: Option<String>,
    pub mtu: Option<String>,
    #[serde(rename = "mac-address")]
    pub mac_address: Option<String>,
    pub disabled: Option<String>,
    pub running: Option<String>,
    pub comment: Option<String>,
    #[serde(rename = "tx-byte")]
    pub tx_byte: Option<String>,
    #[serde(rename = "rx-byte")]
    pub rx_byte: Option<String>,
    #[serde(rename = "last-link-up-time")]
    pub last_link_up_time: Option<String>,
}

/// MikroTik VLAN interface (`/rest/interface/vlan`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlanInterface {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub name: Option<String>,
    pub interface: Option<String>,
    #[serde(rename = "vlan-id")]
    pub vlan_id: Option<String>,
    pub mtu: Option<String>,
    pub disabled: Option<String>,
    pub comment: Option<String>,
}

/// MikroTik VLAN write payload.
#[derive(Debug, Clone, Serialize)]
pub struct VlanWriteRequest {
    pub name: String,
    pub interface: String,
    #[serde(rename = "vlan-id")]
    pub vlan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtu: Option<String>,
}

/// MikroTik IP address (`/rest/ip/address`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpAddress {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub address: Option<String>,
    pub network: Option<String>,
    pub interface: Option<String>,
    pub disabled: Option<String>,
}

/// MikroTik IP route (`/rest/ip/route`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpRoute {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    #[serde(rename = "dst-address")]
    pub dst_address: Option<String>,
    pub gateway: Option<String>,
    #[serde(rename = "gateway-status")]
    pub gateway_status: Option<String>,
    pub distance: Option<String>,
    pub scope: Option<String>,
    #[serde(rename = "routing-table")]
    pub routing_table: Option<String>,
    pub active: Option<String>,
    pub disabled: Option<String>,
    pub dynamic: Option<String>,
    pub comment: Option<String>,
}

/// MikroTik DHCP lease (`/rest/ip/dhcp-server/lease`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DhcpLease {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub address: Option<String>,
    #[serde(rename = "mac-address")]
    pub mac_address: Option<String>,
    #[serde(rename = "host-name")]
    pub host_name: Option<String>,
    pub status: Option<String>,
    #[serde(rename = "expires-after")]
    pub expires_after: Option<String>,
    #[serde(rename = "last-seen")]
    pub last_seen: Option<String>,
    pub server: Option<String>,
    pub dynamic: Option<String>,
    pub disabled: Option<String>,
    pub comment: Option<String>,
}

/// MikroTik firewall filter rule (`/rest/ip/firewall/filter`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallFilter {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    #[serde(rename = "src-address")]
    pub src_address: Option<String>,
    #[serde(rename = "dst-address")]
    pub dst_address: Option<String>,
    #[serde(rename = "dst-port")]
    pub dst_port: Option<String>,
    #[serde(rename = "src-port")]
    pub src_port: Option<String>,
    #[serde(rename = "in-interface")]
    pub in_interface: Option<String>,
    #[serde(rename = "out-interface")]
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<String>,
    pub bytes: Option<String>,
    pub packets: Option<String>,
}

/// MikroTik firewall filter write payload.
#[derive(Debug, Clone, Serialize)]
pub struct FirewallFilterWriteRequest {
    pub chain: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "src-address")]
    pub src_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "dst-address")]
    pub dst_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "src-port")]
    pub src_port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "dst-port")]
    pub dst_port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "in-interface")]
    pub in_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "out-interface")]
    pub out_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<String>,
}

/// MikroTik firewall NAT rule (`/rest/ip/firewall/nat`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallNat {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub chain: Option<String>,
    pub action: Option<String>,
    pub protocol: Option<String>,
    #[serde(rename = "src-address")]
    pub src_address: Option<String>,
    #[serde(rename = "dst-address")]
    pub dst_address: Option<String>,
    #[serde(rename = "dst-port")]
    pub dst_port: Option<String>,
    #[serde(rename = "to-addresses")]
    pub to_addresses: Option<String>,
    #[serde(rename = "to-ports")]
    pub to_ports: Option<String>,
    #[serde(rename = "in-interface")]
    pub in_interface: Option<String>,
    #[serde(rename = "out-interface")]
    pub out_interface: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<String>,
}

/// MikroTik firewall NAT write payload.
#[derive(Debug, Clone, Serialize)]
pub struct FirewallNatWriteRequest {
    pub chain: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "src-address")]
    pub src_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "dst-address")]
    pub dst_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "dst-port")]
    pub dst_port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "to-addresses")]
    pub to_addresses: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "to-ports")]
    pub to_ports: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "in-interface")]
    pub in_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "out-interface")]
    pub out_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<String>,
}

/// MikroTik firewall address list entry (`/rest/ip/firewall/address-list`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallAddressList {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub list: Option<String>,
    pub address: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<String>,
    pub dynamic: Option<String>,
}

/// MikroTik firewall address list write payload.
#[derive(Debug, Clone, Serialize)]
pub struct FirewallAddressListWriteRequest {
    pub list: String,
    pub address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<String>,
}

/// MikroTik DNS settings (`/rest/ip/dns`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsSettings {
    pub servers: Option<String>,
    #[serde(rename = "allow-remote-requests")]
    pub allow_remote_requests: Option<String>,
    #[serde(rename = "cache-size")]
    pub cache_size: Option<String>,
    #[serde(rename = "cache-used")]
    pub cache_used: Option<String>,
}

/// MikroTik bridge host entry (`/rest/interface/bridge/host`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeHost {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    #[serde(rename = "mac-address")]
    pub mac_address: Option<String>,
    pub interface: Option<String>,
    pub bridge: Option<String>,
    pub on_interface: Option<String>,
    pub dynamic: Option<String>,
    pub disabled: Option<String>,
}

/// MikroTik WireGuard interface (`/rest/interface/wireguard`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WgInterface {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "listen-port")]
    pub listen_port: Option<String>,
    #[serde(rename = "public-key")]
    pub public_key: Option<String>,
    #[serde(rename = "private-key")]
    pub private_key: Option<String>,
    pub mtu: Option<String>,
    pub disabled: Option<String>,
    pub running: Option<String>,
}

/// MikroTik interface monitor-traffic result (`/rest/interface/monitor-traffic`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorTrafficResult {
    #[serde(rename = "rx-bits-per-second")]
    pub rx_bits_per_second: Option<String>,
    #[serde(rename = "tx-bits-per-second")]
    pub tx_bits_per_second: Option<String>,
}

/// MikroTik simple queue (`/rest/queue/simple`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleQueue {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub name: Option<String>,
    pub target: Option<String>,
    #[serde(rename = "max-limit")]
    pub max_limit: Option<String>,
    #[serde(rename = "burst-limit")]
    pub burst_limit: Option<String>,
    #[serde(rename = "burst-threshold")]
    pub burst_threshold: Option<String>,
    #[serde(rename = "burst-time")]
    pub burst_time: Option<String>,
    pub priority: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<String>,
    #[serde(rename = "total-queue")]
    pub total_queue: Option<String>,
    pub parent: Option<String>,
    pub bytes: Option<String>,
    pub packets: Option<String>,
    #[serde(rename = "queued-bytes")]
    pub queued_bytes: Option<String>,
    #[serde(rename = "queued-packets")]
    pub queued_packets: Option<String>,
    pub rate: Option<String>,
    #[serde(rename = "packet-rate")]
    pub packet_rate: Option<String>,
    pub invalid: Option<String>,
    pub dynamic: Option<String>,
}

/// MikroTik simple queue write payload.
#[derive(Debug, Clone, Serialize)]
pub struct SimpleQueueWriteRequest {
    pub name: String,
    pub target: String,
    #[serde(rename = "max-limit")]
    pub max_limit: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "burst-limit")]
    pub burst_limit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "burst-threshold")]
    pub burst_threshold: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "burst-time")]
    pub burst_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

/// MikroTik queue tree entry (`/rest/queue/tree`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueTree {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub name: Option<String>,
    pub parent: Option<String>,
    #[serde(rename = "packet-mark")]
    pub packet_mark: Option<String>,
    pub priority: Option<String>,
    #[serde(rename = "max-limit")]
    pub max_limit: Option<String>,
    #[serde(rename = "burst-limit")]
    pub burst_limit: Option<String>,
    #[serde(rename = "burst-threshold")]
    pub burst_threshold: Option<String>,
    #[serde(rename = "burst-time")]
    pub burst_time: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<String>,
    pub bytes: Option<String>,
    pub packets: Option<String>,
    pub rate: Option<String>,
    #[serde(rename = "packet-rate")]
    pub packet_rate: Option<String>,
    pub invalid: Option<String>,
    pub dynamic: Option<String>,
    #[serde(rename = "queued-bytes")]
    pub queued_bytes: Option<String>,
}

/// MikroTik WireGuard peer (`/rest/interface/wireguard/peers`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WgPeer {
    #[serde(rename = ".id")]
    pub id: Option<String>,
    pub interface: Option<String>,
    #[serde(rename = "public-key")]
    pub public_key: Option<String>,
    #[serde(rename = "endpoint-address")]
    pub endpoint_address: Option<String>,
    #[serde(rename = "endpoint-port")]
    pub endpoint_port: Option<String>,
    #[serde(rename = "allowed-address")]
    pub allowed_address: Option<String>,
    #[serde(rename = "current-endpoint-address")]
    pub current_endpoint_address: Option<String>,
    #[serde(rename = "current-endpoint-port")]
    pub current_endpoint_port: Option<String>,
    pub rx: Option<String>,
    pub tx: Option<String>,
    #[serde(rename = "last-handshake")]
    pub last_handshake: Option<String>,
    pub disabled: Option<String>,
    pub comment: Option<String>,
}
