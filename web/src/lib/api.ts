/**
 * API client for Panoptikon server.
 *
 * Wraps fetch() with base URL handling, auth headers, and JSON parsing.
 */

import type {
  Agent,
  AgentCreateResponse,
  AgentReport,
  Alert,
  SshTarget,
  SshTargetRequest,
  SshReport,
  SshTestConnectionResponse,
  AuditLogListResponse,
  AuthStatus,
  ConfigActionResponse,
  ConfigBackup,
  ConfigBackupListResponse,
  ConfigDiffResponse,
  DashboardStats,
  DbSizeData,
  Device,
  DeviceSysinfo,
  DhcpServerConfig,
  DhcpStaticMapping,
  DnsForwardingConfig,
  FirewallConfig,
  FirewallRuleRequest,
  FirewallGroups,
  LoginResponse,
  NetflowStatus,
  NpmAccessList,
  NpmAccessListRequest,
  NpmCertificate,
  NpmConnectionStatus,
  NpmDeadHost,
  NpmProxyHost,
  NpmProxyHostRequest,
  NpmRedirectionHost,
  NpmStream,
  PendingChangesResponse,
  RouterStatus,
  RouterSummary,
  SearchResponse,
  SettingsData,
  SpeedTestResult,
  SpeedTestHistoryResponse,
  SystemInfo,
  SyslogResponse,
  TopDevice,
  TrafficHistoryPoint,
  VyosDhcpLease,
  VyosInterface,
  VyosRoute,
  VyosWriteResponse,
  WireguardInterface,
  WireguardKeyPair,
  ClientConfigResponse,
  AddServiceRequest,
  AddServiceResponse,
  RemoveServiceRequest,
  RemoveServiceResponse,
  MikrotikStatus,
  MikrotikInterface,
  MikrotikRoute,
  MikrotikDhcpLease,
  MikrotikFirewall,
  MikrotikDns,
  MikrotikWireguard,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include", // always send session cookie (HttpOnly, set by server)
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401) {
      if (typeof window !== "undefined"
          && !window.location.pathname.startsWith("/login")
          && !window.location.pathname.startsWith("/setup")) {
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        // body wasn't JSON — keep statusText
      }
      throw new Error(`API error ${res.status}: ${detail}`);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as unknown as T;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Generic CRUD ───────────────────────────────────────

export async function apiGet<T>(
  path: string,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return request<T>(path, opts);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: "DELETE" });
}

// ─── Dashboard ──────────────────────────────────────────

const DASHBOARD_TIMEOUT_MS = 8_000;

export function fetchDashboardStats(): Promise<DashboardStats> {
  return apiGet<DashboardStats>("/api/v1/dashboard/stats", {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });
}

export function fetchRecentAlerts(limit = 5): Promise<Alert[]> {
  return apiGet<Alert[]>(`/api/v1/alerts?limit=${limit}`, {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });
}

export function fetchTopDevices(limit = 5): Promise<TopDevice[]> {
  return apiGet<TopDevice[]>(`/api/v1/dashboard/top-devices?limit=${limit}`, {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });
}

export function fetchAlerts(
  limit = 50,
  status?: "active" | "acknowledged" | "all",
  severity?: "INFO" | "WARNING" | "CRITICAL"
): Promise<Alert[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  return apiGet<Alert[]>(`/api/v1/alerts?${params}`);
}

export function markAlertRead(id: string): Promise<void> {
  return apiPost<void>(`/api/v1/alerts/${id}/read`);
}

export function acknowledgeAlert(id: string, note?: string): Promise<void> {
  return apiPost<void>(`/api/v1/alerts/${id}/acknowledge`, { note });
}

export function deleteAlert(id: string): Promise<void> {
  return apiDelete(`/api/v1/alerts/${id}`);
}

export function deleteAllAlerts(): Promise<void> {
  return apiDelete("/api/v1/alerts");
}

export function markAllAlertsRead(): Promise<void> {
  return apiPost<void>("/api/v1/alerts/mark-all-read");
}

export function muteDevice(id: string, hours: number): Promise<void> {
  return apiPost<void>(`/api/v1/devices/${id}/mute?hours=${hours}`);
}

// ─── Devices ────────────────────────────────────────────

export function fetchDevices(): Promise<Device[]> {
  return apiGet<Device[]>("/api/v1/devices");
}

export function fetchDevice(id: string): Promise<Device> {
  return apiGet<Device>(`/api/v1/devices/${id}`);
}

export interface DeviceEvent {
  id: number;
  event_type: "online" | "offline";
  occurred_at: string;
}

export interface UptimeStats {
  uptime_percent: number;
  online_seconds: number;
  total_seconds: number;
}

export function fetchDeviceEvents(id: string, limit = 50): Promise<DeviceEvent[]> {
  return apiGet<DeviceEvent[]>(`/api/v1/devices/${id}/events?limit=${limit}`);
}

export function fetchDeviceUptime(id: string, days = 7): Promise<UptimeStats> {
  return apiGet<UptimeStats>(`/api/v1/devices/${id}/uptime?days=${days}`);
}

export function wakeDevice(id: string): Promise<void> {
  return apiPost<void>(`/api/v1/devices/${id}/wake`);
}

export interface PortEntry {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version: string;
}

export interface PortScanResult {
  device_id: string;
  scanned_at: string;
  ports: PortEntry[];
}

export function triggerPortScan(id: string): Promise<PortScanResult> {
  return apiPost<PortScanResult>(`/api/v1/devices/${id}/scan`);
}

export function fetchPortScan(id: string): Promise<PortScanResult> {
  return apiGet<PortScanResult>(`/api/v1/devices/${id}/scan`);
}

export interface EnrichmentCorrection {
  os_family?: string;
  os_version?: string;
  device_type?: string;
  device_model?: string;
  device_brand?: string;
}

export function updateDeviceEnrichment(
  id: string,
  body: EnrichmentCorrection
): Promise<void> {
  return apiPatch<void>(`/api/v1/devices/${id}/enrichment`, body);
}

export function fetchDeviceSysinfo(id: string): Promise<DeviceSysinfo | null> {
  return apiGet<DeviceSysinfo | null>(`/api/v1/devices/${id}/sysinfo`);
}

export interface DeviceCustomFields {
  custom_name?: string;
  custom_type?: string;
  custom_os?: string;
  custom_vendor?: string;
  custom_model?: string;
  notes?: string;
  icon_override?: string;
  location?: string;
  owner?: string;
  tags?: string;
  cpu_manual?: string;
  ram_manual?: string;
  disk_manual?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  serial_number?: string;
}

export function updateDevice(
  id: string,
  body: DeviceCustomFields
): Promise<void> {
  return apiPatch<void>(`/api/v1/devices/${id}`, body);
}

export function resetDeviceCustom(id: string): Promise<void> {
  return apiDelete(`/api/v1/devices/${id}/custom`);
}

export interface CreateAssetRequest {
  is_manual: true;
  custom_name: string;
  custom_type?: string;
  ip?: string;
  mac?: string;
  custom_os?: string;
  custom_vendor?: string;
  custom_model?: string;
  notes?: string;
  location?: string;
  owner?: string;
  tags?: string;
  cpu_manual?: string;
  ram_manual?: string;
  disk_manual?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  serial_number?: string;
}

export function createAsset(body: CreateAssetRequest): Promise<Device> {
  return apiPost<Device>("/api/v1/devices", body);
}

// ─── Agents ─────────────────────────────────────────────

export function fetchAgents(): Promise<Agent[]> {
  return apiGet<Agent[]>("/api/v1/agents");
}

export function createAgent(name: string): Promise<AgentCreateResponse> {
  return apiPost<AgentCreateResponse>("/api/v1/agents", { name });
}

export function fetchAgent(id: string): Promise<Agent> {
  return apiGet<Agent>(`/api/v1/agents/${id}`);
}

export function fetchAgentReports(id: string, limit = 100): Promise<AgentReport[]> {
  return apiGet<AgentReport[]>(`/api/v1/agents/${id}/reports?limit=${limit}`);
}

// ─── Traffic ────────────────────────────────────────────

export function fetchTrafficHistory(minutes = 60): Promise<TrafficHistoryPoint[]> {
  return apiGet<TrafficHistoryPoint[]>(`/api/v1/traffic/history?minutes=${minutes}`, {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
  });
}

// ─── Auth ───────────────────────────────────────────────

export function fetchAuthStatus(): Promise<AuthStatus> {
  return apiGet<AuthStatus>("/api/v1/auth/status");
}

export function login(password: string): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/v1/auth/login", { password });
}

export function logout(): Promise<void> {
  return apiPost<void>("/api/v1/auth/logout");
}

export function runSetup(body: {
  password: string;
  vyos_url?: string;
  vyos_api_key?: string;
}): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/v1/setup", body);
}

// ─── Router / VyOS ──────────────────────────────────────

export function fetchRouterStatus(): Promise<RouterStatus> {
  return apiGet<RouterStatus>("/api/v1/vyos/status");
}

export function fetchRouterSummary(): Promise<RouterSummary> {
  return apiGet<RouterSummary>("/api/v1/vyos/router-summary");
}

export function fetchSystemInfo(): Promise<SystemInfo> {
  return apiGet<SystemInfo>("/api/v1/vyos/system-info");
}

export function fetchSyslog(
  lines = 50,
  filter?: string
): Promise<SyslogResponse> {
  const params = new URLSearchParams({ lines: String(lines) });
  if (filter) params.set("filter", filter);
  return apiGet<SyslogResponse>(`/api/v1/vyos/syslog?${params}`);
}

export function fetchRouterInterfaces(): Promise<VyosInterface[]> {
  return apiGet<VyosInterface[]>("/api/v1/vyos/interfaces");
}

export function fetchRouterConfigInterfaces(): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>("/api/v1/vyos/config-interfaces");
}

export function fetchRouterRoutes(): Promise<VyosRoute[]> {
  return apiGet<VyosRoute[]>("/api/v1/vyos/routes");
}

export function fetchRouterDhcpLeases(): Promise<VyosDhcpLease[]> {
  return apiGet<VyosDhcpLease[]>("/api/v1/vyos/dhcp-leases");
}

export function fetchRouterFirewall(): Promise<FirewallConfig> {
  return apiGet<FirewallConfig>("/api/v1/vyos/firewall");
}

export function runSpeedTest(): Promise<SpeedTestResult> {
  return apiPost<SpeedTestResult>("/api/v1/router/speedtest");
}

export function fetchSpeedTestHistory(
  limit = 20,
  offset = 0
): Promise<SpeedTestHistoryResponse> {
  return apiGet<SpeedTestHistoryResponse>(
    `/api/v1/router/speedtest/history?limit=${limit}&offset=${offset}`
  );
}

// ─── DNS Forwarding ─────────────────────────────────────

export function fetchDnsForwarding(): Promise<DnsForwardingConfig> {
  return apiGet<DnsForwardingConfig>("/api/v1/vyos/dns/forwarding");
}

export function addDnsNameServer(server: string): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/dns/forwarding/name-servers", {
    server,
  });
}

export function deleteDnsNameServer(
  server: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dns/forwarding/name-servers/${encodeURIComponent(server)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function addDnsDomainOverride(body: {
  domain: string;
  server: string;
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    "/api/v1/vyos/dns/forwarding/domain-overrides",
    body
  );
}

export function editDnsDomainOverride(
  domain: string,
  body: { domain: string; server: string }
): Promise<VyosWriteResponse> {
  return apiPut<VyosWriteResponse>(
    `/api/v1/vyos/dns/forwarding/domain-overrides/${encodeURIComponent(domain)}`,
    body
  );
}

export function deleteDnsDomainOverride(
  domain: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dns/forwarding/domain-overrides/${encodeURIComponent(domain)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

// ─── Firewall Groups ─────────────────────────────────────

export function fetchFirewallGroups(): Promise<FirewallGroups> {
  return apiGet<FirewallGroups>("/api/v1/vyos/firewall/groups");
}

export function createAddressGroup(body: {
  name: string;
  description?: string;
  addresses?: string[];
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/firewall/groups/address-group", body);
}

export function deleteAddressGroup(name: string): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/address-group/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function addAddressGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/firewall/groups/address-group/${encodeURIComponent(name)}/members`,
    { value }
  );
}

export function removeAddressGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/address-group/${encodeURIComponent(name)}/members/${encodeURIComponent(value)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function createNetworkGroup(body: {
  name: string;
  description?: string;
  networks?: string[];
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/firewall/groups/network-group", body);
}

export function deleteNetworkGroup(name: string): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/network-group/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function addNetworkGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/firewall/groups/network-group/${encodeURIComponent(name)}/members`,
    { value }
  );
}

export function removeNetworkGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/network-group/${encodeURIComponent(name)}/members/${encodeURIComponent(value)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function createPortGroup(body: {
  name: string;
  description?: string;
  ports?: string[];
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/firewall/groups/port-group", body);
}

export function deletePortGroup(name: string): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/port-group/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function addPortGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/firewall/groups/port-group/${encodeURIComponent(name)}/members`,
    { value }
  );
}

export function removePortGroupMember(
  name: string,
  value: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/groups/port-group/${encodeURIComponent(name)}/members/${encodeURIComponent(value)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function toggleInterface(
  name: string,
  disable: boolean
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(`/api/v1/vyos/interfaces/${name}/toggle`, {
    disable,
  });
}

export function fetchDhcpStaticMappings(): Promise<DhcpStaticMapping[]> {
  return apiGet<DhcpStaticMapping[]>("/api/v1/vyos/dhcp/static-mappings");
}

export function createDhcpStaticMapping(body: {
  network: string;
  subnet: string;
  name: string;
  mac: string;
  ip: string;
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/dhcp/static-mappings", body);
}

export function updateDhcpStaticMapping(
  network: string,
  subnet: string,
  name: string,
  body: { network: string; subnet: string; name: string; mac: string; ip: string }
): Promise<VyosWriteResponse> {
  return apiPut<VyosWriteResponse>(
    `/api/v1/vyos/dhcp/static-mappings/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/${encodeURIComponent(name)}`,
    body
  );
}

export function deleteDhcpStaticMapping(
  network: string,
  subnet: string,
  name: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dhcp/static-mappings/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function fetchDhcpServerConfig(): Promise<DhcpServerConfig> {
  return apiGet<DhcpServerConfig>("/api/v1/vyos/dhcp/config");
}

export function toggleDhcpSubnet(
  network: string,
  subnet: string,
  disable: boolean
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/dhcp/subnets/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/toggle`,
    { disable }
  );
}

// ─── Static Routes ──────────────────────────────────────

export function createStaticRoute(body: {
  destination: string;
  next_hop?: string;
  distance?: number;
  description?: string;
  blackhole?: boolean;
}): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/routes/static", body);
}

export function deleteStaticRoute(
  destination: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/routes/static/${encodeURIComponent(destination)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

// ─── Firewall CRUD ───────────────────────────────────────

/** Chain path is dot-separated: "ipv4.forward.filter" */
function chainPath(chain: { path: string[] }): string {
  return chain.path.join(".");
}

export function createFirewallRule(
  chain: { path: string[] },
  body: FirewallRuleRequest
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/firewall/${encodeURIComponent(chainPath(chain))}/rules`,
    body
  );
}

export function updateFirewallRule(
  chain: { path: string[] },
  number: number,
  body: FirewallRuleRequest
): Promise<VyosWriteResponse> {
  return apiPut<VyosWriteResponse>(
    `/api/v1/vyos/firewall/${encodeURIComponent(chainPath(chain))}/rules/${number}`,
    body
  );
}

export function deleteFirewallRule(
  chain: { path: string[] },
  number: number
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/firewall/${encodeURIComponent(chainPath(chain))}/rules/${number}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function toggleFirewallRule(
  chain: { path: string[] },
  number: number,
  disabled: boolean
): Promise<VyosWriteResponse> {
  return apiPatch<VyosWriteResponse>(
    `/api/v1/vyos/firewall/${encodeURIComponent(chainPath(chain))}/rules/${number}/enabled`,
    { disabled }
  );
}

// ─── NetFlow ────────────────────────────────────────────

export function fetchNetflowStatus(): Promise<NetflowStatus> {
  return apiGet<NetflowStatus>("/api/v1/settings/netflow-status");
}

// ─── Search ─────────────────────────────────────────────

export function searchAll(q: string): Promise<SearchResponse> {
  return apiGet<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`);
}

// ─── Settings ───────────────────────────────────────────

export function fetchSettings(): Promise<SettingsData> {
  return apiGet<SettingsData>("/api/v1/settings");
}

export function updateSettings(body: {
  webhook_url?: string;
  vyos_url?: string;
  vyos_api_key?: string;
  scan_interval_seconds?: number;
  scan_subnets?: string;
  ping_sweep_enabled?: boolean;
  retention_traffic_hours?: number;
  retention_alerts_days?: number;
  retention_agent_reports_days?: number;
  speedtest_retention_days?: number;
  speedtest_auto_interval_hours?: number;
  npm_url?: string;
  npm_email?: string;
  npm_password?: string;
  mikrotik_url?: string;
  mikrotik_user?: string;
  mikrotik_password?: string;
  mikrotik_enabled?: boolean;
}): Promise<SettingsData> {
  return apiPatch<SettingsData>("/api/v1/settings", body);
}

export function fetchDbSize(): Promise<DbSizeData> {
  return apiGet<DbSizeData>("/api/v1/settings/db-size");
}

export function triggerVacuum(): Promise<void> {
  return apiPost<void>("/api/v1/settings/vacuum");
}

// ─── Audit Log ──────────────────────────────────────────

export function fetchAuditLog(
  page = 1,
  perPage = 25,
  action?: string
): Promise<AuditLogListResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (action) params.set("action", action);
  return apiGet<AuditLogListResponse>(`/api/v1/audit-log?${params}`);
}

export function fetchAuditLogActions(): Promise<string[]> {
  return apiGet<string[]>("/api/v1/audit-log/actions");
}

// ─── WireGuard VPN ───────────────────────────────────────

export function fetchWireguardInterfaces(): Promise<WireguardInterface[]> {
  return apiGet<WireguardInterface[]>("/api/v1/vyos/wireguard");
}

export function createWireguardInterface(body: {
  name: string;
  port: number;
  address: string;
}): Promise<WireguardKeyPair> {
  return apiPost<WireguardKeyPair>("/api/v1/vyos/wireguard", body);
}

export function deleteWireguardInterface(
  name: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/wireguard/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function addWireguardPeer(
  iface: string,
  body: {
    name: string;
    public_key: string;
    allowed_ips: string;
    persistent_keepalive?: number;
  }
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/wireguard/${encodeURIComponent(iface)}/peers`,
    body
  );
}

export function deleteWireguardPeer(
  iface: string,
  peer: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/wireguard/${encodeURIComponent(iface)}/peers/${encodeURIComponent(peer)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function generateWireguardKeypair(): Promise<WireguardKeyPair> {
  return apiPost<WireguardKeyPair>("/api/v1/vyos/wireguard/generate-keypair");
}

export function generateWireguardClientConfig(
  iface: string,
  peer: string,
  body: {
    client_address: string;
    dns?: string;
    endpoint?: string;
    allowed_ips?: string;
  }
): Promise<ClientConfigResponse> {
  return apiPost<ClientConfigResponse>(
    `/api/v1/vyos/wireguard/${encodeURIComponent(iface)}/peers/${encodeURIComponent(peer)}/generate-config`,
    body
  );
}

// ─── Topology Positions ──────────────────────────────────

export interface NodePosition {
  node_id: string;
  x: number;
  y: number;
  pinned: boolean;
}

export function fetchTopologyPositions(): Promise<NodePosition[]> {
  return apiGet<NodePosition[]>("/api/v1/topology/positions");
}

export function saveTopologyPositions(positions: NodePosition[]): Promise<void> {
  return apiPut<void>("/api/v1/topology/positions", { positions });
}

export function deleteTopologyPositions(): Promise<void> {
  return apiDelete("/api/v1/topology/positions");
}

// ─── Config Backups ─────────────────────────────────────

export function fetchConfigBackups(
  page = 1,
  perPage = 25
): Promise<ConfigBackupListResponse> {
  return apiGet<ConfigBackupListResponse>(
    `/api/v1/config-backups?page=${page}&per_page=${perPage}`
  );
}

export function fetchConfigBackup(id: number): Promise<ConfigBackup> {
  return apiGet<ConfigBackup>(`/api/v1/config-backups/${id}`);
}

export function createConfigBackup(label?: string): Promise<ConfigBackup> {
  return apiPost<ConfigBackup>("/api/v1/config-backups", { label: label || null });
}

export function deleteConfigBackup(id: number): Promise<void> {
  return apiDelete(`/api/v1/config-backups/${id}`);
}

export function fetchCurrentConfig(): Promise<{ config_text: string }> {
  return apiGet<{ config_text: string }>("/api/v1/config-backups/current");
}

export function fetchConfigDiff(id: number): Promise<ConfigDiffResponse> {
  return apiGet<ConfigDiffResponse>(`/api/v1/config-backups/${id}/diff`);
}

export function fetchPendingChanges(): Promise<PendingChangesResponse> {
  return apiGet<PendingChangesResponse>("/api/v1/config-backups/pending");
}

export function commitConfig(): Promise<ConfigActionResponse> {
  return apiPost<ConfigActionResponse>("/api/v1/config-backups/commit");
}

export function discardConfig(): Promise<ConfigActionResponse> {
  return apiPost<ConfigActionResponse>("/api/v1/config-backups/discard");
}

export function restoreConfigBackup(
  id: number,
  snapshotLabel?: string
): Promise<ConfigActionResponse> {
  return apiPost<ConfigActionResponse>(`/api/v1/config-backups/${id}/restore`, {
    snapshot_label: snapshotLabel || null,
  });
}

// ─── Nginx Proxy Manager ─────────────────────────────────

export function fetchNpmStatus(): Promise<NpmConnectionStatus> {
  return apiGet<NpmConnectionStatus>("/api/v1/npm/status");
}

export function fetchNpmProxyHosts(): Promise<NpmProxyHost[]> {
  return apiGet<NpmProxyHost[]>("/api/v1/npm/proxy-hosts");
}

// ─── Proxy Hosts ────────────────────────────────────────

export function createNpmProxyHost(
  body: NpmProxyHostRequest
): Promise<NpmProxyHost> {
  return apiPost<NpmProxyHost>("/api/v1/npm/proxy-hosts", body);
}

export function updateNpmProxyHost(
  id: number,
  body: NpmProxyHostRequest
): Promise<NpmProxyHost> {
  return apiPut<NpmProxyHost>(`/api/v1/npm/proxy-hosts/${id}`, body);
}

export function deleteNpmProxyHost(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/proxy-hosts/${id}`);
}

export function toggleNpmProxyHost(
  id: number,
  enabled: boolean
): Promise<void> {
  return apiPost<void>(`/api/v1/npm/proxy-hosts/${id}/toggle`, { enabled });
}

export function fetchNpmCertificates(): Promise<NpmCertificate[]> {
  return apiGet<NpmCertificate[]>("/api/v1/npm/certificates");
}

export function createLetsEncryptCert(body: {
  domain_names: string[];
  email: string;
  dns_challenge?: boolean;
}): Promise<NpmCertificate> {
  return apiPost<NpmCertificate>("/api/v1/npm/certificates/letsencrypt", body);
}

export function uploadCustomCert(body: {
  nice_name: string;
  certificate: string;
  certificate_key: string;
}): Promise<NpmCertificate> {
  return apiPost<NpmCertificate>("/api/v1/npm/certificates/custom", body);
}

export function renewNpmCertificate(id: number): Promise<NpmCertificate> {
  return apiPost<NpmCertificate>(`/api/v1/npm/certificates/${id}/renew`);
}

export function deleteNpmCertificate(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/certificates/${id}`);
}

// ─── Redirection Hosts ──────────────────────────────────

export function fetchNpmRedirectionHosts(): Promise<NpmRedirectionHost[]> {
  return apiGet<NpmRedirectionHost[]>("/api/v1/npm/redirection-hosts");
}

export function createNpmRedirectionHost(body: {
  domain_names: string[];
  forward_http_code: number;
  forward_scheme: string;
  forward_domain_name: string;
  preserve_path: boolean;
  ssl_forced: boolean;
  block_exploits: boolean;
  enabled?: boolean;
}): Promise<NpmRedirectionHost> {
  return apiPost<NpmRedirectionHost>("/api/v1/npm/redirection-hosts", body);
}

export function updateNpmRedirectionHost(
  id: number,
  body: {
    domain_names: string[];
    forward_http_code: number;
    forward_scheme: string;
    forward_domain_name: string;
    preserve_path: boolean;
    ssl_forced: boolean;
    block_exploits: boolean;
    enabled?: boolean;
  }
): Promise<NpmRedirectionHost> {
  return apiPut<NpmRedirectionHost>(`/api/v1/npm/redirection-hosts/${id}`, body);
}

export function deleteNpmRedirectionHost(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/redirection-hosts/${id}`);
}

// ─── Streams (TCP/UDP proxies) ──────────────────────────

export function fetchNpmStreams(): Promise<NpmStream[]> {
  return apiGet<NpmStream[]>("/api/v1/npm/streams");
}

export function createNpmStream(body: {
  incoming_port: number;
  forwarding_host: string;
  forwarding_port: number;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
}): Promise<NpmStream> {
  return apiPost<NpmStream>("/api/v1/npm/streams", body);
}

export function updateNpmStream(
  id: number,
  body: {
    incoming_port: number;
    forwarding_host: string;
    forwarding_port: number;
    tcp_forwarding: boolean;
    udp_forwarding: boolean;
  }
): Promise<NpmStream> {
  return apiPut<NpmStream>(`/api/v1/npm/streams/${id}`, body);
}

export function deleteNpmStream(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/streams/${id}`);
}

export function toggleNpmStream(
  id: number,
  enabled: boolean
): Promise<void> {
  return apiPost<void>(`/api/v1/npm/streams/${id}/toggle`, { enabled });
}

// ─── Dead Hosts ─────────────────────────────────────────

export function fetchNpmDeadHosts(): Promise<NpmDeadHost[]> {
  return apiGet<NpmDeadHost[]>("/api/v1/npm/dead-hosts");
}

export function createNpmDeadHost(body: {
  domain_names: string[];
  ssl_forced: boolean;
}): Promise<NpmDeadHost> {
  return apiPost<NpmDeadHost>("/api/v1/npm/dead-hosts", body);
}

export function deleteNpmDeadHost(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/dead-hosts/${id}`);
}

// ─── Access Lists ────────────────────────────────────────

export function fetchNpmAccessLists(): Promise<NpmAccessList[]> {
  return apiGet<NpmAccessList[]>("/api/v1/npm/access-lists");
}

export function createNpmAccessList(
  body: NpmAccessListRequest
): Promise<NpmAccessList> {
  return apiPost<NpmAccessList>("/api/v1/npm/access-lists", body);
}

export function updateNpmAccessList(
  id: number,
  body: NpmAccessListRequest
): Promise<NpmAccessList> {
  return apiPut<NpmAccessList>(`/api/v1/npm/access-lists/${id}`, body);
}

export function deleteNpmAccessList(id: number): Promise<void> {
  return apiDelete(`/api/v1/npm/access-lists/${id}`);
}

// ─── SSH Targets (agentless monitoring) ──────────────────

export function fetchSshTargets(): Promise<SshTarget[]> {
  return apiGet<SshTarget[]>("/api/v1/ssh-targets");
}

export function fetchSshTarget(id: string): Promise<SshTarget> {
  return apiGet<SshTarget>(`/api/v1/ssh-targets/${id}`);
}

export function createSshTarget(body: SshTargetRequest): Promise<SshTarget> {
  return apiPost<SshTarget>("/api/v1/ssh-targets", body);
}

export function updateSshTarget(
  id: string,
  body: SshTargetRequest
): Promise<SshTarget> {
  return apiPut<SshTarget>(`/api/v1/ssh-targets/${id}`, body);
}

export function deleteSshTarget(id: string): Promise<void> {
  return apiDelete(`/api/v1/ssh-targets/${id}`);
}

export function fetchSshTargetReports(
  id: string,
  limit = 100
): Promise<SshReport[]> {
  return apiGet<SshReport[]>(
    `/api/v1/ssh-targets/${id}/reports?limit=${limit}`
  );
}

export function testSshConnection(
  id: string
): Promise<SshTestConnectionResponse> {
  return apiPost<SshTestConnectionResponse>(`/api/v1/ssh-targets/${id}/test`);
}

// ─── Services Wizard ─────────────────────────────────────

export function addService(
  body: AddServiceRequest
): Promise<AddServiceResponse> {
  return apiPost<AddServiceResponse>("/api/v1/services/add", body);
}

export function removeService(
  body: RemoveServiceRequest
): Promise<RemoveServiceResponse> {
  return apiPost<RemoveServiceResponse>("/api/v1/services/remove", body);
}

// ─── MikroTik ────────────────────────────────────────────

export function fetchMikrotikStatus(): Promise<MikrotikStatus> {
  return apiGet<MikrotikStatus>("/api/v1/mikrotik/status");
}

export function fetchMikrotikInterfaces(): Promise<MikrotikInterface[]> {
  return apiGet<MikrotikInterface[]>("/api/v1/mikrotik/interfaces");
}

export function fetchMikrotikRoutes(): Promise<MikrotikRoute[]> {
  return apiGet<MikrotikRoute[]>("/api/v1/mikrotik/routes");
}

export function fetchMikrotikDhcpLeases(): Promise<MikrotikDhcpLease[]> {
  return apiGet<MikrotikDhcpLease[]>("/api/v1/mikrotik/dhcp-leases");
}

export function fetchMikrotikFirewall(): Promise<MikrotikFirewall> {
  return apiGet<MikrotikFirewall>("/api/v1/mikrotik/firewall");
}

export function fetchMikrotikDns(): Promise<MikrotikDns> {
  return apiGet<MikrotikDns>("/api/v1/mikrotik/dns");
}

export function fetchMikrotikWireguard(): Promise<MikrotikWireguard> {
  return apiGet<MikrotikWireguard>("/api/v1/mikrotik/wireguard");
}
