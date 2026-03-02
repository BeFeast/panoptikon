"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  MonitorSmartphone,
  Pin,
  Router,
  WifiOff,
} from "lucide-react";
import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  fetchDashboardStats,
  fetchRecentAlerts,
  fetchTrafficHistory,
  fetchDevices,
  fetchCriticalDevices,
} from "@/lib/api";
import type { Alert, CriticalDevice, DashboardStats, TrafficHistoryPoint, Device } from "@/lib/types";
import { formatBps, timeAgo } from "@/lib/format";
import { PageTransition } from "@/components/PageTransition";
import { StaggerContainer, StaggerItem } from "@/components/MotionStagger";
import { toast } from "sonner";
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

// ─── Critical Devices Dialog ──────────────────────────

function CriticalDevicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [devices, setDevices] = useState<CriticalDevice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDevices(null);
    setError(false);
    fetchCriticalDevices()
      .then(setDevices)
      .catch(() => setError(true));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-700 bg-slate-900 text-white sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">Critical Devices</DialogTitle>
          <DialogDescription className="text-slate-400">
            Devices included in the Infrastructure Health metric.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto -mx-6 px-6">
          {error ? (
            <div className="flex items-center gap-2 py-4 text-sm text-rose-400">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>Failed to load critical devices</span>
            </div>
          ) : devices === null ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No critical devices found.
            </p>
          ) : (
            <div className="space-y-1 py-2">
              {devices.map((dev) => (
                <Link
                  key={dev.id}
                  href={`/devices?id=${dev.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-800 transition-colors group"
                  onClick={() => onOpenChange(false)}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                      dev.is_online
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30"
                        : "bg-rose-400 ring-2 ring-rose-400/30"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-200">
                        {dev.name || dev.hostname || dev.ip || "Unknown"}
                      </span>
                      {dev.classification === "pinned" && (
                        <Pin className="h-3 w-3 shrink-0 text-amber-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {dev.device_type && (
                        <span className="capitalize">{dev.device_type.replace(/_/g, " ")}</span>
                      )}
                      {dev.ip && <span>{dev.ip}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`text-xs font-medium ${
                        dev.is_online ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {dev.is_online ? "Online" : "Offline"}
                    </span>
                    {dev.last_seen_at && (
                      <p className="text-xs text-slate-600">{timeAgo(dev.last_seen_at)}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="relative aspect-square w-full max-w-[7rem]">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              strokeWidth="8"
              className="text-slate-500/10 stroke-current"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-medium text-slate-500">N/A</span>
          </div>
        </div>
        <span className="text-xs text-slate-500 text-center">
          No critical devices
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative aspect-square w-full max-w-[7rem]">
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
        {online}/{total} critical online
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
    <Card className="h-full border-slate-800 bg-slate-900 transition-all hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-blue-500/5">
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
        <p className="truncate text-2xl font-bold tabular-nums text-white">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
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
    <Card className="h-full border-slate-800 bg-slate-900">
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

// ─── Error card shown when a section fails to load ──────

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-rose-400">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
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
  // Each section has independent data + error state.
  // null = still loading (show skeleton), non-null = loaded.
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [alertsError, setAlertsError] = useState(false);

  const [trafficHistory, setTrafficHistory] = useState<TrafficHistoryPoint[] | null>(null);
  const [trafficError, setTrafficError] = useState(false);

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devicesError, setDevicesError] = useState(false);
  const [criticalDialogOpen, setCriticalDialogOpen] = useState(false);

  // ── Independent loaders — each resolves on its own ────

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchDashboardStats();
      setStats(s);
      setStatsError(false);
    } catch {
      setStatsError(true);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const a = await fetchRecentAlerts(5);
      setAlerts(Array.isArray(a) ? a : []);
      setAlertsError(false);
    } catch {
      setAlertsError(true);
    }
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const th = await fetchTrafficHistory(60);
      setTrafficHistory(th);
      setTrafficError(false);
    } catch {
      setTrafficError(true);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const devs = await fetchDevices();
      setDevices(Array.isArray(devs) ? devs : []);
      setDevicesError(false);
    } catch {
      setDevicesError(true);
    }
  }, []);

  // Fire all fetches in parallel — each resolves independently
  const loadAll = useCallback(() => {
    loadStats();
    loadAlerts();
    loadTraffic();
    loadDevices();
  }, [loadStats, loadAlerts, loadTraffic, loadDevices]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Keep a ref to current devices so WS handler can look up names without stale closure
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_online", "agent_offline"],
    (msg) => {
      if (["device_online", "device_offline", "new_device"].includes(msg.event)) {
        const d = msg.data as { device_id?: string; mac?: string; ip?: string };
        const dev = devicesRef.current?.find((x) => x.id === d.device_id);
        const label = dev?.name || dev?.hostname || d.mac || "Unknown device";

        if (msg.event === "device_online") {
          toast.success(`${label} came online`, { description: d.ip });
        } else if (msg.event === "device_offline") {
          toast.error(`${label} went offline`);
        } else if (msg.event === "new_device") {
          toast.info(`New device discovered: ${d.mac}`, { description: d.ip });
        }
      }
      loadAll();
    }
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
      deviceBreakdown.push({ type, label: getCategoryLabel(type), count });
    }
    deviceBreakdown.sort((a, b) => b.count - a.count);
  }

  const maxCount = deviceBreakdown.length > 0 ? Math.max(...deviceBreakdown.map((d) => d.count)) : 1;

  return (
    <PageTransition>
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>

      {/* ── Bento Grid ─────────────────────────────────── */}
      <StaggerContainer className="grid grid-cols-1 gap-4 lg:grid-cols-5 items-stretch">
        {/* ── Health Score Ring ─────────────────────────── */}
        <StaggerItem className="h-full"><Card
          className="h-full border-slate-800 bg-slate-900 lg:col-span-1 cursor-pointer transition-all hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-lg hover:shadow-blue-500/5"
          onClick={() => stats && stats.critical_total > 0 && setCriticalDialogOpen(true)}
          data-testid="infra-health-card"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Infrastructure Health
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-4">
            {statsError ? (
              <SectionError message="Failed to load" />
            ) : stats ? (
              <>
                <HealthRing online={stats.critical_online} total={stats.critical_total} />
              </>
            ) : (
              <Skeleton className="aspect-square w-full max-w-[7rem] rounded-full" />
            )}
          </CardContent>
          {stats && stats.critical_total > 0 && (
            <div className="px-6 pb-3 -mt-2">
              <p className="text-center text-[10px] text-slate-600">
                Click for details
              </p>
            </div>
          )}
        </Card></StaggerItem>
        <CriticalDevicesDialog
          open={criticalDialogOpen}
          onOpenChange={setCriticalDialogOpen}
        />

        {/* ── Stat Cards Row ───────────────────────────── */}
        <StaggerItem className="h-full lg:col-span-4"><div className="grid h-full grid-cols-2 gap-3 lg:grid-cols-4">
          {statsError ? (
            <>
              <StatCard
                title="Router Status"
                href="/router"
                value="Unreachable"
                subtitle="Cannot load stats"
                icon={<Router className="h-4 w-4" />}
                status="offline"
              />
              <StatCard
                title="Active Devices"
                href="/devices"
                value="—"
                subtitle="Cannot load stats"
                icon={<MonitorSmartphone className="h-4 w-4" />}
                status="offline"
              />
              <StatCard
                title="WAN Bandwidth"
                href="/traffic"
                value="—"
                subtitle="Cannot load stats"
                icon={<Activity className="h-4 w-4" />}
                status="offline"
              />
              <StatCard
                title="Unread Alerts"
                href="/alerts"
                value="—"
                subtitle="Cannot load stats"
                icon={<AlertTriangle className="h-4 w-4" />}
                status="offline"
              />
            </>
          ) : stats ? (
            <>
              <StatCard
                title="Router Status"
                href="/router"
                value={routerStatusLabel(stats).label}
                subtitle={
                  stats.router_status === "connected" || stats.router_status === "online"
                    ? `Connected to ${stats.router_type === "mikrotik" ? "MikroTik" : "router"}`
                    : stats.router_status === "unconfigured"
                      ? "Router not configured"
                      : `Cannot reach ${stats.router_type === "mikrotik" ? "MikroTik" : "router"}`
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
        </div></StaggerItem>

        {/* ── WAN Traffic Card with Sparkline ─────────── */}
        <StaggerItem className="lg:col-span-3"><Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <CardTitle className="text-sm font-medium text-slate-400">
                  WAN Traffic
                </CardTitle>
              </div>
              <Link
                href="/traffic"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {/* Current aggregate speeds */}
            <div className="mb-3 flex items-baseline gap-6">
              <div>
                <span className="text-xs text-emerald-400">↓ Download</span>
                <p className="text-xl font-bold tabular-nums text-white">
                  {statsError ? "—" : stats ? formatBps(stats.wan_rx_bps) : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-blue-400">↑ Upload</span>
                <p className="text-xl font-bold tabular-nums text-white">
                  {statsError ? "—" : stats ? formatBps(stats.wan_tx_bps) : "—"}
                </p>
              </div>
              <span className="ml-auto text-xs text-slate-600">Last 60 samples</span>
            </div>
            {/* Sparkline */}
            {trafficError ? (
              <div className="flex h-[120px] items-center justify-center">
                <SectionError message="Failed to load traffic data" />
              </div>
            ) : trafficHistory === null ? (
              <Skeleton className="h-[120px] w-full" />
            ) : trafficHistory.length > 0 ? (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficHistory} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="sparkRx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="sparkTx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                        name === "rx_bps" ? "↓ Download" : "↑ Upload",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="rx_bps"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fill="url(#sparkRx)"
                      dot={false}
                      name="rx_bps"
                    />
                    <Area
                      type="monotone"
                      dataKey="tx_bps"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      fill="url(#sparkTx)"
                      dot={false}
                      name="tx_bps"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center">
                <p className="text-sm text-slate-600">No traffic data yet</p>
              </div>
            )}
          </CardContent>
        </Card></StaggerItem>

        {/* ── Alert Feed ───────────────────────────────── */}
        <StaggerItem className="lg:col-span-2"><Card className="border-slate-800 bg-slate-900">
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
            {alertsError ? (
              <SectionError message="Failed to load alerts" />
            ) : alerts === null ? (
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
        </Card></StaggerItem>

        {/* ── Device Type Breakdown ────────────────────── */}
        <StaggerItem className="lg:col-span-5"><Card className="border-slate-800 bg-slate-900">
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
            {devicesError ? (
              <SectionError message="Failed to load devices" />
            ) : devices === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : deviceBreakdown.length === 0 ? (
              <p className="text-sm text-slate-600">No devices found.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {deviceBreakdown.map((item) => {
                  const Icon = getDeviceIcon(item.type, null, null).icon;
                  return (
                    <div key={item.type} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="w-24 shrink-0 truncate text-sm text-slate-300">
                        {item.label}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
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
        </Card></StaggerItem>
      </StaggerContainer>
    </div>
    </PageTransition>
  );
}

// ─── Category label helper ──────────────────────────────

function getCategoryLabel(type: DeviceType): string {
  const labels: Record<DeviceType, string> = {
    router: "Routers",
    access_point: "Access Points",
    laptop: "Laptops",
    desktop: "Desktops",
    phone: "Phones",
    tablet: "Tablets",
    tv: "TVs",
    server: "Servers",
    printer: "Printers",
    iot: "IoT",
    gaming: "Gaming",
    workstation: "Workstations",
    vm: "VMs",
    container: "Containers",
    nas: "NAS",
    switch: "Switches",
    ups: "UPS",
    other: "Other",
    unknown: "Other",
  };
  return labels[type] ?? "Other";
}
