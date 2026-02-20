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
  agent?: AgentSummary | null;
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
  latency_ms: number;
  tested_at: string;
}

export interface SettingsData {
  webhook_url: string | null;
  vyos_url: string | null;
  vyos_api_key_set: boolean;
}

// ─── Auth ───────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  needs_setup: boolean;
}

export interface LoginResponse {
  message: string;
}
