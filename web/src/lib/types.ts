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
  /** Whether this device was manually created (not auto-discovered). */
  is_manual?: boolean | null;
  /** Physical location. */
  location?: string | null;
  /** Asset owner. */
  owner?: string | null;
  /** Comma-separated tags. */
  tags?: string | null;
  /** Manual CPU spec entry. */
  cpu_manual?: string | null;
  /** Manual RAM spec entry. */
  ram_manual?: string | null;
  /** Manual disk spec entry. */
  disk_manual?: string | null;
  /** Purchase date. */
  purchase_date?: string | null;
  /** Warranty expiry date. */
  warranty_expiry?: string | null;
  /** Serial number (manual entry). */
  serial_number?: string | null;
  /** 24-hour online/offline timeline (one boolean per hour, oldest first). */
  status_timeline?: boolean[] | null;
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

// ─── Topology Graph ─────────────────────────────────────

/** A device node in the topology graph (lighter than full Device). */
export interface TopologyDevice {
  id: string;
  mac: string;
  name: string | null;
  hostname: string | null;
  vendor: string | null;
  is_online: boolean;
  ips: string[];
  custom_name: string | null;
  custom_type: string | null;
  custom_vendor: string | null;
  device_type: string | null;
  device_model: string | null;
  device_brand: string | null;
  mdns_services: string | null;
  icon: string;
  first_seen_at: string;
  last_seen_at: string;
  os_family: string | null;
  os_version: string | null;
  location: string | null;
  owner: string | null;
  tags: string | null;
  rx_bps: number;
  tx_bps: number;
  /** DHCP lease status (e.g. "bound", "active") */
  dhcp_lease_status?: string | null;
  /** DHCP server / pool that issued the lease */
  dhcp_server?: string | null;
  /** DHCP lease expiry / remaining time */
  dhcp_expires?: string | null;
  /** DHCP hostname (reported by the client) */
  dhcp_hostname?: string | null;
  /** Bridge port the device was last seen on */
  bridge_port?: string | null;
  /** Bridge name (from MikroTik bridge host table) */
  bridge_name?: string | null;
}

/** Router hub node in the topology graph. */
export interface TopologyRouter {
  router_type: string; // "vyos" | "mikrotik" | "unknown"
  is_online: boolean;
  wan_ip: string | null;
  hostname: string | null;
  version: string | null;
}

/** Saved node position for the topology layout. */
export interface NodePosition {
  node_id: string;
  x: number;
  y: number;
  pinned: boolean;
}

/** Complete topology graph response from /api/v1/topology/graph. */
export interface TopologyGraph {
  devices: TopologyDevice[];
  router: TopologyRouter;
  positions: NodePosition[];
}

// ─── Traffic ────────────────────────────────────────────

export interface TrafficHistoryPoint {
  minute: string;
  rx_bps: number;
  tx_bps: number;
}

export interface DeviceTrafficPoint {
  time: string;
  rx_bps: number;
  tx_bps: number;
  max_rx_bps: number | null;
  max_tx_bps: number | null;
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
  // MikroTik
  mikrotik_url: string | null;
  mikrotik_user: string | null;
  mikrotik_password_set: boolean;
  mikrotik_enabled: boolean;
  // Unbound DNS
  unbound_control_path: string | null;
  // Caddy Reverse Proxy
  caddy_admin_url: string | null;
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
  name: string | null;
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

export interface SearchSshTarget {
  id: string;
  name: string;
  host: string;
  username: string;
  is_online: boolean;
}

export interface SearchAsset {
  id: string;
  name: string;
  asset_type: string;
  location: string | null;
  serial_number: string | null;
}

export interface SearchResponse {
  devices: SearchDevice[];
  agents: SearchAgent[];
  alerts: SearchAlert[];
  ssh_targets: SearchSshTarget[];
  assets: SearchAsset[];
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

// ─── Assets (IT inventory) ───────────────────────────────

export type AssetType =
  | "server"
  | "workstation"
  | "vm"
  | "container"
  | "nas"
  | "router"
  | "access_point"
  | "switch"
  | "iot"
  | "phone"
  | "printer"
  | "unknown";

export type AssetStatus =
  | "active"
  | "inactive"
  | "maintenance"
  | "retired"
  | "disposed";

export interface Asset {
  id: string;
  name: string;
  asset_type: AssetType;
  status: AssetStatus;
  location: string | null;
  owner: string | null;
  tags: string | null;
  notes: string | null;
  purchase_date: string | null;
  serial_number: string | null;
  device_id: string | null;
  agent_id: string | null;
  ssh_target_id: string | null;
  created_at: string;
  updated_at: string;
  // Linked device data
  ip: string | null;
  mac: string | null;
  device_online: boolean | null;
  device_last_seen: string | null;
  // Linked agent data
  agent_name: string | null;
  agent_os: string | null;
  agent_online: boolean | null;
  // Linked SSH target data
  ssh_name: string | null;
  ssh_os: string | null;
  ssh_online: boolean | null;
}

export interface AssetRequest {
  name?: string;
  asset_type?: AssetType;
  status?: AssetStatus;
  location?: string;
  owner?: string;
  tags?: string;
  notes?: string;
  purchase_date?: string;
  serial_number?: string;
  device_id?: string;
  agent_id?: string;
  ssh_target_id?: string;
}

export interface AssetImportRow {
  name: string;
  asset_type?: string;
  status?: string;
  location?: string;
  owner?: string;
  tags?: string;
  notes?: string;
  purchase_date?: string;
  serial_number?: string;
}

export interface AssetImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AssetAutoLinkResponse {
  linked: number;
  details: string[];
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

// ─── MikroTik ──────────────────────────────────────────

export interface MikrotikStatus {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  uptime: string | null;
  cpu_load: string | null;
  total_memory: string | null;
  free_memory: string | null;
  board_name: string | null;
  architecture: string | null;
  platform: string | null;
}

export interface MikrotikInterface {
  name: string;
  iface_type: string | null;
  mac: string | null;
  ip_address: string | null;
  mtu: string | null;
  disabled: boolean;
  running: boolean;
  comment: string | null;
  tx_bytes: string | null;
  rx_bytes: string | null;
}

export interface MikrotikVlan {
  id: string | null;
  vlan_id: string | null;
  name: string | null;
  interface: string | null;
  mtu: string | null;
}

export interface MikrotikVlanRequest {
  vlan_id: number;
  name: string;
  interface: string;
  mtu: number | null;
}

export interface MikrotikRoute {
  dst_address: string;
  gateway: string | null;
  distance: string | null;
  routing_table: string | null;
  active: boolean;
  dynamic: boolean;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikDhcpLease {
  address: string;
  mac_address: string | null;
  host_name: string | null;
  status: string | null;
  expires_after: string | null;
  server: string | null;
  dynamic: boolean;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikFirewallRule {
  id: string | null;
  chain: string | null;
  action: string | null;
  protocol: string | null;
  src_address: string | null;
  dst_address: string | null;
  src_port: string | null;
  dst_port: string | null;
  in_interface: string | null;
  out_interface: string | null;
  connection_state: string | null;
  src_address_list: string | null;
  dst_address_list: string | null;
  comment: string | null;
  disabled: boolean;
  bytes: string | null;
  packets: string | null;
}

export interface MikrotikNatRule {
  id: string | null;
  chain: string | null;
  action: string | null;
  protocol: string | null;
  src_address: string | null;
  dst_address: string | null;
  dst_port: string | null;
  to_addresses: string | null;
  to_ports: string | null;
  out_interface: string | null;
  comment: string | null;
  disabled: boolean;
}

export interface MikrotikAddressListEntry {
  id: string | null;
  list: string | null;
  address: string | null;
  comment: string | null;
  disabled: boolean;
}

export interface MikrotikFirewall {
  filter_rules: MikrotikFirewallRule[];
  nat_rules: MikrotikNatRule[];
  address_lists: MikrotikAddressListEntry[];
}

export interface MikrotikFirewallRuleRequest {
  chain: string;
  action: string;
  protocol?: string;
  src_address?: string;
  dst_address?: string;
  src_port?: string;
  dst_port?: string;
  in_interface?: string;
  out_interface?: string;
  connection_state?: string;
  src_address_list?: string;
  dst_address_list?: string;
  comment?: string;
  disabled?: boolean;
}

export interface MikrotikNatRuleRequest {
  chain: string;
  action: string;
  protocol?: string;
  src_address?: string;
  dst_address?: string;
  dst_port?: string;
  to_addresses?: string;
  to_ports?: string;
  out_interface?: string;
  comment?: string;
  disabled?: boolean;
}

export interface MikrotikAddressListRequest {
  list: string;
  address: string;
  comment?: string;
}

export interface MikrotikDns {
  servers: string[];
  allow_remote_requests: boolean;
  cache_size: string | null;
  cache_used: string | null;
}

export interface MikrotikWgPeer {
  public_key: string | null;
  endpoint: string | null;
  allowed_address: string | null;
  rx: string | null;
  tx: string | null;
  last_handshake: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikWgInterface {
  name: string;
  listen_port: string | null;
  public_key: string | null;
  mtu: string | null;
  disabled: boolean;
  running: boolean;
  peers: MikrotikWgPeer[];
}

export interface MikrotikWireguard {
  interfaces: MikrotikWgInterface[];
}

// ─── Alert Rules ─────────────────────────────────────────

export interface AlertRule {
  id: string;
  rule_type: "device_offline" | "bandwidth_threshold" | "new_device";
  enabled: boolean;
  threshold_value: number | null;
  notify_telegram: boolean;
  notify_in_app: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertRuleRequest {
  rule_type: "device_offline" | "bandwidth_threshold" | "new_device";
  enabled?: boolean;
  threshold_value?: number | null;
  notify_telegram?: boolean;
  notify_in_app?: boolean;
}

export interface UpdateAlertRuleRequest {
  enabled?: boolean;
  threshold_value?: number | null;
  notify_telegram?: boolean;
  notify_in_app?: boolean;
}

// ─── Caddy Reverse Proxy ─────────────────────────────────

export interface CaddyProxyHost {
  id: string;
  domain: string;
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  enabled: boolean;
  tls_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaddyProxyHostRequest {
  domain: string;
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  tls_enabled: boolean;
}

export interface CaddyStatus {
  configured: boolean;
  reachable: boolean;
}

export interface CaddyTestConnectionResponse {
  success: boolean;
  message: string;
}

// ─── DNS Query Log ──────────────────────────────────────

export interface DnsQueryEntry {
  id: number;
  device_id: string | null;
  client_ip: string;
  domain: string;
  query_type: string;
  response_code: string;
  blocked: boolean;
  response_time_ms: number | null;
  upstream: string | null;
  queried_at: string;
  device_name: string | null;
}

export interface DnsQueriesResponse {
  items: DnsQueryEntry[];
  total: number;
  page: number;
  per_page: number;
}

// Response for /api/v1/dns-logs
export interface DnsQueryLogResponse {
  entries: DnsQueryLogEntry[];
  total: number;
}

export interface DnsDomainCount {
  domain: string;
  count: number;
}

export interface DnsDeviceQueryStats {
  device_id: string | null;
  client_ip: string;
  device_name: string | null;
  total_queries: number;
  blocked_queries: number;
}

export interface DnsTimeSeriesPoint {
  time: string;
  total: number;
  blocked: number;
}

export interface DnsQueryStats {
  total_queries: number;
  blocked_queries: number;
  unique_domains: number;
  unique_clients: number;
  top_queried_domains: DnsDomainCount[];
  top_blocked_domains: DnsDomainCount[];
  per_device_stats: DnsDeviceQueryStats[];
  queries_over_time: DnsTimeSeriesPoint[];
}

// ─── Unbound DNS ─────────────────────────────────────────

export interface UnboundDnsRecord {
  id: string;
  hostname: string;
  ip_address: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnboundDnsRecordRequest {
  hostname: string;
  ip_address: string;
}

export interface UnboundTestConnectionResponse {
  success: boolean;
  message: string;
}

// ─── DNS Logs (simpler log viewer) ──────────────────────

export interface DnsQueryLogEntry {
  id: number;
  device_id: string | null;
  client_ip: string;
  domain: string;
  query_type: string;
  result: string;
  blocked: boolean;
  response_time_ms: number | null;
  queried_at: string;
  device_name: string | null;
}

export interface DnsTopDomain {
  domain: string;
  count: number;
}

export interface DnsDeviceStats {
  device_id: string | null;
  client_ip: string;
  device_name: string | null;
  total_queries: number;
  blocked_queries: number;
  unique_domains: number;
}

export interface DnsStatsResponse {
  total_queries: number;
  total_blocked: number;
  unique_domains: number;
  unique_clients: number;
  top_queried: DnsTopDomain[];
  top_blocked: DnsTopDomain[];
  device_stats: DnsDeviceStats[];
}

export interface DnsIngestEntry {
  client_ip: string;
  domain: string;
  query_type?: string;
  result?: string;
  blocked?: boolean;
  response_time_ms?: number;
}

export interface DnsIngestResponse {
  inserted: number;
  total: number;
}

export interface DnsPurgeResponse {
  deleted: number;
}

// ─── DNS Blocklists ─────────────────────────────────────

export interface DnsBlocklist {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  format: string;
  domain_count: number;
  last_downloaded_at: string | null;
  last_error: string | null;
  refresh_interval_hours: number;
  created_at: string;
  updated_at: string;
}

export interface DnsBlocklistRequest {
  name: string;
  url: string;
  enabled: boolean;
  format: string;
  refresh_interval_hours: number;
}

export interface DnsBlocklistDomainOverride {
  id: string;
  domain: string;
  action: "whitelist" | "blacklist";
  created_at: string;
}

export interface DnsBlocklistDomainOverrideRequest {
  domain: string;
  action: "whitelist" | "blacklist";
}

export interface DnsBlocklistStats {
  total_blocklists: number;
  enabled_blocklists: number;
  total_blocked_domains: number;
  whitelist_count: number;
  blacklist_count: number;
  last_updated: string | null;
}

export interface DnsBlocklistDownloadResponse {
  success: boolean;
  message: string;
  domain_count: number;
}

export interface DnsUnboundConfigResponse {
  config: string;
  domain_count: number;
}
