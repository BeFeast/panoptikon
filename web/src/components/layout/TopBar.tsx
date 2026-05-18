"use client";

/* eslint-disable react/jsx-no-comment-textnodes */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell, ChevronRight, RefreshCw, Settings } from "lucide-react";
import { fetchDashboardStats, fetchRecentAlerts, markAllAlertsRead, deleteAllAlerts } from "@/lib/api";
import { useWsEvent } from "@/lib/ws";
import { useWsConnected } from "@/components/providers/WebSocketProvider";
import { StatusDot } from "@/components/mesh/StatusDot";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";

/**
 * Literal port of shell.jsx `function TopBar(...)` (lines 198-262).
 *
 *   <header style={{ height: 52, ..., background: 'var(--surface-1)' }}>
 *     breadcrumbs (chevron-right separators, last segment text+500w, prior text-mute+400w)
 *     live · ws · {Nms} pill (StatusDot online pulse + mono 11)
 *     btn btn-ghost 28x28 refresh
 *     btn btn-ghost 28x28 bell — status-offline 7x7 dot top-right
 *     btn btn-ghost 28x28 settings
 *
 * Conflict-resolved tokens (shadcn already owns these HSL vars at :root):
 *   var(--border)          → literal rgba(96,144,212,0.20)
 *   var(--primary)         → literal #2563eb  (not used here)
 *   var(--status-offline)  → literal #fb7185
 */
export function TopBar({ mobileMenu }: { mobileMenu?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const wsConnected = useWsConnected();
  const breadcrumbs = useMemo(() => breadcrumbFromPath(pathname || ""), [pathname]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // /version ping for the "live · ws · Nms" pill latency.
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      const started = performance.now();
      try {
        await fetch("/api/v1/version", { credentials: "include", cache: "no-store" });
        if (!cancelled) setLatencyMs(Math.round(performance.now() - started));
      } catch {
        if (!cancelled) setLatencyMs(null);
      }
    }
    void ping();
    const id = setInterval(ping, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── Bell flyout state (production extension; shell.jsx is icon-only at rest) ──
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  const refreshAlerts = useCallback(async () => {
    try {
      const [statsData, alertsData] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentAlerts(5),
      ]);
      setUnreadCount(statsData.alerts_unread);
      setAlerts(alertsData);
    } catch {
      /* topbar must not break the app */
    }
  }, []);

  useEffect(() => {
    refreshAlerts();
    const id = setInterval(refreshAlerts, 30_000);
    return () => clearInterval(id);
  }, [refreshAlerts]);

  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
    wsDebounceRef.current = setTimeout(() => {
      refreshAlerts();
      wsDebounceRef.current = null;
    }, 2_000);
  }, [refreshAlerts]);

  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_offline"],
    debouncedRefresh,
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleMarkAllRead() {
    try {
      await markAllAlertsRead();
      setUnreadCount(0);
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    } catch {
      /* ignore */
    }
  }
  async function handleClearAll() {
    try {
      await deleteAllAlerts();
      setUnreadCount(0);
      setAlerts([]);
    } catch {
      /* ignore */
    }
  }
  function handleRefresh() {
    void refreshAlerts();
    router.refresh();
  }

  return (
    <header
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 14,
        borderBottom: "1px solid rgba(96,144,212,0.20)",
        background: "var(--surface-1)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {mobileMenu}

      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        {breadcrumbs.map((b, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i > 0 && (
              <ChevronRight
                size={11}
                color="var(--text-faint)"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              />
            )}
            <span
              style={{
                font: `${i === breadcrumbs.length - 1 ? 500 : 400} 13px var(--font-sans)`,
                color: i === breadcrumbs.length - 1 ? "var(--text)" : "var(--text-mute)",
                whiteSpace: "nowrap",
              }}
            >
              {b}
            </span>
          </span>
        ))}
      </div>

      {/* Live status pill */}
      <div
        data-testid="live-status-pill"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          height: 24,
          background: "var(--surface-2)",
          border: "1px solid rgba(96,144,212,0.20)",
          borderRadius: "var(--radius-pill)",
          font: "500 11px var(--font-mono)",
          color: "var(--text-dim)",
          flexShrink: 0,
        }}
      >
        <StatusDot status={wsConnected ? "online" : "offline"} pulse={wsConnected} size={6} />
        <span>live · ws</span>
        <span style={{ color: "var(--text-faint)" }}>·</span>
        <span style={{ color: "var(--text-mute)" }}>
          {latencyMs == null ? "—" : `${latencyMs}ms`}
        </span>
      </div>

      {/* Action buttons */}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: 28, height: 28, padding: 0 }}
        onClick={handleRefresh}
        aria-label="Reload"
      >
        <RefreshCw size={14} aria-hidden="true" />
      </button>

      <div ref={bellRef} style={{ position: "relative" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: 28, height: 28, padding: 0, position: "relative" }}
          onClick={() => setBellOpen((v) => !v)}
          aria-label="Notifications"
        >
          <Bell size={14} aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 4,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#fb7185",
                border: "2px solid var(--surface-1)",
              }}
            />
          )}
        </button>

        {bellOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              marginTop: 4,
              width: 320,
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-pop)",
              zIndex: 50,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderBottom: "1px solid rgba(96,144,212,0.20)",
                font: "600 13px var(--font-sans)",
                color: "var(--text)",
              }}
            >
              <span>Notifications</span>
              <span style={{ display: "flex", gap: 12 }}>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    style={{
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      font: "400 11px var(--font-sans)",
                      color: "var(--accent-cyan)",
                      cursor: "pointer",
                    }}
                  >
                    Mark all read
                  </button>
                )}
                {alerts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    style={{
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      font: "400 11px var(--font-sans)",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                    }}
                  >
                    Clear all
                  </button>
                )}
              </span>
            </div>
            <div style={{ maxHeight: 288, overflowY: "auto" }}>
              {alerts.length === 0 ? (
                <div
                  style={{
                    padding: "20px 14px",
                    textAlign: "center",
                    font: "400 12px var(--font-sans)",
                    color: "var(--text-mute)",
                  }}
                >
                  No recent alerts
                </div>
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setBellOpen(false);
                      router.push("/alerts");
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      width: "100%",
                      padding: "10px 14px",
                      textAlign: "left",
                      background: a.is_read ? "transparent" : "var(--surface-2)",
                      border: 0,
                      borderBottom: "1px solid rgba(96,144,212,0.20)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        font: "500 10px var(--font-mono)",
                        color: severityColor(a.severity),
                      }}
                    >
                      {!a.is_read && (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--accent-cyan)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span>{a.severity}</span>
                      <span style={{ marginLeft: "auto", color: "var(--text-mute)" }}>
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                    <span
                      style={{
                        font: "400 12px var(--font-sans)",
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.message}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setBellOpen(false);
                router.push("/alerts");
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                borderTop: "1px solid rgba(96,144,212,0.20)",
                background: "transparent",
                border: 0,
                font: "400 12px var(--font-sans)",
                color: "var(--accent-cyan)",
                cursor: "pointer",
              }}
            >
              View all alerts
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: 28, height: 28, padding: 0 }}
        onClick={() => router.push("/settings")}
        aria-label="Settings"
      >
        <Settings size={14} aria-hidden="true" />
      </button>
    </header>
  );
}

function severityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "#fb7185";
    case "WARNING":
      return "#fbbf24";
    case "INFO":
      return "#38bdf8";
    default:
      return "var(--text-dim)";
  }
}

// Realm root (core.lan) is fixed in the render. This helper returns just the
// route-derived trail per shell.jsx breadcrumb pattern.
const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  alerts: "Alerts",
  "audit-log": "Audit log",
  devices: "Devices",
  assets: "Assets",
  topology: "Topology",
  mesh: "Mesh",
  traffic: "Traffic",
  qos: "QoS",
  nat: "NAT",
  router: "Router",
  mikrotik: "MikroTik",
  pfsense: "pfSense",
  xiaomi: "Xiaomi",
  caddy: "Caddy",
  services: "Services",
  "vpn-status": "VPN status",
  ddns: "DDNS",
  "dns-logs": "DNS logs",
  "dns-queries": "DNS queries",
  certificates: "Certificates",
  "cloudflare-tunnel": "Cloudflare tunnel",
  agents: "Agents",
  "ssh-hosts": "SSH hosts",
  settings: "Settings",
  "alert-rules": "Alert rules",
  "config-backup": "Config backup",
  "dns-blocklists": "DNS blocklists",
  "dns-security": "DNS security",
  email: "Email",
  password: "Password",
  retention: "Retention",
  scanner: "Scanner",
  snmp: "SNMP",
  speedtest: "Speed test",
  tailscale: "Tailscale",
  users: "Users",
  webhook: "Webhook",
  "xiaomi-mesh": "Xiaomi mesh",
  advanced: "Advanced",
  detail: "Detail",
  npm: "NPM",
};

function breadcrumbFromPath(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  const trail = segments.map((seg) => BREADCRUMB_LABELS[seg] ?? seg);
  return ["core.lan", ...trail];
}
