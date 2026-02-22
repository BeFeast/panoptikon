/**
 * Shared TypeScript types for Panoptikon frontend.
 * These mirror the Rust server's API response shapes.
 */

// ─── Devices ────────────────────────────────────────────

export interface Device {
  id: string;
  mac: string;
  name: string | null;
  hostname: string | null;
  vendor: string | null;
  icon: string;
  notes: string | null;
  is_known: boolean;
  is_favorite: boolean;
  first_seen_at: string;
  last_seen_at: string;
  is_online: boolean;
  /** Current IP addresses — backend returns plain strings. */
  ips: string[];
  /** mDNS/Bonjour discovered service types (comma-separated). */
  mdns_services?: string | null;
  agent?: AgentSummary | null;
  /** Muted until timestamp (if device is muted). */
  muted_until?: string | null;
  /** OS family (e.g. "iOS", "Android", "Windows", "Linux", "macOS"). */
  os_family?: string | null;
  /** OS version string (if known). */
  os_version?: string | null;
  /** Device type (e.g. "phone", "laptop", "router", "printer"). */
  device_type?: string | null;
  /** Device model name (e.g. "iPhone SE 2022"). */
  device_model?: string | null;
  /** Device brand (e.g. "Apple", "Samsung"). */
  device_brand?: string | null;
  /** Which enrichment source provided the identification. */
  enrichment_source?: string | null;
  /** Whether user has manually corrected the enrichment. */
  enrichment_corrected?: boolean | null;
}

export interface AgentSummary {
  id: string;
  name: string | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  is_online: boolean;
}

// ─── Agents ─────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string | null;
  hostname: string | null;
  os_name: string | null;
  os_version: string | null;
  platform: string | null;
  version: string | null;
  is_online: boolean;
  last_report_at: string | null;
  created_at: string;
}

export interface AgentCreateResponse {
  id: string;
  api_key: string;
}

export interface AgentReport {
  id: number;
  cpu_percent: number | null;
  mem_used: number | null;
  mem_total: number | null;
  reported_at: string;
}

// ─── Alerts ─────────────────────────────────────────────

export interface Alert {
  id: string;
  type: "device_online" | "device_offline" | "new_device" | "high_bandwidth" | "agent_offline";
  device_id: string | null;
  agent_id: string | null;
  message: string;
  details: string | null;
  is_read: boolean;
  severity: "INFO" | "WARNING" | "CRITICAL";
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

// ─── Dashboard / Stats ──────────────────────────────────

/** Shape returned by the /api/v1/dashboard/stats endpoint. */
export interface DashboardStats {
  router_status: string;
  devices_online: number;
  devices_total: number;
  alerts_unread: number;
  wan_rx_bps: number;
  wan_tx_bps: number;
}

export interface TopDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip: string;
  vendor: string | null;
  rx_bps: number;
  tx_bps: number;
}

// ─── Traffic ────────────────────────────────────────────

export interface TrafficHistoryPoint {
  minute: string;
  rx_bps: number;
  tx_bps: number;
}

// ─── NetFlow ────────────────────────────────────────────

export interface NetflowStatus {
  enabled: boolean;
  port: number;
  flows_received: number;
}

// ─── Router / VyOS ──────────────────────────────────────

export interface RouterStatus {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  uptime: string | null;
  hostname: string | null;
}

export interface SpeedTestResult {
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss: number;
  isp: string;
  server: string;
  result_url: string | null;
  tested_at: string;
  error: string | null;
}

export interface VyosInterface {
  name: string;
  ip_address: string | null;
  mac: string | null;
  vrf: string | null;
  mtu: number;
  admin_state: string;
  link_state: string;
  description: string | null;
}

export interface VyosRoute {
  protocol: string;
  destination: string;
  gateway: string | null;
  interface: string | null;
  metric: string | null;
  uptime: string | null;
  selected: boolean;
}

export interface VyosDhcpLease {
  ip: string;
  mac: string;
  hostname: string | null;
  state: string;
  lease_start: string | null;
  lease_expiry: string | null;
  remaining: string | null;
  pool: string | null;
}

// ─── DHCP Static Mappings ──────────────────────────────

export interface DhcpStaticMapping {
  network: string;
  subnet: string;
  name: string;
  mac: string;
  ip: string;
}

export interface VyosWriteResponse {
  success: boolean;
  message: string;
}

// ─── NAT Destination (Port Forwarding) ──────────────────

export interface NatDestinationRule {
  rule: number;
  description: string | null;
  inbound_interface: string | null;
  external_port: string | null;
  internal_ip: string | null;
  internal_port: string | null;
  protocol: string | null;
}

// ─── Firewall ───────────────────────────────────────────

export interface FirewallRule {
  number: number;
  action: string;
  source: string | null;
  destination: string | null;
  protocol: string | null;
  state: string | null;
  description: string | null;
  disabled: boolean;
}

export interface FirewallChain {
  name: string;
  default_action: string;
  rules: FirewallRule[];
  /** VyOS config path components: [ip_version, direction, filter_type] */
  path: string[];
}

export interface FirewallRuleRequest {
  number: number;
  action: string;
  protocol?: string;
  source_address?: string;
  source_port?: string;
  destination_address?: string;
  destination_port?: string;
  description?: string;
  state?: string[];
  disabled: boolean;
}

export interface FirewallConfig {
  chains: FirewallChain[];
}

export interface FirewallAddressGroup {
  name: string;
  description: string | null;
  members: string[];
}

export interface FirewallNetworkGroup {
  name: string;
  description: string | null;
  members: string[];
}

export interface FirewallPortGroup {
  name: string;
  description: string | null;
  members: string[];
}

export interface FirewallGroups {
  address_groups: FirewallAddressGroup[];
  network_groups: FirewallNetworkGroup[];
  port_groups: FirewallPortGroup[];
}

export interface SettingsData {
  webhook_url: string | null;
  vyos_url: string | null;
  vyos_api_key_set: boolean;
  // Network Scanner
  scan_interval_seconds: number | null;
  scan_subnets: string | null;
  ping_sweep_enabled: boolean | null;
  // Data Retention
  retention_traffic_hours: number | null;
  retention_alerts_days: number | null;
  retention_agent_reports_days: number | null;
}

export interface DbSizeData {
  size_bytes: number;
}

// ─── Search ─────────────────────────────────────────────

export interface SearchDevice {
  id: string;
  ip_address: string | null;
  hostname: string | null;
  mac_address: string;
  vendor: string | null;
  is_online: boolean;
}

export interface SearchAgent {
  id: string;
  name: string | null;
  hostname: string | null;
  is_online: boolean;
}

export interface SearchAlert {
  id: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  created_at: string;
}

export interface SearchResponse {
  devices: SearchDevice[];
  agents: SearchAgent[];
  alerts: SearchAlert[];
}

// ─── Auth ───────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  needs_setup: boolean;
}

export interface LoginResponse {
  message: string;
}
