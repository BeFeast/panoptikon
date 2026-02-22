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
  AuditLogListResponse,
  AuthStatus,
  ConfigBackup,
  ConfigBackupListResponse,
  ConfigDiffResponse,
  DashboardStats,
  DbSizeData,
  Device,
  DhcpStaticMapping,
  FirewallConfig,
  FirewallRuleRequest,
  FirewallGroups,
  LoginResponse,
  NetflowStatus,
  RouterStatus,
  SearchResponse,
  SettingsData,
  SpeedTestResult,
  TopDevice,
  TrafficHistoryPoint,
  VyosDhcpLease,
  VyosInterface,
  VyosRoute,
  VyosWriteResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include", // always send session cookie (HttpOnly, set by server)
    ...init,
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
    // Try to extract server error message from JSON body
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // body wasn't JSON — keep statusText
    }
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  // 204 No Content — return empty object, don't try to parse JSON
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as unknown as T;
  }
  return res.json();
}

// ─── Generic CRUD ───────────────────────────────────────

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
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

export function fetchDashboardStats(): Promise<DashboardStats> {
  return apiGet<DashboardStats>("/api/v1/dashboard/stats");
}

export function fetchRecentAlerts(limit = 5): Promise<Alert[]> {
  return apiGet<Alert[]>(`/api/v1/alerts?limit=${limit}`);
}

export function fetchTopDevices(limit = 5): Promise<TopDevice[]> {
  return apiGet<TopDevice[]>(`/api/v1/dashboard/top-devices?limit=${limit}`);
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
  return apiGet<TrafficHistoryPoint[]>(`/api/v1/traffic/history?minutes=${minutes}`);
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

export function deleteDhcpStaticMapping(
  network: string,
  subnet: string,
  name: string
): Promise<VyosWriteResponse> {
  return apiDelete(
    `/api/v1/vyos/dhcp/static-mappings/${encodeURIComponent(network)}/${encodeURIComponent(subnet)}/${encodeURIComponent(name)}`
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
