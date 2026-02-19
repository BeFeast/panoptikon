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
  ips: DeviceIp[];
  agent?: AgentSummary | null;
}

export interface DeviceIp {
  ip: string;
  subnet: string | null;
  is_current: boolean;
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

export interface DashboardStats {
  router: RouterStatus;
  device_count: {
    total: number;
    online: number;
  };
  bandwidth: {
    rx_bps: number;
    tx_bps: number;
  };
  alert_count: {
    total: number;
    unread: number;
  };
}

export interface RouterStatus {
  is_connected: boolean;
  version: string | null;
  uptime: string | null;
  cpu_percent: number | null;
  memory_percent: number | null;
}

export interface TopDevice {
  id: string;
  name: string | null;
  hostname: string | null;
  ip: string;
  rx_bps: number;
  tx_bps: number;
}

// ─── Auth ───────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  first_run: boolean;
}

export interface LoginResponse {
  token: string;
}
