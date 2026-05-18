"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, ExternalLink, WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAgents,
  fetchCriticalDevices,
  fetchDashboardStats,
  fetchDevices,
  fetchDnsQueryStats,
  fetchRecentAlerts,
  fetchTopDevices,
  fetchTopologyGraph,
  fetchTrafficHistory,
} from "@/lib/api";
import type {
  Agent,
  Alert,
  CriticalDevice,
  DashboardStats,
  Device,
  DnsQueryStats,
  TopDevice,
  TopologyGraph,
  TrafficHistoryPoint,
} from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import { useWsEvent } from "@/lib/ws";
import { cn } from "@/lib/utils";
import { useApiFetch } from "@/hooks/useApiFetch";
import {
  Icon,
  KPI,
  SevDot,
  Spark,
  StatusDot,
  type Severity,
} from "@/components/mesh";
import { ErrorState } from "@/components/mesh/state";
import { TrafficChart } from "@/components/dashboard/TrafficChart";
import { TopoMini } from "@/components/dashboard/TopoMini";

// ─── Compact integer formatting (12300 → "12.3k") ──────

function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

// Convert raw bps → Mbps integer (rounded for compactness).
function bpsToMbps(bps: number): number {
  return Math.round(bps / 1_000_000);
}

// Map backend Alert severity → mesh SevDot severity.
function mapAlertSeverity(s: Alert["severity"]): Severity {
  switch (s) {
    case "CRITICAL":
      return "critical";
    case "WARNING":
      return "medium";
    default:
      return "low";
  }
}

function formatAlertTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Derive a short "source" string from an alert payload (best-effort).
function alertSource(a: Alert): string {
  const anyAlert = a as Alert & { source_type?: string };
  if (anyAlert.source_type) return anyAlert.source_type;
  if (a.type) return a.type.replace(/_/g, " ");
  return "system";
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
      <DialogContent className="border-mesh-border bg-mesh-surface-1 text-white sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white">Critical Devices</DialogTitle>
          <DialogDescription className="text-mesh-text-dim">
            Devices included in the Infrastructure Health metric.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto -mx-6 px-6">
          {error ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[#fb7185]">
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
            <p className="py-6 text-center text-sm text-mesh-text-mute">
              No critical devices found.
            </p>
          ) : (
            <div className="space-y-1 py-2">
              {devices.map((dev) => (
                <Link
                  key={dev.id}
                  href={`/devices?id=${dev.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-mesh-surface-2/55 transition-colors group"
                  onClick={() => onOpenChange(false)}
                >
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
                      dev.is_online
                        ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30"
                        : "bg-[#fb7185] ring-2 ring-[#fb7185]/30",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-mesh-text">
                        {dev.name || dev.hostname || dev.ip || "Unknown"}
                      </span>
                      {dev.classification === "pinned" && (
                        <Pin className="h-3 w-3 shrink-0 text-[#fbbf24]" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-mesh-text-mute">
                      {dev.device_type && (
                        <span className="capitalize">{dev.device_type.replace(/_/g, " ")}</span>
                      )}
                      {dev.ip && <span>{dev.ip}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        dev.is_online ? "text-[#4ade80]" : "text-[#fb7185]",
                      )}
                    >
                      {dev.is_online ? "Online" : "Offline"}
                    </span>
                    {dev.last_seen_at && (
                      <p className="text-xs text-mesh-text-mute">{timeAgo(dev.last_seen_at)}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-mesh-text-mute opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Build a Spark series from a raw bps series (rx + tx). ──

function trafficSpark(
  history: TrafficHistoryPoint[] | null,
  kind: "rx" | "tx" | "sum",
): number[] {
  if (!history || history.length === 0) return [0, 0, 0, 0, 0];
  return history.map((p) => {
    if (kind === "rx") return p.rx_bps;
    if (kind === "tx") return p.tx_bps;
    return p.rx_bps + p.tx_bps;
  });
}

// Build a synthetic per-device spark from the rx_bps headline number — the
// dashboard top-devices API does not return a per-device history series yet.
// We render a flat baseline scaled to the current rate so layout stays
// stable; once the backend ships per-device history this can be replaced.
function devicePlaceholderSpark(rate: number): number[] {
  const base = Math.max(1, rate);
  return [base * 0.6, base * 0.7, base * 0.85, base * 0.9, base, base * 0.95];
}

// ─── Page ───────────────────────────────────────────────

export default function DashboardPage() {
  const [criticalDialogOpen, setCriticalDialogOpen] = useState(false);
  const [trafficRange, setTrafficRange] = useState<"1h" | "6h" | "24h" | "7d">("1h");
  const trafficMinutes =
    trafficRange === "1h"
      ? 60
      : trafficRange === "6h"
        ? 360
        : trafficRange === "24h"
          ? 1440
          : 10080;

  const swrOpts = { refreshInterval: 30_000 } as const;

  const { data: stats, error: statsError, mutate: mutateStats } = useApiFetch<DashboardStats>(
    "/api/v1/dashboard/stats",
    fetchDashboardStats,
    swrOpts,
  );
  const { data: alerts, error: alertsError, mutate: mutateAlerts } = useApiFetch<Alert[]>(
    "/api/v1/dashboard/alerts",
    () => fetchRecentAlerts(6).then((a) => (Array.isArray(a) ? a : [])),
    swrOpts,
  );
  const { data: trafficHistory, error: trafficError, mutate: mutateTraffic } = useApiFetch<TrafficHistoryPoint[]>(
    `/api/v1/dashboard/traffic?range=${trafficRange}`,
    () => fetchTrafficHistory(trafficMinutes),
    swrOpts,
  );
  const { data: devices, error: devicesError, mutate: mutateDevices } = useApiFetch<Device[]>(
    "/api/v1/dashboard/devices",
    () => fetchDevices().then((d) => (Array.isArray(d) ? d : [])),
    swrOpts,
  );
  const { data: topDevices, error: topDevicesError, mutate: mutateTopDevices } = useApiFetch<TopDevice[]>(
    "/api/v1/dashboard/top-devices",
    () => fetchTopDevices(5).then((d) => (Array.isArray(d) ? d : [])),
    swrOpts,
  );
  const { data: topology, error: topologyError, mutate: mutateTopology } = useApiFetch<TopologyGraph>(
    "/api/v1/topology/graph",
    fetchTopologyGraph,
    swrOpts,
  );
  const { data: agents, error: agentsError } = useApiFetch<Agent[]>(
    "/api/v1/agents",
    () => fetchAgents().then((a) => (Array.isArray(a) ? a : [])),
    swrOpts,
  );
  const { data: dnsStats, error: dnsStatsError } = useApiFetch<DnsQueryStats>(
    "/api/v1/dns-queries/stats?hours=24",
    () => fetchDnsQueryStats(24),
    swrOpts,
  );

  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const revalidateAll = () => {
    mutateStats();
    mutateAlerts();
    mutateTraffic();
    mutateDevices();
    mutateTopDevices();
    mutateTopology();
  };

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
      revalidateAll();
    },
  );

  // ── Header subline: pull subnet count from topology when available ──
  const subnetCount = useMemo(() => {
    if (!topology) return null;
    const subnets = new Set<string>();
    for (const d of topology.devices) {
      for (const ip of d.ips ?? []) {
        const m = ip.match(/^(\d+\.\d+\.\d+)\./);
        if (m) subnets.add(m[1]);
      }
    }
    return subnets.size || null;
  }, [topology]);

  // ── Live KPI values derived from real backend data ──────
  const totalThroughputMbps = stats ? bpsToMbps(stats.wan_rx_bps + stats.wan_tx_bps) : null;
  const onlineAgents = agents?.filter((a) => a.is_online).length ?? null;
  const totalAgents = agents?.length ?? null;

  // ── Recent events: map alerts → SevDot rows ────────────
  const events = alerts ?? null;

  // ── Top talkers rows derived from /api/v1/dashboard/top-devices ──
  const talkers = topDevices ?? null;

  return (
    <PageTransition>
      <div
        className="flex flex-col gap-4 p-4 lg:p-5"
        data-testid="dashboard-root"
      >
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-mesh-text-mute">
              Overview
            </div>
            <h1
              className="mt-1 text-3xl font-semibold tracking-tight text-white"
              data-testid="dashboard-title"
            >
              core.lan
            </h1>
            <div className="mt-1.5 font-mono text-xs text-mesh-text-mute">
              {topology
                ? `10.0.0.0/16 · ${subnetCount ?? "—"} subnets · ${stats?.devices_total ?? "—"} known`
                : `10.0.0.0/16 · — · — known`}
              {/* TODO: backend gap — uptime not surfaced via /dashboard/stats yet */}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 mesh-card px-3 py-1.5 text-xs text-mesh-text hover:bg-mesh-surface-2"
            >
              <Icon name="filter" size={12} />
              <span>last 24h</span>
              <Icon name="chevron-down" size={11} color="hsl(var(--muted-foreground))" />
            </button>
            <Link
              href="/devices"
              className="inline-flex items-center gap-2 mesh-card px-3 py-1.5 text-xs text-mesh-text hover:bg-mesh-surface-2"
            >
              <Icon name="plus" size={12} />
              <span>Add device</span>
            </Link>
            <Link
              href="/settings/scanner"
              className="inline-flex items-center gap-2 rounded-md bg-mesh-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-mesh-primary-hover"
            >
              <Icon name="cmd" size={12} />
              <span>Run scan</span>
            </Link>
          </div>
        </div>

        {/* ── KPI row (6 cards) ──────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          <KPI
            label="Devices online"
            value={stats ? String(stats.devices_online) : "—"}
            unit={stats ? `/ ${stats.devices_total}` : ""}
            spark={
              <Spark
                data={trafficSpark(trafficHistory, "sum").slice(-28)}
                width={120}
                height={26}
                color="hsl(var(--status-online))"
              />
            }
          />
          <KPI
            label="Throughput"
            value={totalThroughputMbps !== null ? String(totalThroughputMbps) : "—"}
            unit="Mbps"
            spark={
              <Spark
                data={trafficSpark(trafficHistory, "sum").slice(-28)}
                width={120}
                height={26}
                color="hsl(var(--status-info))"
              />
            }
            accent="hsl(var(--status-info))"
          />
          <KPI
            label="Agents"
            value={agentsError ? "—" : onlineAgents !== null ? String(onlineAgents) : "—"}
            unit={totalAgents !== null ? `/ ${totalAgents}` : ""}
            spark={
              <Spark
                data={[0.8, 0.9, 0.95, 1, 0.9, 1]}
                width={120}
                height={26}
                color="hsl(var(--status-online))"
              />
            }
          />
          <KPI
            label="Alerts"
            value={stats ? String(stats.alerts_unread) : "—"}
            unit="open"
            spark={
              <Spark
                data={[0, 1, 0, 1, 2, 1, 0, 1]}
                width={120}
                height={26}
                color={
                  stats && stats.alerts_unread > 0
                    ? "hsl(var(--status-offline))"
                    : "hsl(var(--status-online))"
                }
              />
            }
            accent={
              stats && stats.alerts_unread > 0
                ? "hsl(var(--status-offline))"
                : undefined
            }
          />
          <KPI
            label="WAN latency"
            value="—"
            unit="ms"
            /* TODO: backend gap — /api/v1/dashboard/stats does not expose wan_latency_ms */
            spark={
              <Spark
                data={[14, 15, 14, 13, 14, 12, 13, 14]}
                width={120}
                height={26}
                color="hsl(var(--status-online))"
              />
            }
            accent="hsl(var(--status-online))"
          />
          <KPI
            label="DNS blocks"
            value={
              dnsStatsError
                ? "—"
                : dnsStats
                  ? formatCompactCount(dnsStats.blocked_queries)
                  : "—"
            }
            unit="24h"
            spark={
              <Spark
                data={[20, 40, 35, 60, 80, 70, 90, 100]}
                width={120}
                height={26}
                color="hsl(var(--primary))"
              />
            }
            accent="hsl(var(--primary))"
          />
        </div>

        {/* ── Main grid: traffic + top talkers / topology + events ── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* LEFT column */}
          <div className="flex flex-col gap-3">
            {/* WAN traffic card */}
            <div className="mesh-card p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">WAN traffic</h3>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-mesh-text-mute">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-0.5 w-2 rounded-sm bg-[hsl(var(--status-info))]" />
                      RX <span className="text-white">{stats ? bpsToMbps(stats.wan_rx_bps) : "—"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-0.5 w-2 rounded-sm bg-[hsl(var(--primary))]" />
                      TX <span className="text-white">{stats ? bpsToMbps(stats.wan_tx_bps) : "—"}</span>
                    </span>
                    <span className="text-mesh-text-faint">Mbps</span>
                  </div>
                </div>
                <div className="flex gap-1 mesh-card-2 p-0.5">
                  {(["1h", "6h", "24h", "7d"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTrafficRange(r)}
                      className={cn(
                        "rounded px-2 py-0.5 font-mono text-[11px]",
                        trafficRange === r
                          ? "bg-mesh-surface-3 text-white"
                          : "text-mesh-text-mute hover:text-white",
                      )}
                      data-active={trafficRange === r ? "true" : "false"}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {trafficError ? (
                <div className="flex h-[200px] items-center justify-center">
                  <ErrorState
                    title="Failed to load traffic"
                    onRetry={() => mutateTraffic()}
                  />
                </div>
              ) : trafficHistory === null ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <TrafficChart history={trafficHistory} height={200} />
              )}
            </div>

            {/* Top talkers table */}
            <div className="mesh-card">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Top talkers · 24h</h3>
                <span className="font-mono text-[11px] text-mesh-text-mute">
                  {talkers ? `${talkers.length} of ${stats?.devices_total ?? "—"}` : "loading…"}
                </span>
              </div>
              <div className="border-t border-mesh-border">
                <div className="grid grid-cols-[1.4fr_1fr_80px_80px_1fr_60px] px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-mesh-text-mute">
                  <span>Device</span>
                  <span>IP</span>
                  <span className="text-right">RX MB/s</span>
                  <span className="text-right">TX MB/s</span>
                  <span>Trend</span>
                  <span className="text-right">Mbps</span>
                </div>
                {topDevicesError ? (
                  <div className="p-4">
                    <ErrorState
                      title="Failed to load top devices"
                      onRetry={() => mutateTopDevices()}
                    />
                  </div>
                ) : talkers === null ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : talkers.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-mesh-text-mute">
                    No device traffic recorded yet.
                  </p>
                ) : (
                  talkers.map((d, i) => {
                    const rxMb = (d.rx_bps / 1_000_000).toFixed(1);
                    const txMb = (d.tx_bps / 1_000_000).toFixed(1);
                    const mbps = bpsToMbps(d.rx_bps + d.tx_bps);
                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "grid grid-cols-[1.4fr_1fr_80px_80px_1fr_60px] items-center px-4 py-2 text-xs",
                          i < talkers.length - 1 && "border-b border-mesh-border",
                        )}
                        data-testid="top-talker-row"
                      >
                        <span className="flex items-center gap-2 text-white">
                          <StatusDot status="online" size={6} pulse={i === 0} />
                          <Link
                            href={`/devices?id=${d.id}`}
                            className="truncate hover:text-mesh-accent"
                          >
                            {d.name || d.hostname || d.vendor || "Unknown"}
                          </Link>
                        </span>
                        <span className="font-mono text-mesh-text-dim">{d.ip ?? "—"}</span>
                        <span className="text-right font-mono text-white">{rxMb}</span>
                        <span className="text-right font-mono text-mesh-text-dim">{txMb}</span>
                        <span>
                          <Spark
                            data={devicePlaceholderSpark(d.rx_bps + d.tx_bps)}
                            width={100}
                            height={18}
                            color="hsl(var(--status-info))"
                          />
                        </span>
                        <span className="text-right font-mono text-white">{mbps}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT column */}
          <div className="flex flex-col gap-3">
            {/* Topology card */}
            <div className="flex flex-col gap-2.5 mesh-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Topology</h3>
                <Link
                  href="/topology"
                  className="text-xs font-medium text-mesh-accent hover:text-[#67e8f9]"
                >
                  open →
                </Link>
              </div>
              <div className="h-[220px] rounded mesh-card-2 p-2.5">
                {topologyError ? (
                  <ErrorState
                    title="Failed to load topology"
                    onRetry={() => mutateTopology()}
                  />
                ) : topology === null ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <TopoMini topology={topology} />
                )}
              </div>
              <div className="flex justify-between font-mono text-[11px] text-mesh-text-mute">
                <span>{subnetCount ?? "—"} subnets</span>
                <span>
                  {topology
                    ? `${topology.devices.length} devices`
                    : "— devices"}
                </span>
                <span>
                  {stats
                    ? `${stats.devices_online} / ${stats.devices_total}`
                    : "— / —"}
                </span>
              </div>
            </div>

            {/* Recent events */}
            <div className="mesh-card">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Recent events</h3>
                <span className="font-mono text-[11px] text-mesh-text-mute">last 1h</span>
              </div>
              <div className="border-t border-mesh-border">
                {alertsError ? (
                  <div className="p-4">
                    <ErrorState
                      title="Failed to load events"
                      onRetry={() => mutateAlerts()}
                    />
                  </div>
                ) : events === null ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-mesh-text-mute">
                    No recent events — all clear.
                  </p>
                ) : (
                  events.slice(0, 6).map((e, i) => (
                    <div
                      key={e.id}
                      className={cn(
                        "flex items-start gap-2.5 px-4 py-2 text-xs",
                        i < Math.min(events.length, 6) - 1 && "border-b border-mesh-border",
                      )}
                      data-testid="recent-event-row"
                    >
                      <span className="min-w-[36px] font-mono text-[11px] text-mesh-text-faint">
                        {formatAlertTime(e.created_at)}
                      </span>
                      <span className="pt-1">
                        <SevDot severity={mapAlertSeverity(e.severity)} size={6} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white">{e.message}</div>
                        <div className="font-mono text-[10px] text-mesh-text-mute">
                          {alertSource(e)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Subnet utilization ──────────────── */}
        <div className="mesh-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Subnet utilization</h3>
            <span className="font-mono text-[11px] text-mesh-text-mute">capacity / 5min</span>
          </div>
          {/* TODO: backend gap — no per-subnet stats endpoint exists yet (no
              /api/v1/subnets/utilization). The cards below derive counts
              from topology IP groupings; capacity / mbps placeholders remain
              "—" until the endpoint lands. */}
          <SubnetUtilization topology={topology} devicesError={!!devicesError} />
        </div>

        <CriticalDevicesDialog open={criticalDialogOpen} onOpenChange={setCriticalDialogOpen} />
      </div>
    </PageTransition>
  );
}

// ─── Subnet utilization grid ────────────────────────────

function SubnetUtilization({
  topology,
  devicesError,
}: {
  topology: TopologyGraph | null;
  devicesError: boolean;
}) {
  // Derive subnets from topology device IPs.
  const subnets = useMemo(() => {
    if (!topology) return null;
    const groups = new Map<string, { hosts: number; online: number }>();
    for (const d of topology.devices) {
      for (const ip of d.ips ?? []) {
        const m = ip.match(/^(\d+\.\d+\.\d+)\./);
        if (!m) continue;
        const prefix = m[1];
        const entry = groups.get(prefix) ?? { hosts: 0, online: 0 };
        entry.hosts += 1;
        if (d.is_online) entry.online += 1;
        groups.set(prefix, entry);
        break;
      }
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].hosts - a[1].hosts)
      .slice(0, 5)
      .map(([prefix, v]) => ({
        name: prefix,
        cidr: `${prefix}.0/24`,
        hosts: v.hosts,
        util: Math.min(100, Math.round((v.hosts / 254) * 100)),
      }));
  }, [topology]);

  if (devicesError) {
    return (
      <div className="py-4">
        <ErrorState title="Failed to load subnet data" />
      </div>
    );
  }

  if (subnets === null) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (subnets.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-mesh-text-mute">
        No subnet data yet — discover devices to populate this view.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {subnets.map((s) => {
        const high = s.util > 70;
        return (
          <div
            key={s.name}
            className="flex flex-col gap-2 mesh-card-2 p-3"
            data-testid="subnet-card"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-white">{s.name}</span>
              <span className="font-mono text-[10px] text-mesh-text-mute">{s.cidr}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-2xl font-semibold leading-none"
                style={{
                  color: high ? "hsl(var(--status-warning))" : "hsl(var(--foreground))",
                }}
              >
                {s.util}
              </span>
              <span className="font-mono text-[11px] text-mesh-text-mute">%</span>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-mesh-text-dim">{s.hosts} hosts</span>
            </div>
            <div className="h-1 overflow-hidden rounded-sm bg-mesh-surface-3">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${s.util}%`,
                  background: high
                    ? "hsl(var(--status-warning))"
                    : "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-mesh-text-mute">
              <span>— Mbps{/* TODO: backend gap — per-subnet bandwidth */}</span>
              <Spark
                data={[s.util * 0.6, s.util * 0.8, s.util, s.util * 0.9, s.util * 1.05]}
                width={50}
                height={14}
                color="hsl(var(--ring))"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
