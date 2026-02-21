"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  MonitorSmartphone,
  Router,
  Shield,
  Wifi,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchDashboardStats,
  fetchRecentAlerts,
  fetchTopDevices,
  fetchTrafficHistory,
  fetchDevices,
} from "@/lib/api";
import type { Alert, DashboardStats, TopDevice, TrafficHistoryPoint, Device } from "@/lib/types";
import { formatBps, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { getDeviceIcon } from "@/lib/device-icons";
import type { DeviceType } from "@/lib/device-type";

// ─── Format ISO minute string to HH:mm ─────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// ─── Alert severity → color mapping ────────────────────

function severityDotColor(severity: Alert["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-rose-500";
    case "WARNING":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}

// ─── Health Ring SVG ───────────────────────────────────

function HealthRing({ online, total }: { online: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((online / total) * 100);
  const circumference = 2 * Math.PI * 40; // r=40
  const offset = circumference - (pct / 100) * circumference;
  const color =
    pct >= 90 ? "stroke-emerald-500" : pct >= 70 ? "stroke-amber-500" : "stroke-rose-500";
  const bgColor =
    pct >= 90
      ? "text-emerald-500/10"
      : pct >= 70
        ? "text-amber-500/10"
        : "text-rose-500/10";
  const textColor =
    pct >= 90 ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="8"
            className={`${bgColor} stroke-current`}
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${color} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold tabular-nums ${textColor}`}>
            {pct}%
          </span>
        </div>
      </div>
      <span className="text-xs text-slate-500">
        {online}/{total} online
      </span>
    </div>
  );
}

// ─── Status dot ─────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "offline" | "warning" }) {
  const colors = {
    online: "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online",
    offline: "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline",
    warning: "bg-amber-400 ring-2 ring-amber-400/30",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`}
    />
  );
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon,
  status,
  href,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  status: "online" | "offline" | "warning";
  href?: string;
}) {
  const inner = (
    <Card className="border-slate-800 bg-slate-900 transition-all hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-blue-500/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-slate-500">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ─── Loading skeleton for stat cards ────────────────────

function StatCardSkeleton() {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

// ─── Derive display values from flat stats ──────────────

function routerStatusLabel(s: DashboardStats): { label: string; status: "online" | "offline" | "warning" } {
  switch (s.router_status) {
    case "connected":
    case "online":
      return { label: "Online", status: "online" };
    case "unconfigured":
      return { label: "Unconfigured", status: "warning" };
    default:
      return { label: "Offline", status: "offline" };
  }
}

// ─── Device breakdown bar colors ────────────────────────

const TYPE_COLORS: Record<string, string> = {
  router: "bg-blue-500",
  laptop: "bg-violet-500",
  desktop: "bg-indigo-500",
  phone: "bg-emerald-500",
  tablet: "bg-teal-500",
  tv: "bg-pink-500",
  server: "bg-cyan-500",
  printer: "bg-orange-500",
  iot: "bg-amber-500",
  gaming: "bg-red-500",
  unknown: "bg-slate-500",
};

// ─── Page ───────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [topDevices, setTopDevices] = useState<TopDevice[] | null>(null);
  const [trafficHistory, setTrafficHistory] = useState<TrafficHistoryPoint[]>([]);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a, d, th, devs] = await Promise.all([
        fetchDashboardStats(),
        fetchRecentAlerts(5),
        fetchTopDevices(5),
        fetchTrafficHistory(60),
        fetchDevices(),
      ]);
      setStats(s);
      setAlerts(Array.isArray(a) ? a : []);
      setTopDevices(Array.isArray(d) ? d : []);
      setTrafficHistory(th);
      setDevices(Array.isArray(devs) ? devs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_online", "agent_offline"],
    load
  );

  // ── Compute device type breakdown ──────────────────────
  const deviceBreakdown: { type: DeviceType; label: string; count: number }[] = [];
  if (devices) {
    const counts = new Map<DeviceType, number>();
    for (const dev of devices) {
      const { type } = getDeviceIcon(dev.vendor, dev.hostname, dev.mdns_services);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      const { label } = getDeviceIcon(type, null, null);
      // Use label from a dummy call — but we can use the LABEL_MAP via getDeviceIcon
      deviceBreakdown.push({ type, label: getCategoryLabel(type), count });
    }
    deviceBreakdown.sort((a, b) => b.count - a.count);
  }

  const maxCount = deviceBreakdown.length > 0 ? Math.max(...deviceBreakdown.map((d) => d.count)) : 1;

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>

      {/* ── Bento Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ── Health Score Ring ─────────────────────────── */}
        <Card className="border-slate-800 bg-slate-900 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-4">
            {stats ? (
              <HealthRing online={stats.devices_online} total={stats.devices_total} />
            ) : (
              <Skeleton className="h-28 w-28 rounded-full" />
            )}
          </CardContent>
        </Card>

        {/* ── Stat Cards Row ───────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4 lg:grid-cols-4">
          {stats ? (
            <>
              <StatCard
                title="Router Status"
                href="/router"
                value={routerStatusLabel(stats).label}
                subtitle={
                  stats.router_status === "connected" || stats.router_status === "online"
                    ? "Connected to router"
                    : stats.router_status === "unconfigured"
                      ? "Router not configured"
                      : "Cannot reach router"
                }
                icon={<Router className="h-4 w-4" />}
                status={routerStatusLabel(stats).status}
              />
              <StatCard
                title="Active Devices"
                href="/devices"
                value={String(stats.devices_online)}
                subtitle={`${stats.devices_total} total known`}
                icon={<MonitorSmartphone className="h-4 w-4" />}
                status="online"
              />
              <StatCard
                title="WAN Bandwidth"
                href="/traffic"
                value={`↓ ${formatBps(stats.wan_rx_bps)}`}
                subtitle={`↑ ${formatBps(stats.wan_tx_bps)}`}
                icon={<Activity className="h-4 w-4" />}
                status="online"
              />
              <StatCard
                title="Unread Alerts"
                href="/alerts"
                value={String(stats.alerts_unread)}
                subtitle={stats.alerts_unread > 0 ? "Needs attention" : "All clear"}
                icon={<AlertTriangle className="h-4 w-4" />}
                status={stats.alerts_unread > 0 ? "warning" : "online"}
              />
            </>
          ) : (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          )}
        </div>

        {/* ── WAN Traffic Chart (wide) ─────────────────── */}
        <Card className="border-slate-800 bg-slate-900 lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-sm font-medium text-slate-400">
                WAN Traffic — Last 60 min
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {trafficHistory.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficHistory}>
                    <defs>
                      <linearGradient id="dashRx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="dashTx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="minute"
                      tickFormatter={formatTime}
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      stroke="#1e293b"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatBps(v)}
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      stroke="#1e293b"
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "6px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                      labelFormatter={formatTime}
                      formatter={(value: number, name: string) => [
                        formatBps(value),
                        name === "rx_bps" ? "↓ Inbound" : "↑ Outbound",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="rx_bps"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#dashRx)"
                      dot={false}
                      name="rx_bps"
                    />
                    <Area
                      type="monotone"
                      dataKey="tx_bps"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#dashTx)"
                      dot={false}
                      name="tx_bps"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-sm text-slate-600">No traffic data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Alert Feed ───────────────────────────────── */}
        <Card className="border-slate-800 bg-slate-900 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-400">
                Recent Alerts
              </CardTitle>
              <Link
                href="/alerts"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {alerts === null ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-2.5 w-2.5 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-600">
                No recent alerts — all clear.
              </p>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${
                      !alert.is_read ? "bg-blue-500/5" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${severityDotColor(alert.severity)}`}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-300">
                      {alert.message}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-slate-600">
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Device Type Breakdown ────────────────────── */}
        <Card className="border-slate-800 bg-slate-900 lg:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-400">
                Device Breakdown
              </CardTitle>
              <Link
                href="/devices"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {devices === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : deviceBreakdown.length === 0 ? (
              <p className="text-sm text-slate-600">No devices found.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {deviceBreakdown.map((item) => {
                  const Icon = getDeviceIcon(item.type, null, null).icon;
                  return (
                    <div key={item.type} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="w-16 shrink-0 text-sm text-slate-300">
                        {item.label}
                      </span>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${TYPE_COLORS[item.type] ?? "bg-slate-500"} transition-all duration-500`}
                            style={{
                              width: `${(item.count / maxCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums text-slate-500">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Category label helper ──────────────────────────────

function getCategoryLabel(type: DeviceType): string {
  const labels: Record<DeviceType, string> = {
    router: "Routers",
    laptop: "Laptops",
    desktop: "Desktops",
    phone: "Phones",
    tablet: "Tablets",
    tv: "TVs",
    server: "Servers",
    printer: "Printers",
    iot: "IoT",
    gaming: "Gaming",
    unknown: "Other",
  };
  return labels[type] ?? "Other";
}
