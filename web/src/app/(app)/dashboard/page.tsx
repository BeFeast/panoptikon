"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Info,
  MonitorSmartphone,
  Pin,
  Radar,
  Router,
  Shield,
  WifiOff,
} from "lucide-react";
import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
import { HeroStat } from "@/components/dashboard/HeroStat";
import { HealthRing } from "@/components/dashboard/HealthRing";
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

// ─── Loading skeleton for hero stat cards ────────────────

function HeroStatSkeleton() {
  return (
    <Card className="h-full min-h-[140px] border-slate-700/50 bg-slate-900/55">
      <CardContent className="p-5 space-y-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-28 mt-auto" />
        <Skeleton className="h-3 w-32" />
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

// ─── Quick Actions ──────────────────────────────────────

function QuickActions() {
  const actions = [
    { label: "Scan Network", icon: <Radar className="h-4 w-4" />, href: "/settings/scanner" },
    { label: "View Alerts", icon: <AlertTriangle className="h-4 w-4" />, href: "/alerts" },
    { label: "Check DNS", icon: <Shield className="h-4 w-4" />, href: "/dns-queries" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-800/80 hover:text-white"
        >
          {action.icon}
          {action.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function DashboardPage() {
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Network health, traffic, and alerts at a glance.
        </p>
      </div>

      {/* ── Hero Stats Row ─────────────────────────────── */}
      <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsError ? (
          <>
            <StaggerItem>
              <HeroStat
                title="Total Devices"
                value={0}
                subtitle="Cannot load stats"
                icon={<MonitorSmartphone className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-slate-800 to-slate-900"
                href="/devices"
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="Active Alerts"
                value={0}
                subtitle="Cannot load stats"
                icon={<AlertTriangle className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-slate-800 to-slate-900"
                href="/alerts"
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="Uptime"
                value={0}
                suffix="%"
                subtitle="Cannot load stats"
                icon={<Activity className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-slate-800 to-slate-900"
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="Traffic"
                value={0}
                subtitle="Cannot load stats"
                icon={<Router className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-slate-800 to-slate-900"
                href="/traffic"
              />
            </StaggerItem>
          </>
        ) : stats ? (
          <>
            <StaggerItem>
              <HeroStat
                title="Total Devices"
                value={stats.devices_total}
                subtitle={`${stats.devices_online} currently online`}
                icon={<MonitorSmartphone className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-blue-600/90 to-blue-900/90"
                href="/devices"
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="Active Alerts"
                value={stats.alerts_unread}
                subtitle={stats.alerts_unread > 0 ? "Needs attention" : "All clear"}
                icon={<AlertTriangle className="h-5 w-5" />}
                gradient={
                  stats.alerts_unread > 0
                    ? "bg-gradient-to-br from-amber-600/90 to-amber-900/90"
                    : "bg-gradient-to-br from-emerald-600/90 to-emerald-900/90"
                }
                href="/alerts"
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="Infra Health"
                value={stats.critical_total > 0 ? Math.round((stats.critical_online / stats.critical_total) * 100) : 100}
                suffix="%"
                subtitle={
                  stats.critical_total > 0
                    ? `${stats.critical_online}/${stats.critical_total} critical online`
                    : "No critical devices"
                }
                icon={<Activity className="h-5 w-5" />}
                gradient={
                  stats.critical_total === 0 || (stats.critical_online / stats.critical_total) >= 0.9
                    ? "bg-gradient-to-br from-emerald-600/90 to-emerald-900/90"
                    : (stats.critical_online / stats.critical_total) >= 0.7
                      ? "bg-gradient-to-br from-amber-600/90 to-amber-900/90"
                      : "bg-gradient-to-br from-rose-600/90 to-rose-900/90"
                }
              />
            </StaggerItem>
            <StaggerItem>
              <HeroStat
                title="WAN Traffic"
                value={stats.wan_rx_bps}
                subtitle={`↑ ${formatBps(stats.wan_tx_bps)}`}
                icon={<Router className="h-5 w-5" />}
                gradient="bg-gradient-to-br from-violet-600/90 to-violet-900/90"
                href="/traffic"
                formatValue={(v) => `↓ ${formatBps(v)}`}
              />
            </StaggerItem>
          </>
        ) : (
          <>
            <StaggerItem><HeroStatSkeleton /></StaggerItem>
            <StaggerItem><HeroStatSkeleton /></StaggerItem>
            <StaggerItem><HeroStatSkeleton /></StaggerItem>
            <StaggerItem><HeroStatSkeleton /></StaggerItem>
          </>
        )}
      </StaggerContainer>

      {/* ── Quick Actions ──────────────────────────────── */}
      <QuickActions />

      {/* ── Bento Grid ─────────────────────────────────── */}
      <div
        className="grid grid-cols-1 gap-6 xl:grid-cols-6"
        style={{
          gridTemplateAreas: `
            "traffic traffic traffic traffic alerts alerts"
            "health health breakdown breakdown breakdown breakdown"
          `,
        }}
      >
        {/* ── WAN Traffic Card (2x1 wide) ────────────── */}
        <StaggerContainer
          className="col-span-1 xl:col-span-4"
          style={{ gridArea: "traffic" } as React.CSSProperties}
        >
          <StaggerItem>
            <Card className="border-slate-700/50 bg-slate-900/55 h-full">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-400" />
                    <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      WAN Traffic
                    </CardTitle>
                  </div>
                  <Link
                    href="/traffic"
                    className="flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
                  >
                    Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {/* Current aggregate speeds */}
                <div className="mb-4 flex flex-wrap items-end gap-6 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3">
                  <div className="min-w-[8rem]">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-400/85">Download</span>
                    <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-white">
                      {statsError ? "—" : stats ? formatBps(stats.wan_rx_bps) : "—"}
                    </p>
                  </div>
                  <div className="min-w-[8rem]">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-blue-400/90">Upload</span>
                    <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-white">
                      {statsError ? "—" : stats ? formatBps(stats.wan_tx_bps) : "—"}
                    </p>
                  </div>
                  <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-slate-600">Last 60 samples</span>
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
            </Card>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Alert Feed (1x1) ───────────────────────── */}
        <StaggerContainer
          className="col-span-1 xl:col-span-2"
          style={{ gridArea: "alerts" } as React.CSSProperties}
        >
          <StaggerItem>
            <Card className="border-slate-700/50 bg-slate-900/55 h-full">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Recent Alerts
                  </CardTitle>
                  <Link
                    href="/alerts"
                    className="flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
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
                        className={`flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 ${
                          !alert.is_read ? "border-blue-500/15 bg-blue-500/6" : "hover:border-slate-800/70"
                        }`}
                      >
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${severityDotColor(alert.severity)}`}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm text-slate-300" title={alert.message}>
                          {alert.message}
                        </p>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">
                          {timeAgo(alert.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>

        {/* ── Network Health Ring (1x1) ──────────────── */}
        <StaggerContainer
          className="col-span-1 xl:col-span-2"
          style={{ gridArea: "health" } as React.CSSProperties}
        >
          <StaggerItem>
            <Card
              className="h-full border-slate-700/50 bg-slate-900/55"
              data-testid="infra-health-card"
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Infrastructure Health
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center pb-5">
                {statsError ? (
                  <SectionError message="Failed to load" />
                ) : stats ? (
                  <button
                    type="button"
                    className="group cursor-pointer rounded-xl border border-slate-800/80 p-2 transition-colors hover:border-slate-700 hover:bg-slate-800/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    onClick={() => setCriticalDialogOpen(true)}
                    aria-label="View critical devices"
                  >
                    <HealthRing online={stats.critical_online} total={stats.critical_total} />
                    <span className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-slate-500 transition-colors group-hover:text-slate-300">
                      <Info className="h-3 w-3" /> View details
                    </span>
                  </button>
                ) : (
                  <Skeleton className="aspect-square w-full max-w-[7rem] rounded-full" />
                )}
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>
        <CriticalDevicesDialog
          open={criticalDialogOpen}
          onOpenChange={setCriticalDialogOpen}
        />

        {/* ── Device Breakdown (2x1 wide) ────────────── */}
        <StaggerContainer
          className="col-span-1 xl:col-span-4"
          style={{ gridArea: "breakdown" } as React.CSSProperties}
        >
          <StaggerItem>
            <Card className="border-slate-700/50 bg-slate-900/55 h-full">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Device Breakdown
                  </CardTitle>
                  <Link
                    href="/devices"
                    className="flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
                  >
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {devicesError ? (
                  <SectionError message="Failed to load devices" />
                ) : devices === null ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : deviceBreakdown.length === 0 ? (
                  <p className="text-sm text-slate-600">No devices found.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {deviceBreakdown.map((item) => {
                      const Icon = getDeviceIcon(item.type, null, null).icon;
                      return (
                        <div key={item.type} className="flex items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="w-28 shrink-0 truncate text-sm text-slate-300">
                            {item.label}
                          </span>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800/90">
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
          </StaggerItem>
        </StaggerContainer>
      </div>
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
