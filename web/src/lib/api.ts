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
  CaddyProxyHost,
  CaddyProxyHostRequest,
  CaddyStatus,
  ConfigActionResponse,
  ConfigBackup,
  ConfigBackupListResponse,
  ConfigDiffResponse,
  DashboardStats,
  DbSizeData,
  Device,
  DeviceSysinfo,
  DeviceTrafficPoint,
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
  UnboundDnsRecord,
  UnboundDnsRecordRequest,
  UnboundTestConnectionResponse,
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
  MikrotikVlan,
  MikrotikVlanRequest,
  MikrotikRoute,
  MikrotikDhcpLease,
  MikrotikFirewall,
  MikrotikFirewallFilterRequest,
  MikrotikFirewallNatRequest,
  MikrotikAddressListRequest,
  MikrotikDns,
  MikrotikWireguard,
  Asset,
  AssetRequest,
  AssetImportRow,
  AssetImportResponse,
  AssetAutoLinkResponse,
  AssetSyncFromDevicesResponse,
  AlertRule,
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
  TopologyGraph,
  NodePosition,
  DnsQueriesResponse,
  DnsQueryLogResponse,
  DnsQueryStats,
  DnsStatsResponse,
  DnsIngestEntry,
  DnsIngestResponse,
  DnsPurgeResponse,
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
  severity?: "INFO" | "WARNING" | "CRITICAL",
  alertType?: Alert["type"]
): Promise<Alert[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  if (alertType) params.set("type", alertType);
  return apiGet<Alert[]>(`/api/v1/alerts?${params}`);
}

export function markAlertRead(id: string): Promise<void> {
  return apiPost<void>(`/api/v1/alerts/${id}/read`);
}

export function markAlertUnread(id: string): Promise<void> {
  return apiPost<void>(`/api/v1/alerts/${id}/unread`);
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

export function fetchDeviceTraffic(
  deviceId: string,
  range: "1h" | "24h" | "7d" | "30d" = "1h"
): Promise<DeviceTrafficPoint[]> {
  return apiGet<DeviceTrafficPoint[]>(
    `/api/v1/devices/${deviceId}/traffic?range=${range}`,
    { timeoutMs: DASHBOARD_TIMEOUT_MS }
  );
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

export function createDhcpSubnet(
  body: import("./types").CreateDhcpSubnetRequest
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/dhcp/subnets", body);
}

export function updateDhcpSubnet(
  network: string,
  subnet: string,
  body: import("./types").UpdateDhcpSubnetRequest
): Promise<VyosWriteResponse> {
  return apiPut<VyosWriteResponse>(
    `/api/v1/vyos/dhcp/subnets/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}`,
    body
  );
}

export function deleteDhcpSubnet(
  network: string,
  subnet: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dhcp/subnets/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function createDhcpPoolRange(
  network: string,
  subnet: string,
  rangeName: string,
  body: import("./types").DhcpPoolRangeRequest
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/dhcp/subnets/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/ranges/${encodeURIComponent(rangeName)}`,
    body
  );
}

export function deleteDhcpPoolRange(
  network: string,
  subnet: string,
  rangeName: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dhcp/subnets/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/ranges/${encodeURIComponent(rangeName)}`
  ) as unknown as Promise<VyosWriteResponse>;
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
  unbound_control_path?: string;
  caddy_admin_url?: string;
  xiaomi_mesh_enabled?: boolean;
  xiaomi_mesh_ip?: string;
  xiaomi_mesh_password?: string;
  xiaomi_mesh_poll_interval?: number;
  cloudflare_api_token?: string;
  cloudflare_account_id?: string;
  cloudflare_tunnel_id?: string;
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

// ─── OpenVPN ─────────────────────────────────────────────

export function fetchOpenVpnInterfaces(): Promise<
  import("./types").OpenVpnInterface[]
> {
  return apiGet<import("./types").OpenVpnInterface[]>("/api/v1/vyos/openvpn");
}

export function createOpenVpnInterface(
  body: import("./types").CreateOpenVpnInterfaceRequest
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>("/api/v1/vyos/openvpn", body);
}

export function deleteOpenVpnInterface(
  name: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/openvpn/${encodeURIComponent(name)}`
  ) as unknown as Promise<VyosWriteResponse>;
}

export function toggleOpenVpnInterface(
  name: string,
  disable: boolean
): Promise<VyosWriteResponse> {
  return apiPost<VyosWriteResponse>(
    `/api/v1/vyos/openvpn/${encodeURIComponent(name)}/toggle`,
    { disable }
  );
}

export function fetchOpenVpnClients(
  name: string
): Promise<import("./types").OpenVpnConnectedClient[]> {
  return apiGet<import("./types").OpenVpnConnectedClient[]>(
    `/api/v1/vyos/openvpn/${encodeURIComponent(name)}/clients`
  );
}

// ─── Topology ───────────────────────────────────────────

export type { NodePosition };

export function fetchTopologyGraph(): Promise<TopologyGraph> {
  return apiGet<TopologyGraph>("/api/v1/topology/graph");
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

export function fetchMikrotikVlans(): Promise<MikrotikVlan[]> {
  return apiGet<MikrotikVlan[]>("/api/v1/mikrotik/vlans");
}

export function createMikrotikVlan(body: MikrotikVlanRequest): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/vlans", body);
}

export function updateMikrotikVlan(
  id: string,
  body: MikrotikVlanRequest
): Promise<void> {
  return apiPut<void>(`/api/v1/mikrotik/vlans/${encodeURIComponent(id)}`, body);
}

export function deleteMikrotikVlan(id: string): Promise<void> {
  return apiDelete(`/api/v1/mikrotik/vlans/${encodeURIComponent(id)}`);
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

export function createMikrotikFirewallFilter(
  body: MikrotikFirewallFilterRequest
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/firewall/filter", body);
}

export function updateMikrotikFirewallFilter(
  id: string,
  body: MikrotikFirewallFilterRequest
): Promise<void> {
  return apiPatch<void>(
    `/api/v1/mikrotik/firewall/filter/${encodeURIComponent(id)}`,
    body
  );
}

export function deleteMikrotikFirewallFilter(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/mikrotik/firewall/filter/${encodeURIComponent(id)}`
  );
}

export function toggleMikrotikFirewallFilter(
  id: string,
  disabled: boolean
): Promise<void> {
  return apiPost<void>(
    `/api/v1/mikrotik/firewall/filter/${encodeURIComponent(id)}/toggle`,
    { disabled }
  );
}

export function createMikrotikFirewallNat(
  body: MikrotikFirewallNatRequest
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/firewall/nat", body);
}

export function updateMikrotikFirewallNat(
  id: string,
  body: MikrotikFirewallNatRequest
): Promise<void> {
  return apiPatch<void>(
    `/api/v1/mikrotik/firewall/nat/${encodeURIComponent(id)}`,
    body
  );
}

export function deleteMikrotikFirewallNat(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/mikrotik/firewall/nat/${encodeURIComponent(id)}`
  );
}

export function toggleMikrotikFirewallNat(
  id: string,
  disabled: boolean
): Promise<void> {
  return apiPost<void>(
    `/api/v1/mikrotik/firewall/nat/${encodeURIComponent(id)}/toggle`,
    { disabled }
  );
}

export function createMikrotikAddressList(
  body: MikrotikAddressListRequest
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/firewall/address-list", body);
}

export function deleteMikrotikAddressList(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/mikrotik/firewall/address-list/${encodeURIComponent(id)}`
  );
}

export function fetchMikrotikDns(): Promise<MikrotikDns> {
  return apiGet<MikrotikDns>("/api/v1/mikrotik/dns");
}

export function fetchMikrotikWireguard(): Promise<MikrotikWireguard> {
  return apiGet<MikrotikWireguard>("/api/v1/mikrotik/wireguard");
}

// ─── Assets (IT inventory) ───────────────────────────────

export function fetchAssets(params?: {
  type?: string;
  tag?: string;
  status?: string;
  location?: string;
}): Promise<Asset[]> {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.status) qs.set("status", params.status);
  if (params?.location) qs.set("location", params.location);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiGet<Asset[]>(`/api/v1/assets${suffix}`);
}

export function fetchAsset(id: string): Promise<Asset> {
  return apiGet<Asset>(`/api/v1/assets/${id}`);
}

export function createAssetInventory(body: AssetRequest): Promise<Asset> {
  return apiPost<Asset>("/api/v1/assets", body);
}

export function updateAssetInventory(
  id: string,
  body: AssetRequest
): Promise<Asset> {
  return apiPut<Asset>(`/api/v1/assets/${id}`, body);
}

export function deleteAssetInventory(id: string): Promise<void> {
  return apiDelete(`/api/v1/assets/${id}`);
}

export function importAssets(
  rows: AssetImportRow[]
): Promise<AssetImportResponse> {
  return apiPost<AssetImportResponse>("/api/v1/assets/import", { rows });
}

export function autoLinkAssets(): Promise<AssetAutoLinkResponse> {
  return apiPost<AssetAutoLinkResponse>("/api/v1/assets/auto-link");
}

export function syncAssetsFromDevices(): Promise<AssetSyncFromDevicesResponse> {
  return apiPost<AssetSyncFromDevicesResponse>(
    "/api/v1/assets/sync-from-devices"
  );
}

// ─── Alert Rules ─────────────────────────────────────────

export function fetchAlertRules(): Promise<AlertRule[]> {
  return apiGet<AlertRule[]>("/api/v1/alert-rules");
}

export function createAlertRule(
  body: CreateAlertRuleRequest
): Promise<AlertRule> {
  return apiPost<AlertRule>("/api/v1/alert-rules", body);
}

export function updateAlertRule(
  id: string,
  body: UpdateAlertRuleRequest
): Promise<AlertRule> {
  return apiPut<AlertRule>(`/api/v1/alert-rules/${id}`, body);
}

export function deleteAlertRule(id: string): Promise<void> {
  return apiDelete(`/api/v1/alert-rules/${id}`);
}

// ─── Caddy Reverse Proxy ─────────────────────────────────

export function fetchCaddyStatus(): Promise<CaddyStatus> {
  return apiGet<CaddyStatus>("/api/v1/caddy/status");
}

export function fetchCaddyProxyHosts(): Promise<CaddyProxyHost[]> {
  return apiGet<CaddyProxyHost[]>("/api/v1/caddy/proxy-hosts");
}

export function createCaddyProxyHost(
  body: CaddyProxyHostRequest
): Promise<CaddyProxyHost> {
  return apiPost<CaddyProxyHost>("/api/v1/caddy/proxy-hosts", body);
}

export function updateCaddyProxyHost(
  id: string,
  body: CaddyProxyHostRequest
): Promise<CaddyProxyHost> {
  return apiPut<CaddyProxyHost>(`/api/v1/caddy/proxy-hosts/${id}`, body);
}

export function deleteCaddyProxyHost(id: string): Promise<void> {
  return apiDelete(`/api/v1/caddy/proxy-hosts/${id}`);
}

export function toggleCaddyProxyHost(
  id: string,
  enabled: boolean
): Promise<CaddyProxyHost> {
  return apiPost<CaddyProxyHost>(`/api/v1/caddy/proxy-hosts/${id}/toggle`, {
    enabled,
  });
}

export function syncCaddyConfig(): Promise<void> {
  return apiPost<void>("/api/v1/caddy/sync");
}

export function testCaddyConnection(): Promise<
  import("./types").CaddyTestConnectionResponse
> {
  return apiPost<import("./types").CaddyTestConnectionResponse>(
    "/api/v1/caddy/test-connection"
  );
}

// ─── Unbound DNS ─────────────────────────────────────────

export function fetchUnboundDnsRecords(): Promise<UnboundDnsRecord[]> {
  return apiGet<UnboundDnsRecord[]>("/api/v1/unbound/dns-records");
}

export function createUnboundDnsRecord(
  body: UnboundDnsRecordRequest
): Promise<UnboundDnsRecord> {
  return apiPost<UnboundDnsRecord>("/api/v1/unbound/dns-records", body);
}

export function updateUnboundDnsRecord(
  id: string,
  body: UnboundDnsRecordRequest
): Promise<UnboundDnsRecord> {
  return apiPut<UnboundDnsRecord>(`/api/v1/unbound/dns-records/${id}`, body);
}

export function deleteUnboundDnsRecord(id: string): Promise<void> {
  return apiDelete(`/api/v1/unbound/dns-records/${id}`);
}

export function toggleUnboundDnsRecord(
  id: string,
  enabled: boolean
): Promise<UnboundDnsRecord> {
  return apiPost<UnboundDnsRecord>(
    `/api/v1/unbound/dns-records/${id}/toggle`,
    { enabled }
  );
}

export function testUnboundConnection(): Promise<UnboundTestConnectionResponse> {
  return apiPost<UnboundTestConnectionResponse>(
    "/api/v1/unbound/test-connection"
  );
}

// ─── DNS Query Log ──────────────────────────────────────

export function fetchDnsQueryLog(params?: {
  device_id?: string;
  domain?: string;
  client_ip?: string;
  blocked?: boolean;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}): Promise<DnsQueryLogResponse> {
  const qs = new URLSearchParams();
  if (params?.device_id) qs.set("device_id", params.device_id);
  if (params?.domain) qs.set("domain", params.domain);
  if (params?.client_ip) qs.set("client_ip", params.client_ip);
  if (params?.blocked !== undefined) qs.set("blocked", String(params.blocked));
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiGet<DnsQueryLogResponse>(`/api/v1/dns-logs${suffix}`);
}

export function fetchDnsStats(params?: {
  since?: string;
  until?: string;
  device_id?: string;
}): Promise<DnsStatsResponse> {
  const qs = new URLSearchParams();
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  if (params?.device_id) qs.set("device_id", params.device_id);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiGet<DnsStatsResponse>(`/api/v1/dns-logs/stats${suffix}`);
}

export function ingestDnsLogs(
  entries: DnsIngestEntry[]
): Promise<DnsIngestResponse> {
  return apiPost<DnsIngestResponse>("/api/v1/dns-logs/ingest", { entries });
}

export function purgeDnsLogs(): Promise<DnsPurgeResponse> {
  return apiDelete("/api/v1/dns-logs") as unknown as Promise<DnsPurgeResponse>;
}

// ─── DNS Blocklists ──────────────────────────────────────

export function fetchDnsBlocklists(): Promise<
  import("./types").DnsBlocklist[]
> {
  return apiGet<import("./types").DnsBlocklist[]>("/api/v1/dns-blocklists");
}

export function createDnsBlocklist(
  body: import("./types").DnsBlocklistRequest
): Promise<import("./types").DnsBlocklist> {
  return apiPost<import("./types").DnsBlocklist>(
    "/api/v1/dns-blocklists",
    body
  );
}

export function updateDnsBlocklist(
  id: string,
  body: import("./types").DnsBlocklistRequest
): Promise<import("./types").DnsBlocklist> {
  return apiPut<import("./types").DnsBlocklist>(
    `/api/v1/dns-blocklists/${id}`,
    body
  );
}

export function deleteDnsBlocklist(id: string): Promise<void> {
  return apiDelete(`/api/v1/dns-blocklists/${id}`);
}

export function toggleDnsBlocklist(
  id: string,
  enabled: boolean
): Promise<import("./types").DnsBlocklist> {
  return apiPost<import("./types").DnsBlocklist>(
    `/api/v1/dns-blocklists/${id}/toggle`,
    { enabled }
  );
}

export function downloadDnsBlocklist(
  id: string
): Promise<import("./types").DnsBlocklistDownloadResponse> {
  return apiPost<import("./types").DnsBlocklistDownloadResponse>(
    `/api/v1/dns-blocklists/${id}/download`
  );
}

export function fetchDnsBlocklistStats(): Promise<
  import("./types").DnsBlocklistStats
> {
  return apiGet<import("./types").DnsBlocklistStats>(
    "/api/v1/dns-blocklists/stats"
  );
}

export function fetchDnsBlocklistOverrides(): Promise<
  import("./types").DnsBlocklistDomainOverride[]
> {
  return apiGet<import("./types").DnsBlocklistDomainOverride[]>(
    "/api/v1/dns-blocklists/overrides"
  );
}

export function createDnsBlocklistOverride(
  body: import("./types").DnsBlocklistDomainOverrideRequest
): Promise<import("./types").DnsBlocklistDomainOverride> {
  return apiPost<import("./types").DnsBlocklistDomainOverride>(
    "/api/v1/dns-blocklists/overrides",
    body
  );
}

export function deleteDnsBlocklistOverride(id: string): Promise<void> {
  return apiDelete(`/api/v1/dns-blocklists/overrides/${id}`);
}

export function fetchDnsUnboundConfig(): Promise<
  import("./types").DnsUnboundConfigResponse
> {
  return apiGet<import("./types").DnsUnboundConfigResponse>(
    "/api/v1/dns-blocklists/unbound-config"
  );
}

// ─── DNS Query Log (per-device stats) ────────────────────

export function fetchDnsQueries(params?: {
  page?: number;
  per_page?: number;
  device_id?: string;
  domain?: string;
  query_type?: string;
  blocked?: boolean;
  hours?: number;
}): Promise<DnsQueriesResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.per_page) qs.set("per_page", String(params.per_page));
  if (params?.device_id) qs.set("device_id", params.device_id);
  if (params?.domain) qs.set("domain", params.domain);
  if (params?.query_type) qs.set("query_type", params.query_type);
  if (params?.blocked !== undefined) qs.set("blocked", String(params.blocked));
  if (params?.hours) qs.set("hours", String(params.hours));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiGet<DnsQueriesResponse>(`/api/v1/dns-queries${suffix}`);
}

export function fetchDnsQueryStats(hours?: number): Promise<DnsQueryStats> {
  const qs = hours ? `?hours=${hours}` : "";
  return apiGet<DnsQueryStats>(`/api/v1/dns-queries/stats${qs}`);
}

// ─── VPN Status Dashboard ────────────────────────────────────

export function fetchVpnStatus(): Promise<
  import("./types").VpnStatusResponse
> {
  return apiGet<import("./types").VpnStatusResponse>("/api/v1/vpn-status");
}

// ─── QoS / Traffic Shaping ───────────────────────────────────

export function fetchQosSummary(): Promise<
  import("./types").QosSummary
> {
  return apiGet<import("./types").QosSummary>("/api/v1/qos/summary");
}

export function fetchVyosTrafficPolicies(): Promise<
  import("./types").VyosTrafficPoliciesResponse
> {
  return apiGet<import("./types").VyosTrafficPoliciesResponse>(
    "/api/v1/qos/vyos/policies"
  );
}

export function createVyosTrafficPolicy(
  body: import("./types").CreateVyosTrafficPolicyRequest
): Promise<import("./types").VyosQosWriteResponse> {
  return apiPost<import("./types").VyosQosWriteResponse>(
    "/api/v1/qos/vyos/policies",
    body
  );
}

export function deleteVyosTrafficPolicy(
  policyType: string,
  name: string
): Promise<import("./types").VyosQosWriteResponse> {
  return apiDelete(
    `/api/v1/qos/vyos/policies/${encodeURIComponent(policyType)}/${encodeURIComponent(name)}`
  ) as unknown as Promise<import("./types").VyosQosWriteResponse>;
}

export function fetchMikrotikSimpleQueues(): Promise<
  import("./types").MikrotikSimpleQueue[]
> {
  return apiGet<import("./types").MikrotikSimpleQueue[]>(
    "/api/v1/qos/mikrotik/simple-queues"
  );
}

export function createMikrotikSimpleQueue(
  body: import("./types").MikrotikSimpleQueueRequest
): Promise<void> {
  return apiPost<void>("/api/v1/qos/mikrotik/simple-queues", body);
}

export function updateMikrotikSimpleQueue(
  id: string,
  body: import("./types").MikrotikSimpleQueueRequest
): Promise<void> {
  return apiPut<void>(
    `/api/v1/qos/mikrotik/simple-queues/${encodeURIComponent(id)}`,
    body
  );
}

export function deleteMikrotikSimpleQueue(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/qos/mikrotik/simple-queues/${encodeURIComponent(id)}`
  );
}

export function fetchMikrotikQueueTree(): Promise<
  import("./types").MikrotikQueueTree[]
> {
  return apiGet<import("./types").MikrotikQueueTree[]>(
    "/api/v1/qos/mikrotik/queue-tree"
  );
}

// ─── Dynamic DNS (DDNS) ──────────────────────────────────

export function fetchDdnsEntries(): Promise<import("./types").DdnsEntry[]> {
  return apiGet<import("./types").DdnsEntry[]>("/api/v1/ddns");
}

export function createDdnsEntry(
  body: import("./types").DdnsEntryRequest
): Promise<import("./types").DdnsEntry> {
  return apiPost<import("./types").DdnsEntry>("/api/v1/ddns", body);
}

export function updateDdnsEntry(
  id: string,
  body: import("./types").DdnsEntryRequest
): Promise<import("./types").DdnsEntry> {
  return apiPut<import("./types").DdnsEntry>(`/api/v1/ddns/${id}`, body);
}

export function deleteDdnsEntry(id: string): Promise<void> {
  return apiDelete(`/api/v1/ddns/${id}`);
}

export function toggleDdnsEntry(
  id: string,
  enabled: boolean
): Promise<import("./types").DdnsEntry> {
  return apiPost<import("./types").DdnsEntry>(`/api/v1/ddns/${id}/toggle`, {
    enabled,
  });
}

export function fetchDdnsStatus(): Promise<import("./types").DdnsStatus> {
  return apiGet<import("./types").DdnsStatus>("/api/v1/ddns/status");
}

export function fetchVyosDdnsConfig(): Promise<
  import("./types").VyosDdnsConfig
> {
  return apiGet<import("./types").VyosDdnsConfig>("/api/v1/ddns/vyos");
}

// ─── NAT / Port Forwarding ───────────────────────────────────

export function fetchNatSummary(): Promise<import("./types").NatSummary> {
  return apiGet<import("./types").NatSummary>("/api/v1/nat/summary");
}

export function fetchVyosNatRules(): Promise<
  import("./types").NatDestinationRule[]
> {
  return apiGet<import("./types").NatDestinationRule[]>(
    "/api/v1/nat/vyos/rules"
  );
}

export function createVyosNatRule(
  body: import("./types").CreateVyosNatRuleRequest
): Promise<import("./types").NatRuleResponse> {
  return apiPost<import("./types").NatRuleResponse>(
    "/api/v1/nat/vyos/rules",
    body
  );
}

export function updateVyosNatRule(
  ruleNumber: number,
  body: import("./types").UpdateVyosNatRuleRequest
): Promise<import("./types").NatRuleResponse> {
  return apiPut<import("./types").NatRuleResponse>(
    `/api/v1/nat/vyos/rules/${ruleNumber}`,
    body
  );
}

export function deleteVyosNatRule(
  ruleNumber: number
): Promise<import("./types").NatRuleResponse> {
  return apiDelete(
    `/api/v1/nat/vyos/rules/${ruleNumber}`
  ) as unknown as Promise<import("./types").NatRuleResponse>;
}

export function fetchMikrotikNatRules(): Promise<
  import("./types").MikrotikNatRuleWithId[]
> {
  return apiGet<import("./types").MikrotikNatRuleWithId[]>(
    "/api/v1/nat/mikrotik/rules"
  );
}

export function createMikrotikNatRule(
  body: import("./types").CreateMikrotikNatRuleRequest
): Promise<void> {
  return apiPost<void>("/api/v1/nat/mikrotik/rules", body);
}

export function updateMikrotikNatRule(
  id: string,
  body: import("./types").CreateMikrotikNatRuleRequest
): Promise<void> {
  return apiPut<void>(
    `/api/v1/nat/mikrotik/rules/${encodeURIComponent(id)}`,
    body
  );
}

export function deleteMikrotikNatRule(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/nat/mikrotik/rules/${encodeURIComponent(id)}`
  );
}

// ─── Mesh Topology (Xiaomi) ─────────────────────────────────

export function fetchMeshTopology(): Promise<
  import("./types").MeshTopologyResponse
> {
  return apiGet<import("./types").MeshTopologyResponse>(
    "/api/v1/mesh/topology"
  );
}

// ─── Xiaomi MiWiFi ───────────────────────────────────────

export function fetchXiaomiStatus(): Promise<
  import("./types").XiaomiStatus
> {
  return apiGet<import("./types").XiaomiStatus>("/api/v1/xiaomi/status");
}

export function fetchXiaomiTopology(): Promise<
  import("./types").XiaomiTopology
> {
  return apiGet<import("./types").XiaomiTopology>("/api/v1/xiaomi/topology");
}

export function fetchXiaomiDevices(): Promise<
  import("./types").XiaomiDevice[]
> {
  return apiGet<import("./types").XiaomiDevice[]>("/api/v1/xiaomi/devices");
}

export function fetchXiaomiNewStatus(): Promise<
  import("./types").XiaomiNewStatus
> {
  return apiGet<import("./types").XiaomiNewStatus>("/api/v1/xiaomi/new-status");
}

export function fetchXiaomiWifiDevices(): Promise<
  import("./types").XiaomiWifiDevice[]
> {
  return apiGet<import("./types").XiaomiWifiDevice[]>(
    "/api/v1/xiaomi/wifi-devices"
  );
}

export function fetchXiaomiWanInfo(): Promise<
  import("./types").XiaomiWanInfo
> {
  return apiGet<import("./types").XiaomiWanInfo>("/api/v1/xiaomi/wan-info");
}

export function fetchXiaomiLanInfo(): Promise<
  import("./types").XiaomiLanInfo
> {
  return apiGet<import("./types").XiaomiLanInfo>("/api/v1/xiaomi/lan-info");
}

export function fetchXiaomiWifiBands(): Promise<
  import("./types").XiaomiWifiBand[]
> {
  return apiGet<import("./types").XiaomiWifiBand[]>(
    "/api/v1/xiaomi/wifi-bands"
  );
}

export function fetchXiaomiFirmware(): Promise<
  import("./types").XiaomiFirmware
> {
  return apiGet<import("./types").XiaomiFirmware>("/api/v1/xiaomi/firmware");
}

// ─── Xiaomi Mesh Settings ────────────────────────────────

export function testXiaomiMeshConnection(
  ip?: string
): Promise<import("./types").XiaomiMeshTestConnectionResponse> {
  return apiPost<import("./types").XiaomiMeshTestConnectionResponse>(
    "/api/v1/xiaomi-mesh/test-connection",
    { ip }
  );
}

// ─── Cloudflare Tunnel ───────────────────────────────────────

export function fetchCloudflareTunnelStatus(): Promise<
  import("./types").CloudflareTunnelStatus
> {
  return apiGet<import("./types").CloudflareTunnelStatus>(
    "/api/v1/cloudflare-tunnel/status"
  );
}

export function fetchCloudflareTunnelRoutes(): Promise<
  import("./types").CloudflareTunnelRoutesResponse
> {
  return apiGet<import("./types").CloudflareTunnelRoutesResponse>(
    "/api/v1/cloudflare-tunnel/routes"
  );
}

export function addCloudflareTunnelRoute(
  body: import("./types").AddCloudflareRouteRequest
): Promise<import("./types").CloudflareTunnelWriteResponse> {
  return apiPost<import("./types").CloudflareTunnelWriteResponse>(
    "/api/v1/cloudflare-tunnel/routes",
    body
  );
}

export function deleteCloudflareTunnelRoute(
  hostname: string
): Promise<import("./types").CloudflareTunnelWriteResponse> {
  return apiDelete(
    `/api/v1/cloudflare-tunnel/routes/${encodeURIComponent(hostname)}`
  ) as unknown as Promise<import("./types").CloudflareTunnelWriteResponse>;
}

// ─── Tailscale ──────────────────────────────────────────────

export function fetchTailscaleStatus(): Promise<
  import("./types").TailscaleStatusResponse
> {
  return apiGet<import("./types").TailscaleStatusResponse>(
    "/api/v1/tailscale/status"
  );
}
