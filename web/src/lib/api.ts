/**
 * API client for Panoptikon server.
 *
 * Wraps fetch() with base URL handling, auth headers, and JSON parsing.
 */

import type {
  Agent,
  AgentCreateResponse,
  AgentReport,
  FastfetchInfo,
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
  CriticalDevice,
  DashboardStats,
  DbSizeData,
  Device,
  DeviceSysinfo,
  DeviceTrafficPoint,
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
  SearchResponse,
  SettingsData,
  SpeedTestResult,
  SpeedTestHistoryResponse,
  TopDevice,
  TrafficHistoryPoint,
  UnboundDnsRecord,
  UnboundDnsRecordRequest,
  UnboundTestConnectionResponse,
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
  MikrotikDhcpStaticMappingRequest,
  MikrotikFirewall,
  MikrotikFirewallFilterRequest,
  MikrotikFirewallNatRequest,
  MikrotikAddressListRequest,
  MikrotikDns,
  MikrotikWireguard,
  MikrotikMangleRule,
  MikrotikMangleRequest,
  MikrotikRoutingRule,
  MikrotikRoutingRuleRequest,
  MikrotikRoutingTable,
  MikrotikNetwatchEntry,
  MikrotikNetwatchRequest,
  MikrotikDynamicRouting,
  MikrotikIpv6Nd,
  PfsenseStatus,
  PfsenseInterface,
  PfsenseFirewallRule,
  PfsenseNatRule,
  PfsenseAlias,
  PfsenseDhcpLease,
  PfsenseDhcpStaticMapping,
  PfsenseGateway,
  PfsenseRoute,
  PfsenseDnsConfig,
  PfsenseDnsOverride,
  PfsenseConfigSnapshot,
  PfsenseConfigDiff,
  PfsenseAuditEntry,
  PfsenseService,
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
  User,
  CreateUserRequest,
  UpdateUserRequest,
  SnmpStatus,
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
        if (body?.message) detail = body.message;
        else if (body?.error) detail = body.error;
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

const DASHBOARD_TIMEOUT_MS = 3_000;

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

export function fetchCriticalDevices(): Promise<CriticalDevice[]> {
  return apiGet<CriticalDevice[]>("/api/v1/dashboard/critical-devices", {
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

export function fetchPortScan(id: string): Promise<PortScanResult | null> {
  return apiGet<PortScanResult | null>(`/api/v1/devices/${id}/scan`);
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
  is_critical?: boolean;
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

// ─── Device Identification ──────────────────────────────

export interface IdentifyResult {
  devices_checked: number;
}

export function identifyDevices(): Promise<IdentifyResult> {
  return apiPost<IdentifyResult>("/api/v1/devices/identify");
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

export function fetchAgentFastfetch(id: string): Promise<FastfetchInfo | null> {
  return apiGet<FastfetchInfo | null>(`/api/v1/agents/${id}/fastfetch`);
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
}): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/v1/setup", body);
}

// ─── Speed Test ─────────────────────────────────────────

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

// ─── Search ─────────────────────────────────────────────

export function searchAll(q: string): Promise<SearchResponse> {
  return apiGet<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`);
}

// ─── NetFlow ────────────────────────────────────────────

export function fetchNetflowStatus(): Promise<NetflowStatus> {
  return apiGet<NetflowStatus>("/api/v1/settings/netflow-status");
}

// ─── Settings ───────────────────────────────────────────

export function fetchSettings(): Promise<SettingsData> {
  return apiGet<SettingsData>("/api/v1/settings");
}

export function updateSettings(body: {
  webhook_url?: string;
  scan_interval_seconds?: number;
  scan_subnets?: string;
  ping_sweep_enabled?: boolean;
  nmap_scan_enabled?: boolean;
  netbios_scan_enabled?: boolean;
  snmp_scan_enabled?: boolean;
  http_fingerprint_enabled?: boolean;
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

export function testMikrotikConnection(
  url?: string,
  user?: string,
  password?: string
): Promise<MikrotikStatus> {
  return apiPost<MikrotikStatus>("/api/v1/mikrotik/test-connection", {
    url,
    user,
    password,
  });
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

export function createMikrotikDhcpStaticMapping(
  body: MikrotikDhcpStaticMappingRequest
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/dhcp-static-mappings", body);
}

export function deleteMikrotikDhcpLease(id: string): Promise<void> {
  return apiDelete(`/api/v1/mikrotik/dhcp-leases/${encodeURIComponent(id)}`);
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

// ─── MikroTik Advanced Routing ────────────────────────────

export function fetchMikrotikMangleRules(): Promise<MikrotikMangleRule[]> {
  return apiGet<MikrotikMangleRule[]>("/api/v1/mikrotik/routing/mangle");
}

export function createMikrotikMangleRule(
  body: MikrotikMangleRequest,
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/routing/mangle", body);
}

export function deleteMikrotikMangleRule(id: string): Promise<void> {
  return apiDelete(`/api/v1/mikrotik/routing/mangle/${encodeURIComponent(id)}`);
}

export function fetchMikrotikRoutingRules(): Promise<MikrotikRoutingRule[]> {
  return apiGet<MikrotikRoutingRule[]>("/api/v1/mikrotik/routing/rules");
}

export function createMikrotikRoutingRule(
  body: MikrotikRoutingRuleRequest,
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/routing/rules", body);
}

export function deleteMikrotikRoutingRule(id: string): Promise<void> {
  return apiDelete(`/api/v1/mikrotik/routing/rules/${encodeURIComponent(id)}`);
}

export function fetchMikrotikRoutingTables(): Promise<MikrotikRoutingTable[]> {
  return apiGet<MikrotikRoutingTable[]>("/api/v1/mikrotik/routing/tables");
}

export function fetchMikrotikNetwatch(): Promise<MikrotikNetwatchEntry[]> {
  return apiGet<MikrotikNetwatchEntry[]>("/api/v1/mikrotik/routing/netwatch");
}

export function createMikrotikNetwatch(
  body: MikrotikNetwatchRequest,
): Promise<void> {
  return apiPost<void>("/api/v1/mikrotik/routing/netwatch", body);
}

export function deleteMikrotikNetwatch(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/mikrotik/routing/netwatch/${encodeURIComponent(id)}`,
  );
}

export function fetchMikrotikDynamicRouting(): Promise<MikrotikDynamicRouting> {
  return apiGet<MikrotikDynamicRouting>("/api/v1/mikrotik/routing/dynamic");
}

export function fetchMikrotikIpv6Nd(): Promise<MikrotikIpv6Nd[]> {
  return apiGet<MikrotikIpv6Nd[]>("/api/v1/mikrotik/routing/ipv6-nd");
}

// ─── pfSense ──────────────────────────────────────────────

export function fetchPfsenseStatus(): Promise<PfsenseStatus> {
  return apiGet<PfsenseStatus>("/api/v1/pfsense/status");
}

export function testPfsenseConnection(
  host?: string,
  port?: number,
  username?: string,
  auth_type?: string,
  password?: string,
  private_key?: string,
): Promise<PfsenseStatus> {
  return apiPost<PfsenseStatus>("/api/v1/pfsense/test-connection", {
    host,
    port,
    username,
    auth_type,
    password,
    private_key,
  });
}

export function fetchPfsenseInterfaces(): Promise<PfsenseInterface[]> {
  return apiGet<PfsenseInterface[]>("/api/v1/pfsense/interfaces");
}

export function togglePfsenseInterface(id: string): Promise<void> {
  return apiPost<void>(
    `/api/v1/pfsense/interfaces/${encodeURIComponent(id)}/toggle`,
  );
}

export function fetchPfsenseGateways(): Promise<PfsenseGateway[]> {
  return apiGet<PfsenseGateway[]>("/api/v1/pfsense/gateways");
}

export function fetchPfsenseRoutes(): Promise<PfsenseRoute[]> {
  return apiGet<PfsenseRoute[]>("/api/v1/pfsense/routes");
}

export function createPfsenseRoute(body: {
  network: string;
  gateway: string;
}): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/routes", body);
}

export function deletePfsenseRoute(id: string): Promise<void> {
  return apiDelete(`/api/v1/pfsense/routes/${encodeURIComponent(id)}`);
}

export function fetchPfsenseDhcpLeases(): Promise<PfsenseDhcpLease[]> {
  return apiGet<PfsenseDhcpLease[]>("/api/v1/pfsense/dhcp/leases");
}

export function fetchPfsenseDhcpStaticMappings(): Promise<
  PfsenseDhcpStaticMapping[]
> {
  return apiGet<PfsenseDhcpStaticMapping[]>(
    "/api/v1/pfsense/dhcp/static-mappings",
  );
}

export function createPfsenseDhcpStaticMapping(body: {
  mac: string;
  ip: string;
  hostname?: string;
  description?: string;
  interface: string;
}): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/dhcp/static-mappings", body);
}

export function deletePfsenseDhcpStaticMapping(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/pfsense/dhcp/static-mappings/${encodeURIComponent(id)}`,
  );
}

export function fetchPfsenseFirewallRules(): Promise<PfsenseFirewallRule[]> {
  return apiGet<PfsenseFirewallRule[]>("/api/v1/pfsense/firewall/rules");
}

export function createPfsenseFirewallRule(
  body: Omit<PfsenseFirewallRule, "id" | "tracker">,
): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/firewall/rules", body);
}

export function updatePfsenseFirewallRule(
  id: string,
  body: Partial<Omit<PfsenseFirewallRule, "id" | "tracker">>,
): Promise<void> {
  return apiPut<void>(
    `/api/v1/pfsense/firewall/rules/${encodeURIComponent(id)}`,
    body,
  );
}

export function deletePfsenseFirewallRule(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/pfsense/firewall/rules/${encodeURIComponent(id)}`,
  );
}

export function togglePfsenseFirewallRule(
  id: string,
  disabled: boolean,
): Promise<void> {
  return apiPost<void>(
    `/api/v1/pfsense/firewall/rules/${encodeURIComponent(id)}/toggle`,
    { disabled },
  );
}

export function fetchPfsenseNatRules(): Promise<PfsenseNatRule[]> {
  return apiGet<PfsenseNatRule[]>("/api/v1/pfsense/nat/rules");
}

export function createPfsenseNatRule(
  body: Omit<PfsenseNatRule, "id">,
): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/nat/rules", body);
}

export function updatePfsenseNatRule(
  id: string,
  body: Partial<Omit<PfsenseNatRule, "id">>,
): Promise<void> {
  return apiPut<void>(
    `/api/v1/pfsense/nat/rules/${encodeURIComponent(id)}`,
    body,
  );
}

export function deletePfsenseNatRule(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/pfsense/nat/rules/${encodeURIComponent(id)}`,
  );
}

export function fetchPfsenseAliases(): Promise<PfsenseAlias[]> {
  return apiGet<PfsenseAlias[]>("/api/v1/pfsense/aliases");
}

export function createPfsenseAlias(
  body: Omit<PfsenseAlias, "detail">,
): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/aliases", body);
}

export function updatePfsenseAlias(
  id: string,
  body: Partial<PfsenseAlias>,
): Promise<void> {
  return apiPut<void>(
    `/api/v1/pfsense/aliases/${encodeURIComponent(id)}`,
    body,
  );
}

export function deletePfsenseAlias(id: string): Promise<void> {
  return apiDelete(`/api/v1/pfsense/aliases/${encodeURIComponent(id)}`);
}

export function fetchPfsenseDnsConfig(): Promise<PfsenseDnsConfig> {
  return apiGet<PfsenseDnsConfig>("/api/v1/pfsense/dns/config");
}

export function fetchPfsenseDnsOverrides(): Promise<PfsenseDnsOverride[]> {
  return apiGet<PfsenseDnsOverride[]>("/api/v1/pfsense/dns/overrides");
}

export function createPfsenseDnsOverride(body: {
  host: string;
  domain: string;
  ip: string;
  description?: string;
}): Promise<void> {
  return apiPost<void>("/api/v1/pfsense/dns/overrides", body);
}

export function deletePfsenseDnsOverride(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/pfsense/dns/overrides/${encodeURIComponent(id)}`,
  );
}

export function fetchPfsenseConfigBackups(): Promise<PfsenseConfigSnapshot[]> {
  return apiGet<PfsenseConfigSnapshot[]>("/api/v1/pfsense/config-backups");
}

export function createPfsenseConfigBackup(body?: {
  description?: string;
}): Promise<PfsenseConfigSnapshot> {
  return apiPost<PfsenseConfigSnapshot>(
    "/api/v1/pfsense/config-backups",
    body ?? {},
  );
}

export function fetchPfsenseConfigCurrent(): Promise<string> {
  return apiGet<string>("/api/v1/pfsense/config-backups/current");
}

export function fetchPfsenseConfigDiff(
  id: string,
): Promise<PfsenseConfigDiff> {
  return apiGet<PfsenseConfigDiff>(
    `/api/v1/pfsense/config-backups/${encodeURIComponent(id)}/diff`,
  );
}

export function restorePfsenseConfigBackup(id: string): Promise<void> {
  return apiPost<void>(
    `/api/v1/pfsense/config-backups/${encodeURIComponent(id)}/restore`,
    {},
  );
}

export function fetchPfsenseAudit(): Promise<PfsenseAuditEntry[]> {
  return apiGet<PfsenseAuditEntry[]>("/api/v1/pfsense/audit");
}

export function fetchPfsenseServices(): Promise<PfsenseService[]> {
  return apiGet<PfsenseService[]>("/api/v1/pfsense/services");
}

export function pfsenseServiceAction(
  name: string,
  action: "start" | "stop" | "restart",
): Promise<void> {
  return apiPost<void>(
    `/api/v1/pfsense/services/${encodeURIComponent(name)}/action`,
    { action },
  );
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

export function createMikrotikQueueTree(
  body: import("./types").MikrotikQueueTreeRequest
): Promise<void> {
  return apiPost<void>("/api/v1/qos/mikrotik/queue-tree", body);
}

export function updateMikrotikQueueTree(
  id: string,
  body: import("./types").MikrotikQueueTreeRequest
): Promise<void> {
  return apiPut<void>(
    `/api/v1/qos/mikrotik/queue-tree/${encodeURIComponent(id)}`,
    body
  );
}

export function deleteMikrotikQueueTree(id: string): Promise<void> {
  return apiDelete(
    `/api/v1/qos/mikrotik/queue-tree/${encodeURIComponent(id)}`
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

// ─── DNS Security (DoT + DNSSEC) ─────────────────────────────

export function fetchDnsSecurity(): Promise<
  import("./types").DnsSecuritySettings
> {
  return apiGet<import("./types").DnsSecuritySettings>(
    "/api/v1/dns-security"
  );
}

export function updateDnsSecurity(
  body: import("./types").DnsSecurityUpdateRequest
): Promise<import("./types").DnsSecuritySettings> {
  return apiPatch<import("./types").DnsSecuritySettings>(
    "/api/v1/dns-security",
    body
  );
}

// ─── NAT / Port Forwarding ───────────────────────────────────

export function fetchNatSummary(): Promise<import("./types").NatSummary> {
  return apiGet<import("./types").NatSummary>("/api/v1/nat/summary");
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

export function updateCloudflareTunnelRoute(
  oldHostname: string,
  body: import("./types").UpdateCloudflareRouteRequest
): Promise<import("./types").CloudflareTunnelWriteResponse> {
  return apiPut<import("./types").CloudflareTunnelWriteResponse>(
    `/api/v1/cloudflare-tunnel/routes/${encodeURIComponent(oldHostname)}`,
    body
  );
}

// ─── Tailscale ──────────────────────────────────────────────

export function fetchTailscaleStatus(): Promise<
  import("./types").TailscaleStatusResponse
> {
  return apiGet<import("./types").TailscaleStatusResponse>(
    "/api/v1/tailscale/status"
  );
}

// ─── Device Resolution ──────────────────────────────────────

/** Trigger device identity resolution from DHCP/router sources. */
export function resolveDevices(): Promise<
  import("./types").ResolveResult
> {
  return apiPost<import("./types").ResolveResult>(
    "/api/v1/devices/resolve"
  );
}

// ─── Network Scanner ────────────────────────────────────────

/** Trigger a full network scan and return summary. */
export function triggerNetworkScan(): Promise<
  import("./types").ScanSummary
> {
  return apiPost<import("./types").ScanSummary>(
    "/api/v1/scanner/trigger"
  );
}

// ─── Users (RBAC) ───────────────────────────────────────────

export function fetchUsers(): Promise<User[]> {
  return apiGet<User[]>("/api/v1/users");
}

export function createUser(data: CreateUserRequest): Promise<User> {
  return apiPost<User>("/api/v1/users", data);
}

export function updateUser(id: string, data: UpdateUserRequest): Promise<User> {
  return apiPut<User>(`/api/v1/users/${id}`, data);
}

export function deleteUser(id: string): Promise<void> {
  return apiDelete(`/api/v1/users/${id}`);
}

// ─── SNMP Management ────────────────────────────────────────

export function fetchSnmpConfig(): Promise<SnmpStatus> {
  return apiGet<SnmpStatus>("/api/v1/snmp/config");
}

export function updateSnmpConfig(data: Partial<import("./types").SnmpConfig>): Promise<SnmpStatus> {
  return apiPatch<SnmpStatus>("/api/v1/snmp/config", data);
}

// ─── Email (SMTP) ───────────────────────────────────────────

export function testEmail(): Promise<void> {
  return apiPost<void>("/api/v1/settings/test-email");
}
