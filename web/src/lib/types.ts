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
  /** Whether the MAC address is locally administered (randomized). */
  is_randomized_mac?: boolean | null;
  /** Custom name override (user-defined). */
  custom_name?: string | null;
  /** Custom device type override. */
  custom_type?: string | null;
  /** Custom OS override. */
  custom_os?: string | null;
  /** Custom vendor/manufacturer override. */
  custom_vendor?: string | null;
  /** Custom model override. */
  custom_model?: string | null;
  /** Icon override (user-picked). */
  icon_override?: string | null;
}

// ─── Device Sysinfo (hardware inventory from agent) ───

export interface DeviceSysinfo {
  device_id: string;
  reported_at: string;
  os_name: string | null;
  os_version: string | null;
  os_build: string | null;
  hardware_model: string | null;
  cpu_name: string | null;
  cpu_cores: number | null;
  cpu_speed: string | null;
  ram_total: string | null;
  gpu_name: string | null;
  disk_name: string | null;
  disk_size: string | null;
  serial_number: string | null;
  hostname: string | null;
  uptime_seconds: number | null;
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
  // Hardware inventory (from device_sysinfo)
  hardware_model?: string | null;
  cpu_name?: string | null;
  cpu_cores?: number | null;
  cpu_speed?: string | null;
  gpu_name?: string | null;
  disk_name?: string | null;
  disk_size?: string | null;
  serial_number?: string | null;
  uptime_seconds?: number | null;
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

export interface RouterSummary {
  status: RouterStatus;
  interfaces: VyosInterface[];
  config_interfaces: Record<string, unknown>;
  routes: VyosRoute[];
  dhcp_leases: VyosDhcpLease[];
  dhcp_static_mappings: DhcpStaticMapping[];
  dhcp_server_config: DhcpServerConfig;
  firewall: FirewallConfig;
  firewall_groups: FirewallGroups;
  dns_forwarding: DnsForwardingConfig;
  wireguard: WireguardInterface[];
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

// ─── DHCP Server Config ────────────────────────────────

export interface DhcpPoolRange {
  name: string;
  start: string;
  stop: string;
}

export interface DhcpSubnetConfig {
  subnet: string;
  default_router: string | null;
  name_server: string | null;
  domain_name: string | null;
  lease: string | null;
  ranges: DhcpPoolRange[];
  static_mapping_count: number;
  disabled: boolean;
}

export interface DhcpSharedNetwork {
  name: string;
  subnets: DhcpSubnetConfig[];
}

export interface DhcpServerConfig {
  shared_networks: DhcpSharedNetwork[];
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

export interface SpeedTestHistoryEntry {
  id: number;
  tested_at: string;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss: number;
  isp: string;
  server_name: string;
  result_url: string | null;
}

export interface SpeedTestHistoryResponse {
  items: SpeedTestHistoryEntry[];
  total: number;
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
  // Speed Test
  speedtest_retention_days: number | null;
  speedtest_auto_interval_hours: number | null;
  // Nginx Proxy Manager
  npm_url: string | null;
  npm_email: string | null;
  npm_password_set: boolean;
}

// ─── Nginx Proxy Manager ─────────────────────────────────

export interface NpmConnectionStatus {
  configured: boolean;
  reachable: boolean;
  host_count: number | null;
}

export interface NpmProxyHost {
  id: number;
  domain_names: string[];
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  enabled: boolean;
  ssl_forced: boolean;
  certificate_id: number | string | null;
  access_list_id: number | string | null;
  hsts_enabled: boolean;
  http2_support: boolean;
  block_exploits: boolean;
  allow_websocket_upgrade: boolean;
  advanced_config: string | null;
}

export interface NpmProxyHostRequest {
  domain_names: string[];
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  certificate_id: number | string;
  access_list_id: number | string;
  ssl_forced: boolean;
  hsts_enabled: boolean;
  http2_support: boolean;
  block_exploits: boolean;
  allow_websocket_upgrade: boolean;
  advanced_config: string;
}

export interface NpmCertificate {
  id: number;
  provider: string;
  nice_name: string;
  domain_names: string[];
  expires_on: string | null;
  created_on: string | null;
  status: "valid" | "expiring" | "expired" | "unknown";
  days_remaining: number | null;
}

export interface NpmRedirectionHost {
  id: number;
  domain_names: string[];
  forward_http_code: number;
  forward_scheme: string;
  forward_domain_name: string;
  preserve_path: boolean;
  ssl_forced: boolean;
  block_exploits: boolean;
  enabled: boolean;
}

export interface NpmStream {
  id: number;
  incoming_port: number;
  forwarding_host: string;
  forwarding_port: number;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
  enabled: boolean;
}

export interface NpmDeadHost {
  id: number;
  domain_names: string[];
  ssl_forced: boolean;
  enabled: boolean;
}

export interface NpmAccessListClient {
  address: string;
  directive: string;
}

export interface NpmAccessList {
  id: number;
  name: string;
  satisfy_any: boolean;
  pass_auth: boolean;
  clients: NpmAccessListClient[];
  client_count: number;
  created_on: string | null;
  modified_on: string | null;
}

export interface NpmAccessListRequest {
  name: string;
  satisfy_any: boolean;
  pass_auth: boolean;
  clients: NpmAccessListClient[];
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

// ─── Audit Log ─────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  created_at: string;
  action: string;
  description: string;
  vyos_commands: string;
  success: boolean;
  error_msg: string | null;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Config Backups ─────────────────────────────────────

export interface ConfigBackupSummary {
  id: number;
  created_at: string;
  label: string | null;
  size_bytes: number;
  created_by: string;
}

export interface ConfigBackup extends ConfigBackupSummary {
  config_text: string;
}

export interface ConfigBackupListResponse {
  items: ConfigBackupSummary[];
  total: number;
}

export interface DiffLine {
  tag: "add" | "remove" | "context";
  content: string;
}

export interface ConfigDiffResponse {
  current: string;
  backup: string;
  backup_label: string | null;
  backup_created_at: string;
  diff_lines: DiffLine[];
  additions: number;
  deletions: number;
}

export interface PendingChangesResponse {
  has_changes: boolean;
  diff_lines: DiffLine[];
  additions: number;
  deletions: number;
  baseline: string;
  candidate: string;
}

export interface ConfigActionResponse {
  success: boolean;
  message: string;
  snapshot_id: number | null;
}

// ─── DNS Forwarding ─────────────────────────────────────

export interface DnsForwardingConfig {
  name_servers: string[];
  domain_overrides: DnsDomainOverride[];
  listen_addresses: string[];
  allow_from: string[];
  cache_size: number | null;
}

export interface DnsDomainOverride {
  domain: string;
  server: string;
}

// ─── WireGuard VPN ──────────────────────────────────────

export interface WireguardPeer {
  name: string;
  public_key: string | null;
  allowed_ips: string[];
  endpoint: string | null;
  persistent_keepalive: number | null;
  last_handshake: number | null;
  rx_bytes: number | null;
  tx_bytes: number | null;
}

export interface WireguardInterface {
  name: string;
  address: string | null;
  port: number | null;
  public_key: string | null;
  peers: WireguardPeer[];
  status: string | null;
}

export interface WireguardKeyPair {
  private_key: string;
  public_key: string;
}

export interface ClientConfigResponse {
  config: string;
  private_key: string;
  public_key: string;
}

// ─── DNS Forwarding ────────────────────────────────────

export interface DnsDomainOverride {
  domain: string;
  server: string;
}

export interface DnsForwardingConfig {
  name_servers: string[];
  listen_addresses: string[];
  domain_overrides: DnsDomainOverride[];
  allow_from: string[];
  cache_size: number | null;
}

// ─── System Info ───────────────────────────────────────

export interface CpuLoad {
  load1: number;
  load5: number;
  load15: number;
}

export interface MemoryUsage {
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  percent: number;
  mount: string;
}

export interface SystemInfo {
  version: string | null;
  uptime: string | null;
  cpu_load: CpuLoad | null;
  memory: MemoryUsage | null;
  disk: DiskUsage[];
}

export interface SyslogResponse {
  lines: string[];
}

// ─── Auth ───────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  needs_setup: boolean;
}

export interface LoginResponse {
  message: string;
}

// ─── Services Wizard ───────────────────────────────────

export interface AddServiceRequest {
  name: string;
  description?: string;
  internal_ip: string;
  internal_port: number;
  forward_scheme?: string;
  domain_names?: string[];
  ssl_mode?: string;
  letsencrypt_email?: string;
  ssl_forced?: boolean;
  http2_support?: boolean;
  block_exploits?: boolean;
  allow_websocket_upgrade?: boolean;
  create_firewall_rule?: boolean;
  firewall_chain?: string;
  firewall_rule_number?: number;
  firewall_protocol?: string;
  firewall_source_address?: string;
  create_dnat_rule?: boolean;
  dnat_rule_number?: number;
  dnat_external_port?: number;
  dnat_inbound_interface?: string;
  dnat_protocol?: string;
}

export interface StepResult {
  step: string;
  success: boolean;
  message: string;
  resource_id: string | null;
}

export interface AddServiceResponse {
  success: boolean;
  steps: StepResult[];
}

export interface RemoveResource {
  resource_type: string;
  resource_id: string;
  chain?: string;
}

export interface RemoveServiceRequest {
  name: string;
  resources: RemoveResource[];
}

export interface RemoveServiceResponse {
  success: boolean;
  steps: StepResult[];
}

// ─── SSH Targets (agentless monitoring) ─────────────────

export interface SshTarget {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  has_password: boolean;
  has_private_key: boolean;
  poll_interval_secs: number;
  enabled: boolean;
  created_at: string;
  // Latest report data:
  hostname: string | null;
  os_name: string | null;
  os_version: string | null;
  cpu_percent: number | null;
  mem_total: number | null;
  mem_used: number | null;
  disk_total: number | null;
  disk_used: number | null;
  uptime_seconds: number | null;
  last_report_at: string | null;
  is_online: boolean;
}

export interface SshTargetRequest {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "key";
  password?: string;
  private_key?: string;
  poll_interval_secs: number;
  enabled: boolean;
}

export interface SshReport {
  id: number;
  hostname: string | null;
  os_name: string | null;
  os_version: string | null;
  cpu_percent: number | null;
  mem_total: number | null;
  mem_used: number | null;
  disk_total: number | null;
  disk_used: number | null;
  uptime_seconds: number | null;
  reported_at: string;
}

export interface SshTestConnectionResponse {
  success: boolean;
  message: string;
}
