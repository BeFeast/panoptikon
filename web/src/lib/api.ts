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
  AuthStatus,
  DashboardStats,
  Device,
  LoginResponse,
  TopDevice,
  TrafficHistoryPoint,
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
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
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

export function fetchAlerts(limit = 50): Promise<Alert[]> {
  return apiGet<Alert[]>(`/api/v1/alerts?limit=${limit}`);
}

export function markAlertRead(id: string): Promise<void> {
  return apiPost<void>(`/api/v1/alerts/${id}/read`);
}

// ─── Devices ────────────────────────────────────────────

export function fetchDevices(): Promise<Device[]> {
  return apiGet<Device[]>("/api/v1/devices");
}

export function fetchDevice(id: string): Promise<Device> {
  return apiGet<Device>(`/api/v1/devices/${id}`);
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

export function setupPassword(password: string): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/v1/auth/login", { password });
}
