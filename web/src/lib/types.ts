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
  /** Critical/pinned flag for infrastructure health. null=auto, true=pinned, false=excluded. */
  is_critical?: boolean | null;
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
  // Fastfetch-enriched fields
  bios_vendor: string | null;
  bios_version: string | null;
  motherboard_name: string | null;
  ram_type: string | null;
  ram_speed: string | null;
  gpu_vram: string | null;
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
  // Fastfetch-enriched fields
  bios_vendor?: string | null;
  bios_version?: string | null;
  motherboard_name?: string | null;
  ram_type?: string | null;
  ram_speed?: string | null;
  gpu_vram?: string | null;
}

// Fastfetch rich hardware info (raw from agent)
export interface FastfetchInfo {
  cpu?: {
    name?: string | null;
    vendor?: string | null;
    cores_physical?: number | null;
    cores_logical?: number | null;
    freq_base_mhz?: number | null;
    freq_max_mhz?: number | null;
    temperature?: number | null;
  } | null;
  gpu?: Array<{
    name?: string | null;
    vendor?: string | null;
    driver?: string | null;
    type?: string | null;
    vram_mb?: number | null;
    temperature?: number | null;
  }> | null;
  memory?: {
    total_bytes?: number | null;
    used_bytes?: number | null;
  } | null;
  storage?: Array<{
    name?: string | null;
    mountpoint?: string | null;
    filesystem?: string | null;
    total_bytes?: number | null;
    used_bytes?: number | null;
  }> | null;
  os?: {
    name?: string | null;
    version?: string | null;
    id?: string | null;
    pretty_name?: string | null;
  } | null;
  host?: {
    name?: string | null;
    vendor?: string | null;
    version?: string | null;
    serial?: string | null;
  } | null;
  bios?: {
    vendor?: string | null;
    version?: string | null;
    date?: string | null;
    bios_type?: string | null;
  } | null;
  kernel?: {
    name?: string | null;
    release?: string | null;
    architecture?: string | null;
  } | null;
  battery?: Array<{
    capacity?: number | null;
    status?: string | null;
  }> | null;
  physical_memory?: Array<{
    size_bytes?: number | null;
    speed_mts?: number | null;
    mem_type?: string | null;
    bank_locator?: string | null;
  }> | null;
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
  router_type: string; // "mikrotik" | "none"
  devices_online: number;
  devices_total: number;
  alerts_unread: number;
  wan_rx_bps: number;
  wan_tx_bps: number;
  /** Number of critical (infra) devices currently online. */
  critical_online: number;
  /** Total number of critical (infra) devices. */
  critical_total: number;
}

/** A single critical device returned by /api/v1/dashboard/critical-devices. */
export interface CriticalDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip: string | null;
  vendor: string | null;
  device_type: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  /** "pinned" or "auto" */
  classification: string;
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

/** Shape returned by /api/v1/dashboard/critical-devices. */
export interface CriticalDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip: string | null;
  vendor: string | null;
  device_type: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  /** How the device was classified: "pinned" or "auto". */
  classification: string;
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
  router_type: string; // "mikrotik" | "unknown"
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

// ─── Router ─────────────────────────────────────────────

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
  ntp_server: string | null;
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

export interface UpdateDhcpSubnetRequest {
  default_router?: string;
  name_server?: string;
  domain_name?: string;
  lease?: number;
  ntp_server?: string;
}

export interface CreateDhcpSubnetRequest {
  network: string;
  subnet: string;
  default_router?: string;
  name_server?: string;
  domain_name?: string;
  lease?: number;
  range_start?: string;
  range_stop?: string;
}

export interface DhcpPoolRangeRequest {
  start: string;
  stop: string;
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
  /** Config path components: [ip_version, direction, filter_type] */
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

/** Summary returned by POST /api/v1/scanner/trigger. */
export interface ScanSummary {
  new_devices: number;
  updated_devices: number;
  offline_devices: number;
  total_scanned: number;
  sources: string[];
}

export interface SettingsData {
  webhook_url: string | null;
  // Network Scanner
  scan_interval_seconds: number | null;
  scan_subnets: string | null;
  ping_sweep_enabled: boolean | null;
  nmap_scan_enabled: boolean;
  netbios_scan_enabled: boolean;
  snmp_scan_enabled: boolean;
  http_fingerprint_enabled: boolean;
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
  // Xiaomi Mesh
  xiaomi_mesh_enabled: boolean;
  xiaomi_mesh_ip: string | null;
  xiaomi_mesh_password_set: boolean;
  xiaomi_mesh_poll_interval: number | null;
  // Cloudflare Tunnel
  cloudflare_api_token_set: boolean;
  cloudflare_account_id: string | null;
  cloudflare_tunnel_id: string | null;
  // pfSense
  pfsense_enabled: boolean;
  pfsense_host: string | null;
  pfsense_port: number | null;
  pfsense_username: string | null;
  pfsense_auth_type: string | null;
  pfsense_password_set: boolean;
  pfsense_private_key_set: boolean;
  // SMTP Email
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_set: boolean;
  smtp_from_email: string | null;
  smtp_to_email: string | null;
  smtp_tls_enabled: boolean;
  // SNMP
  snmp_community: string | null;
  snmp_version: string | null;
  snmp_port: number | null;
  snmp_timeout_seconds: number | null;
  snmp_retries: number | null;
  default_router: string | null;
  // Advanced / Legacy
  show_legacy_routers: boolean;
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
  commands: string;
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

// ─── OpenVPN ────────────────────────────────────────────

export interface OpenVpnConnectedClient {
  common_name: string;
  real_address: string | null;
  virtual_address: string | null;
  bytes_received: number | null;
  bytes_sent: number | null;
  connected_since: string | null;
}

export interface OpenVpnInterface {
  name: string;
  mode: string | null;
  protocol: string | null;
  local_port: number | null;
  local_address: string | null;
  remote_host: string | null;
  remote_port: number | null;
  encryption: string | null;
  hash: string | null;
  subnet: string | null;
  description: string | null;
  status: string | null;
  tls_ca_cert: string | null;
  tls_cert: string | null;
  tls_key: string | null;
  tls_dh: string | null;
  push_routes: string[];
  clients: OpenVpnConnectedClient[];
  disabled: boolean;
}

export interface CreateOpenVpnInterfaceRequest {
  name: string;
  mode: string;
  protocol?: string;
  local_port?: number;
  local_address?: string;
  remote_host?: string;
  remote_port?: number;
  encryption?: string;
  hash?: string;
  subnet?: string;
  description?: string;
  tls_ca_cert?: string;
  tls_cert?: string;
  tls_key?: string;
  tls_dh?: string;
  push_routes?: string[];
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

// ─── Services Wizard (Caddy + MikroTik) ────────────────

export interface AddServiceRequest {
  name: string;
  description?: string;
  internal_ip: string;
  internal_port: number;
  forward_scheme?: string;
  /** Domain for Caddy reverse proxy entry. */
  domain?: string;
  /** Enable automatic TLS via Caddy. */
  tls_enabled?: boolean;
  /** If true, create a MikroTik dst-nat rule for port forwarding. */
  create_port_forward?: boolean;
  /** External port for port-forward rule. */
  external_port?: number;
  /** Protocol for port-forward rule (default: "tcp"). */
  protocol?: string;
  /** Comment for MikroTik rule. */
  mikrotik_comment?: string;
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
  /** "caddy_proxy_host" or "mikrotik_port_forward" */
  resource_type: string;
  resource_id: string;
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

export interface AssetSyncFromDevicesResponse {
  created: number;
  skipped: number;
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

export interface MikrotikDhcpStaticMappingRequest {
  address: string;
  mac_address: string;
  comment?: string;
}

// DHCP Server Pool Configuration types
export interface MikrotikDhcpServer {
  id: string | null;
  name: string | null;
  interface: string | null;
  address_pool: string | null;
  lease_time: string | null;
  disabled: boolean;
  authoritative: string | null;
  dynamic: boolean;
  invalid: boolean;
}

export interface MikrotikDhcpServerUpdateRequest {
  lease_time?: string;
  address_pool?: string;
  disabled?: boolean;
  authoritative?: string;
}

export interface MikrotikDhcpNetwork {
  id: string | null;
  address: string | null;
  gateway: string | null;
  dns_server: string | null;
  domain: string | null;
  ntp_server: string | null;
  comment: string | null;
  dynamic: boolean;
}

export interface MikrotikDhcpNetworkRequest {
  address: string;
  gateway?: string;
  dns_server?: string;
  domain?: string;
  ntp_server?: string;
  comment?: string;
}

export interface MikrotikIpPool {
  id: string | null;
  name: string | null;
  ranges: string | null;
  comment: string | null;
  dynamic: boolean;
}

export interface MikrotikIpPoolRequest {
  name: string;
  ranges: string;
  comment?: string;
}

export interface MikrotikDhcpLogEntry {
  id: string | null;
  time: string | null;
  topics: string | null;
  message: string | null;
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
  comment: string | null;
  disabled: boolean;
  bytes: string | null;
  packets: string | null;
  time: string | null;
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
  in_interface: string | null;
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
  dynamic: boolean;
}

export interface MikrotikFirewall {
  filter_rules: MikrotikFirewallRule[];
  nat_rules: MikrotikNatRule[];
  address_lists: MikrotikAddressListEntry[];
}

export interface MikrotikFirewallFilterRequest {
  chain: string;
  action: string;
  protocol?: string;
  src_address?: string;
  dst_address?: string;
  src_port?: string;
  dst_port?: string;
  in_interface?: string;
  out_interface?: string;
  comment?: string;
  disabled?: boolean;
  time?: string;
}

export interface MikrotikFirewallNatRequest {
  chain: string;
  action: string;
  protocol?: string;
  src_address?: string;
  dst_address?: string;
  dst_port?: string;
  to_addresses?: string;
  to_ports?: string;
  in_interface?: string;
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

// ─── MikroTik Advanced Routing ───────────────────────────

export interface MikrotikMangleRule {
  id: string | null;
  chain: string | null;
  action: string | null;
  src_address: string | null;
  dst_address: string | null;
  protocol: string | null;
  dst_port: string | null;
  src_port: string | null;
  in_interface: string | null;
  out_interface: string | null;
  new_routing_mark: string | null;
  new_connection_mark: string | null;
  new_packet_mark: string | null;
  passthrough: boolean;
  disabled: boolean;
  bytes: string | null;
  packets: string | null;
  comment: string | null;
}

export interface MikrotikMangleRequest {
  chain: string;
  action: string;
  src_address?: string;
  dst_address?: string;
  protocol?: string;
  dst_port?: string;
  src_port?: string;
  in_interface?: string;
  out_interface?: string;
  new_routing_mark?: string;
  new_connection_mark?: string;
  new_packet_mark?: string;
  passthrough?: boolean;
  comment?: string;
  disabled?: boolean;
}

export interface MikrotikRoutingRule {
  id: string | null;
  dst_address: string | null;
  src_address: string | null;
  routing_mark: string | null;
  action: string | null;
  table: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikRoutingRuleRequest {
  dst_address?: string;
  src_address?: string;
  routing_mark?: string;
  action: string;
  table?: string;
  comment?: string;
  disabled?: boolean;
}

export interface MikrotikRoutingTable {
  id: string | null;
  name: string | null;
  fib: boolean;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikNetwatchEntry {
  id: string | null;
  host: string | null;
  check_type: string | null;
  interval: string | null;
  timeout: string | null;
  status: string | null;
  since: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikNetwatchRequest {
  host: string;
  check_type?: string;
  interval?: string;
  timeout?: string;
  comment?: string;
  disabled?: boolean;
}

export interface MikrotikBgpConnection {
  id: string | null;
  name: string | null;
  remote_address: string | null;
  remote_as: string | null;
  local_role: string | null;
  local_as: string | null;
  routing_table: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikOspfInstance {
  id: string | null;
  name: string | null;
  router_id: string | null;
  version: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikOspfArea {
  id: string | null;
  name: string | null;
  area_id: string | null;
  instance: string | null;
  disabled: boolean;
  comment: string | null;
}

export interface MikrotikDynamicRouting {
  bgp_connections: MikrotikBgpConnection[];
  ospf_instances: MikrotikOspfInstance[];
  ospf_areas: MikrotikOspfArea[];
}

export interface MikrotikIpv6Nd {
  id: string | null;
  interface: string | null;
  ra_interval: string | null;
  ra_delay: string | null;
  ra_lifetime: string | null;
  managed: boolean;
  other: boolean;
  disabled: boolean;
  comment: string | null;
}

// ─── Alert Rules ─────────────────────────────────────────

export interface AlertRule {
  id: string;
  rule_type: "device_offline" | "bandwidth_threshold" | "new_device";
  enabled: boolean;
  threshold_value: number | null;
  notify_telegram: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertRuleRequest {
  rule_type: "device_offline" | "bandwidth_threshold" | "new_device";
  enabled?: boolean;
  threshold_value?: number | null;
  notify_telegram?: boolean;
  notify_email?: boolean;
  notify_in_app?: boolean;
}

export interface UpdateAlertRuleRequest {
  enabled?: boolean;
  threshold_value?: number | null;
  notify_telegram?: boolean;
  notify_email?: boolean;
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

// ─── QoS / Traffic Shaping ──────────────────────────────────

export interface MikrotikSimpleQueue {
  id: string | null;
  name: string;
  target: string;
  max_limit: string | null;
  burst_limit: string | null;
  burst_threshold: string | null;
  burst_time: string | null;
  priority: string | null;
  comment: string | null;
  disabled: boolean;
  parent: string | null;
  bytes: string | null;
  packets: string | null;
  rate: string | null;
  packet_rate: string | null;
  dynamic: boolean;
}

export interface MikrotikSimpleQueueRequest {
  name: string;
  target: string;
  max_limit: string;
  burst_limit?: string;
  burst_threshold?: string;
  burst_time?: string;
  priority?: string;
  comment?: string;
  disabled?: boolean;
  parent?: string;
}

export interface MikrotikQueueTree {
  id: string | null;
  name: string;
  parent: string | null;
  packet_mark: string | null;
  priority: string | null;
  max_limit: string | null;
  burst_limit: string | null;
  burst_threshold: string | null;
  burst_time: string | null;
  comment: string | null;
  disabled: boolean;
  bytes: string | null;
  packets: string | null;
  rate: string | null;
  packet_rate: string | null;
  dynamic: boolean;
}

export interface MikrotikQueueTreeRequest {
  name: string;
  parent: string;
  packet_mark?: string;
  priority?: string;
  max_limit?: string;
  burst_limit?: string;
  burst_threshold?: string;
  burst_time?: string;
  comment?: string;
  disabled?: boolean;
}

// ─── VPN Status Dashboard ───────────────────────────────────

export interface VpnPeerStatus {
  name: string;
  public_key: string | null;
  endpoint: string | null;
  allowed_ips: string[];
  last_handshake: number | null;
  rx_bytes: number | null;
  tx_bytes: number | null;
  /** "online" if handshake within last 3 minutes, "offline" otherwise. */
  connectivity: string;
}

export interface VpnInterfaceStatus {
  name: string;
  address: string | null;
  port: number | null;
  public_key: string | null;
  status: string | null;
  peers: VpnPeerStatus[];
  peers_online: number;
  peers_total: number;
  /** "mikrotik" */
  source: string;
  /** "wireguard" or "openvpn" */
  vpn_type: string;
}

export interface VpnStatusResponse {
  mikrotik_available: boolean;
  openvpn_available: boolean;
  interfaces: VpnInterfaceStatus[];
  total_peers: number;
  online_peers: number;
  total_rx_bytes: number;
  total_tx_bytes: number;
}

// ─── OpenVPN Management ─────────────────────────────────────

export interface OvpnServerResponse {
  enabled: boolean;
  port: number | null;
  protocol: string | null;
  mode: string | null;
  cipher: string | null;
  auth: string | null;
  certificate: string | null;
  default_profile: string | null;
  require_client_certificate: boolean;
}

export interface OvpnClientEntry {
  id: string;
  name: string;
  service: string | null;
  profile: string | null;
  local_address: string | null;
  remote_address: string | null;
  comment: string | null;
  disabled: boolean;
}

export interface OvpnActiveConnection {
  name: string;
  caller_id: string | null;
  address: string | null;
  uptime: string | null;
  encoding: string | null;
}

export interface OvpnCertificateEntry {
  id: string;
  name: string;
  common_name: string | null;
  fingerprint: string | null;
  expires: string | null;
  expired: boolean;
  is_ca: boolean;
  has_private_key: boolean;
}

export interface OvpnOverview {
  server: OvpnServerResponse;
  clients: OvpnClientEntry[];
  active_connections: OvpnActiveConnection[];
  certificates: OvpnCertificateEntry[];
}

export interface UpdateOvpnServerRequest {
  enabled?: boolean;
  port?: number;
  protocol?: string;
  mode?: string;
  cipher?: string;
  auth?: string;
  certificate?: string;
  default_profile?: string;
  require_client_certificate?: boolean;
}

export interface CreateOvpnClientRequest {
  name: string;
  password: string;
  profile?: string;
  local_address?: string;
  remote_address?: string;
  comment?: string;
}

export interface QosSummary {
  mikrotik_available: boolean;
  mikrotik_simple_queue_count: number;
  mikrotik_queue_tree_count: number;
}

// ─── Dynamic DNS (DDNS) ─────────────────────────────────

export interface DdnsEntry {
  id: string;
  provider: string;
  hostname: string;
  username: string | null;
  has_password: boolean;
  has_api_token: boolean;
  zone: string | null;
  interface_name: string | null;
  ip_source: string;
  protocol: string;
  enabled: boolean;
  router_type: string;
  last_status: string;
  last_ip: string | null;
  last_updated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DdnsEntryRequest {
  provider: string;
  hostname: string;
  username?: string;
  password?: string;
  api_token?: string;
  zone?: string;
  interface_name?: string;
  ip_source: string;
  protocol: string;
  enabled: boolean;
  router_type: string;
}

export interface DdnsStatus {
  total: number;
  enabled: number;
  healthy: number;
  failing: number;
  mikrotik_configured: boolean;
}

// ─── DNS Security (DoT + DNSSEC) ────────────────────────────

export interface DotServer {
  address: string;
  port: number;
  name: string;
  enabled: boolean;
}

export interface DnsSecuritySettings {
  dot_enabled: boolean;
  dot_servers: DotServer[];
  dnssec_enabled: boolean;
}

export interface DnsSecurityUpdateRequest {
  dot_enabled?: boolean;
  dot_servers?: DotServer[];
  dnssec_enabled?: boolean;
}

// ─── NAT Management ─────────────────────────────────────────

export interface NatSummary {
  mikrotik_available: boolean;
  mikrotik_rule_count: number;
  dnat_count: number;
  snat_count: number;
}

export interface NatRuleResponse {
  success: boolean;
  message: string;
}

export interface MikrotikNatRuleWithId {
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

export interface CreateMikrotikNatRuleRequest {
  chain: string;
  action: string;
  protocol?: string;
  src_address?: string;
  dst_address?: string;
  dst_port?: string;
  to_addresses?: string;
  to_ports?: string;
  in_interface?: string;
  out_interface?: string;
  comment?: string;
  disabled?: boolean;
}

// ─── Mesh Topology (Xiaomi) ─────────────────────────────────

export interface MeshNode {
  ip: string;
  mac: string;
  name: string;
  model: string;
  hardware: string;
  is_main: boolean;
  online_devices: number;
  backhaul_type: string;
  parent_mac: string;
  signal: number;
  is_online: boolean;
}

export interface MeshTopologyResponse {
  nodes: MeshNode[];
  main_ip: string;
  total_devices: number;
}

// ─── pfSense ───────────────────────────────────────────

export interface PfsenseStatus {
  configured: boolean;
  reachable: boolean;
  hostname: string | null;
  domain: string | null;
  version: string | null;
  uptime: string | null;
  cpu_usage: number | null;
  memory_total: number | null;
  memory_used: number | null;
  platform: string | null;
}

export interface PfsenseInterface {
  name: string;
  descr: string | null;
  iface_type: string;
  status: string;
  ip_address: string | null;
  subnet: string | null;
  mac: string | null;
  mtu: number | null;
  media: string | null;
}

export interface PfsenseFirewallRule {
  id: string;
  action: "pass" | "block" | "reject";
  interface: string;
  protocol: string | null;
  source: string;
  destination: string;
  port: string | null;
  description: string | null;
  disabled: boolean;
  log: boolean;
  tracker: string | null;
}

export interface PfsenseNatRule {
  id: string;
  interface: string;
  protocol: string | null;
  source: string;
  destination: string;
  target: string;
  local_port: string | null;
  description: string | null;
  disabled: boolean;
}

export interface PfsenseAlias {
  name: string;
  alias_type: string;
  address: string;
  description: string | null;
  detail: string | null;
}

export interface PfsenseDhcpLease {
  ip: string;
  mac: string;
  hostname: string | null;
  start: string | null;
  end: string | null;
  status: string;
  interface: string;
}

export interface PfsenseDhcpStaticMapping {
  id: string;
  mac: string;
  ip: string;
  hostname: string | null;
  description: string | null;
  interface: string;
}

export interface PfsenseGateway {
  name: string;
  interface: string;
  gateway_ip: string;
  monitor_ip: string | null;
  status: string;
  delay: string | null;
  stddev: string | null;
  loss: string | null;
}

export interface PfsenseRoute {
  network: string;
  gateway: string;
  interface: string | null;
  flags: string | null;
}

export interface PfsenseDnsConfig {
  resolver_enabled: boolean;
  servers: string[];
}

export interface PfsenseDnsOverride {
  id: string;
  host: string;
  domain: string;
  ip: string;
  description: string | null;
}

export interface PfsenseFirewall {
  rules: PfsenseFirewallRule[];
  nat: PfsenseNatRule[];
  aliases: PfsenseAlias[];
}

export interface PfsenseConfigSnapshot {
  id: string;
  timestamp: string;
  description: string | null;
  size_bytes: number;
}

export interface PfsenseConfigDiff {
  before: string;
  after: string;
  diff: string;
}

export interface PfsenseAuditEntry {
  id: number;
  timestamp: string;
  action: string;
  description: string;
  commands: string | null;
  success: boolean;
  error: string | null;
}

export interface PfsenseService {
  name: string;
  description: string;
  running: boolean;
}

// ─── Xiaomi MiWiFi ──────────────────────────────────────

export interface XiaomiStatus {
  configured: boolean;
  reachable: boolean;
  cpu_cores: number | null;
  cpu_freq: string | null;
  cpu_load: number | null;
  mem_usage: number | null;
  mem_total: string | null;
  mem_type: string | null;
  temperature: number | null;
  wan_download: string | null;
  wan_upload: string | null;
  devices_online: number | null;
  devices_total: number | null;
  uptime: string | null;
}

export interface XiaomiTopoNode {
  mac: string | null;
  name: string | null;
  locale: string | null;
  ip: string | null;
  online: number | null;
  hardware: string | null;
  model: string | null;
}

export interface XiaomiTopoLeaf {
  mac: string | null;
  ip: string | null;
  name: string | null;
  online: number | null;
  parent_id: string | null;
}

export interface XiaomiTopology {
  nodes: XiaomiTopoNode[];
  leafs: XiaomiTopoLeaf[];
}

export interface XiaomiDevice {
  mac: string | null;
  name: string | null;
  ip: string | null;
  download_speed: string | null;
  upload_speed: string | null;
  online: boolean;
  device_type: number | null;
  parent_id: string | null;
}

export interface XiaomiWifiDevice {
  mac: string | null;
  ip: string | null;
  name: string | null;
  signal: number | null;
  band: string | null;
}

export interface XiaomiWanInfo {
  ip: string | null;
  gateway: string | null;
  dns: string | null;
  wan_type: string | null;
  mask: string | null;
  ipv6_status: string | null;
}

export interface XiaomiLanPort {
  port: number | null;
  link_status: string | null;
  speed: string | null;
}

export interface XiaomiLanInfo {
  ip: string | null;
  mask: string | null;
  ports: XiaomiLanPort[];
}

export interface XiaomiNewStatus {
  mac: string | null;
  platform: string | null;
  version: string | null;
  sn: string | null;
  devices_online: number | null;
  devices_total: number | null;
}

export interface XiaomiWifiBand {
  /** Explicit band label emitted by the server: "2.4GHz" | "5GHz" | "6GHz".
   *  Added in #545 so the UI does not re-derive band from channel numbers
   *  (which are "0" in auto-channel / band-steering mode on BE3600). */
  band: string;
  ssid: string | null;
  channel: string | null;
  bandwidth: string | null;
  encryption: string | null;
  signal: number | null;
  status: string | null;
  band_steering: string | null;
}

export interface XiaomiFirmware {
  configured: boolean;
  reachable: boolean;
  router_name: string | null;
  language: string | null;
  rom_version: string | null;
  hardware: string | null;
  model: string | null;
  country_code: string | null;
  update_available: boolean;
  update_version: string | null;
}

// ─── Xiaomi Mesh Settings ────────────────────────────────

export interface XiaomiMeshTestConnectionResponse {
  success: boolean;
  message: string;
  router_model: string | null;
  hardware: string | null;
  firmware: string | null;
  router_name: string | null;
}

// ─── Device WiFi Info (merged from wifi-devices + devices) ──

/** Merged WiFi info for a single device (built client-side from Xiaomi APIs). */
export interface DeviceWifiInfo {
  mac: string;
  signal_dbm: number | null;
  band: string | null;
  connection_type: string;
  mesh_node: string | null;
  router_name: string | null;
  upload_bps: number | null;
  download_bps: number | null;
  is_online: boolean;
}

// ─── Cloudflare Tunnel ──────────────────────────────────────

export interface CloudflareTunnelConnection {
  colo_name: string | null;
  is_pending_reconnect: boolean;
  origin_ip: string | null;
  opened_at: string | null;
}

export interface CloudflareTunnelStatus {
  configured: boolean;
  connected: boolean;
  tunnel_id: string | null;
  tunnel_name: string | null;
  created_at: string | null;
  connections: CloudflareTunnelConnection[];
}

export interface CloudflareTunnelRoute {
  hostname: string;
  service: string;
  path: string | null;
}

export interface CloudflareTunnelRoutesResponse {
  routes: CloudflareTunnelRoute[];
}

export interface CloudflareTunnelWriteResponse {
  success: boolean;
  message: string;
}

export interface AddCloudflareRouteRequest {
  hostname: string;
  service: string;
  path?: string;
}

export interface UpdateCloudflareRouteRequest {
  hostname: string;
  service: string;
  path?: string;
}

// ─── Tailscale ──────────────────────────────────────────────

export interface TailscalePeer {
  hostname: string;
  dns_name: string;
  os: string;
  tailscale_ips: string[];
  online: boolean;
  active: boolean;
  exit_node: boolean;
  exit_node_option: boolean;
  rx_bytes: number;
  tx_bytes: number;
  last_seen: string | null;
}

export interface TailscaleStatusResponse {
  connected: boolean;
  backend_state: string;
  hostname: string;
  dns_name: string;
  tailscale_ips: string[];
  os: string;
  exit_node: boolean;
  exit_node_option: boolean;
  subnet_routes: string[];
  magic_dns_suffix: string;
  peers: TailscalePeer[];
  online_peers: number;
  total_peers: number;
}

// ─── Device Resolution ─────────────────────────────────

/** Result of a device identity resolution operation. */
export interface ResolveResult {
  /** Number of devices updated with a new hostname. */
  resolved: number;
  /** Total number of candidate devices (no hostname). */
  candidates: number;
  /** Which sources were successfully queried. */
  sources_queried: string[];
}

// ─── Users (RBAC) ────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  role: "admin" | "read-only" | "operator";
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role?: "admin" | "read-only" | "operator";
  email?: string;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  role?: "admin" | "read-only" | "operator";
  email?: string;
}

// ─── SNMP Management ─────────────────────────────────────

export interface SnmpConfig {
  enabled: boolean;
  community: string;
  version: string;
  port: number;
  timeout_seconds: number;
  retries: number;
}

export interface SnmpStatus {
  available: boolean;
  config: SnmpConfig;
}
