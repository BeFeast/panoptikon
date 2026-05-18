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

// ─── Token literals (mesh direction, byte-exact from tokens.css) ──────
// Tokens whose names conflict with shadcn's HSL vars at :root — must be
// passed as literal hex inline per the runbook fallback.
const T = {
  border: "rgba(96,144,212,0.20)",
  primary: "#2563eb",
  statusOnline: "#4ade80",
  statusOffline: "#fb7185",
  statusWarning: "#fbbf24",
  statusInfo: "#38bdf8",
} as const;

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
      <DialogContent
        className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${T.border}`,
          color: "var(--text)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text)" }}>Critical Devices</DialogTitle>
          <DialogDescription style={{ color: "var(--text-dim)" }}>
            Devices included in the Infrastructure Health metric.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto -mx-6 px-6">
          {error ? (
            <div
              className="flex items-center gap-2 py-4 text-sm"
              style={{ color: T.statusOffline }}
            >
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
            <p
              className="py-6 text-center text-sm"
              style={{ color: "var(--text-mute)" }}
            >
              No critical devices found.
            </p>
          ) : (
            <div className="space-y-1 py-2">
              {devices.map((dev) => (
                <Link
                  key={dev.id}
                  href={`/devices?id=${dev.id}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors group"
                  onClick={() => onOpenChange(false)}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: dev.is_online ? T.statusOnline : T.statusOffline,
                      boxShadow: `0 0 0 2px ${dev.is_online ? "rgba(74,222,128,0.30)" : "rgba(251,113,133,0.30)"}`,
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-sm font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {dev.name || dev.hostname || dev.ip || "Unknown"}
                      </span>
                      {dev.classification === "pinned" && (
                        <Pin className="h-3 w-3 shrink-0" style={{ color: T.statusWarning }} />
                      )}
                    </div>
                    <div
                      className="flex items-center gap-2 text-xs"
                      style={{ color: "var(--text-mute)" }}
                    >
                      {dev.device_type && (
                        <span className="capitalize">{dev.device_type.replace(/_/g, " ")}</span>
                      )}
                      {dev.ip && <span>{dev.ip}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className="text-xs font-medium"
                      style={{ color: dev.is_online ? T.statusOnline : T.statusOffline }}
                    >
                      {dev.is_online ? "Online" : "Offline"}
                    </span>
                    {dev.last_seen_at && (
                      <p className="text-xs" style={{ color: "var(--text-mute)" }}>
                        {timeAgo(dev.last_seen_at)}
                      </p>
                    )}
                  </div>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-mute)" }}
                  />
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

// Synthetic per-device spark from current rate (no per-device history API yet).
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

  const { data: stats, mutate: mutateStats } = useApiFetch<DashboardStats>(
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

  const totalThroughputMbps = stats ? bpsToMbps(stats.wan_rx_bps + stats.wan_tx_bps) : null;
  const onlineAgents = agents?.filter((a) => a.is_online).length ?? null;
  const totalAgents = agents?.length ?? null;
  const events = alerts ?? null;
  const talkers = topDevices ?? null;

  return (
    <PageTransition>
      <div
        data-testid="dashboard-root"
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* ── Header ──────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="t-micro">Overview</div>
            <h1
              className="t-display"
              data-testid="dashboard-title"
              style={{ margin: "4px 0 6px" }}
            >
              core.lan
            </h1>
            <div className="t-small mono" style={{ color: "var(--text-mute)" }}>
              {topology
                ? `10.0.0.0/16  ·  ${subnetCount ?? "—"} subnets  ·  ${stats?.devices_total ?? "—"} known`
                : `10.0.0.0/16  ·  —  ·  — known`}
              {/* TODO: backend gap — uptime not surfaced via /dashboard/stats yet */}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" style={{ gap: 8 }}>
              <Icon name="filter" size={12} />
              <span>last 24h</span>
              <Icon name="chevron-down" size={11} color="var(--text-mute)" />
            </button>
            <Link href="/devices" className="btn">
              <Icon name="plus" size={12} />
              <span>Add device</span>
            </Link>
            <Link href="/settings/scanner" className="btn btn-primary">
              <Icon name="cmd" size={12} />
              <span>Run scan</span>
            </Link>
          </div>
        </div>

        {/* ── KPI row (6 cards) ──────────────────────── */}
        <div
          className="dashboard-kpi-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 10,
          }}
        >
          <KPI
            label="Devices online"
            value={stats ? String(stats.devices_online) : "—"}
            unit={stats ? `/ ${stats.devices_total}` : ""}
            spark={
              <Spark
                data={trafficSpark(trafficHistory, "sum").slice(-28)}
                width={120}
                height={26}
                color={T.statusOnline}
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
                color={T.statusInfo}
              />
            }
            accent={T.statusInfo}
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
                color={T.statusOnline}
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
                    ? T.statusOffline
                    : T.statusOnline
                }
              />
            }
            accent={
              stats && stats.alerts_unread > 0 ? T.statusOffline : undefined
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
                color={T.statusOnline}
              />
            }
            accent={T.statusOnline}
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
                color="var(--accent-violet)"
              />
            }
            accent="var(--accent-violet)"
          />
        </div>

        {/* ── Main grid: traffic + top talkers / topology + events ── */}
        <div
          className="dashboard-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 12,
          }}
        >
          {/* LEFT column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* WAN traffic card */}
            <div className="mesh-card" style={{ padding: "var(--card-pad)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 className="t-h3">WAN traffic</h3>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      font: "500 11px var(--font-mono)",
                      color: "var(--text-mute)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 2,
                          background: T.statusInfo,
                          borderRadius: 1,
                        }}
                      />{" "}
                      RX{" "}
                      <span style={{ color: "var(--text)" }}>
                        {stats ? bpsToMbps(stats.wan_rx_bps) : "—"}
                      </span>
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 2,
                          background: "var(--accent-violet)",
                          borderRadius: 1,
                        }}
                      />{" "}
                      TX{" "}
                      <span style={{ color: "var(--text)" }}>
                        {stats ? bpsToMbps(stats.wan_tx_bps) : "—"}
                      </span>
                    </span>
                    <span style={{ color: "var(--text-faint)" }}>Mbps</span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    background: "var(--surface-2)",
                    padding: 2,
                    borderRadius: "var(--radius-sm)",
                    border: `var(--hairline) solid ${T.border}`,
                  }}
                >
                  {(["1h", "6h", "24h", "7d"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTrafficRange(r)}
                      data-active={trafficRange === r ? "true" : "false"}
                      style={{
                        padding: "3px 8px",
                        font: "500 11px var(--font-mono)",
                        borderRadius: "var(--radius-xs)",
                        color: trafficRange === r ? "var(--text)" : "var(--text-mute)",
                        background: trafficRange === r ? "var(--surface-3)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
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
            <div className="mesh-card" style={{ padding: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px 10px",
                }}
              >
                <h3 className="t-h3">Top talkers · 24h</h3>
                <span
                  className="t-small mono"
                  style={{ color: "var(--text-mute)" }}
                >
                  {talkers ? `${talkers.length} of ${stats?.devices_total ?? "—"}` : "loading…"}
                </span>
              </div>
              <div style={{ borderTop: `var(--hairline) solid ${T.border}` }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1fr 80px 80px 1fr 60px",
                    padding: "7px 14px",
                    font: "500 10px var(--font-sans)",
                    color: "var(--text-mute)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    borderBottom: `var(--hairline) solid ${T.border}`,
                  }}
                >
                  <span>Device</span>
                  <span>IP</span>
                  <span style={{ textAlign: "right" }}>RX MB/s</span>
                  <span style={{ textAlign: "right" }}>TX MB/s</span>
                  <span>Trend</span>
                  <span style={{ textAlign: "right" }}>Mbps</span>
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
                  <p
                    className="px-4 py-6 text-center text-sm"
                    style={{ color: "var(--text-mute)" }}
                  >
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
                        data-testid="top-talker-row"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.4fr 1fr 80px 80px 1fr 60px",
                          padding: "8px 14px",
                          borderBottom:
                            i < talkers.length - 1
                              ? `var(--hairline) solid ${T.border}`
                              : "none",
                          alignItems: "center",
                          font: "400 12px var(--font-sans)",
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <StatusDot status="online" size={6} pulse={i === 0} />
                          <Link
                            href={`/devices?id=${d.id}`}
                            className="truncate"
                            style={{ color: "var(--text)" }}
                          >
                            {d.name || d.hostname || d.vendor || "Unknown"}
                          </Link>
                        </span>
                        <span
                          className="mono"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {d.ip ?? "—"}
                        </span>
                        <span
                          className="mono"
                          style={{ textAlign: "right", color: "var(--text)" }}
                        >
                          {rxMb}
                        </span>
                        <span
                          className="mono"
                          style={{ textAlign: "right", color: "var(--text-dim)" }}
                        >
                          {txMb}
                        </span>
                        <span>
                          <Spark
                            data={devicePlaceholderSpark(d.rx_bps + d.tx_bps)}
                            width={100}
                            height={18}
                            color={T.statusInfo}
                          />
                        </span>
                        <span
                          className="mono"
                          style={{ textAlign: "right", color: "var(--text)" }}
                        >
                          {mbps}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Topology card */}
            <div
              className="mesh-card"
              style={{
                padding: "var(--card-pad)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h3 className="t-h3">Topology</h3>
                <Link
                  href="/topology"
                  style={{
                    font: "500 11px var(--font-sans)",
                    color: T.primary,
                    textDecoration: "none",
                  }}
                >
                  open →
                </Link>
              </div>
              <div
                className="mesh-card-2"
                style={{
                  height: 220,
                  borderRadius: "var(--radius)",
                  padding: 10,
                }}
              >
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  font: "500 11px var(--font-mono)",
                  color: "var(--text-mute)",
                }}
              >
                <span>{subnetCount ?? "—"} subnets</span>
                <span>
                  {topology ? `${topology.devices.length} devices` : "— devices"}
                </span>
                <span>
                  {stats ? `${stats.devices_online} / ${stats.devices_total}` : "— / —"}
                </span>
              </div>
            </div>

            {/* Recent events */}
            <div className="mesh-card" style={{ padding: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px 10px",
                }}
              >
                <h3 className="t-h3">Recent events</h3>
                <span
                  className="t-small mono"
                  style={{ color: "var(--text-mute)" }}
                >
                  last 1h
                </span>
              </div>
              <div style={{ borderTop: `var(--hairline) solid ${T.border}` }}>
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
                  <p
                    className="px-4 py-6 text-center text-sm"
                    style={{ color: "var(--text-mute)" }}
                  >
                    No recent events — all clear.
                  </p>
                ) : (
                  events.slice(0, 6).map((e, i) => (
                    <div
                      key={e.id}
                      data-testid="recent-event-row"
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "9px 14px",
                        borderBottom:
                          i < Math.min(events.length, 6) - 1
                            ? `var(--hairline) solid ${T.border}`
                            : "none",
                        alignItems: "flex-start",
                        font: "400 12px var(--font-sans)",
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          color: "var(--text-faint)",
                          minWidth: 36,
                          fontSize: 11,
                        }}
                      >
                        {formatAlertTime(e.created_at)}
                      </span>
                      <span style={{ marginTop: 5 }}>
                        <SevDot severity={mapAlertSeverity(e.severity)} size={6} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: "var(--text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {e.message}
                        </div>
                        <div
                          className="mono"
                          style={{ color: "var(--text-mute)", fontSize: 10 }}
                        >
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
        <div className="mesh-card" style={{ padding: "var(--card-pad)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3 className="t-h3">Subnet utilization</h3>
            <span
              className="t-small mono"
              style={{ color: "var(--text-mute)" }}
            >
              capacity / 5min
            </span>
          </div>
          {/* TODO: backend gap — no per-subnet stats endpoint exists yet
              (no /api/v1/subnets/utilization). The cards below derive counts
              from topology IP groupings; capacity / mbps placeholders remain
              "—" until the endpoint lands. */}
          <SubnetUtilization topology={topology ?? null} devicesError={!!devicesError} />
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
      <div
        className="dashboard-subnet-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (subnets.length === 0) {
    return (
      <p
        className="py-4 text-center text-sm"
        style={{ color: "var(--text-mute)" }}
      >
        No subnet data yet — discover devices to populate this view.
      </p>
    );
  }

  return (
    <div
      className="dashboard-subnet-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 10,
      }}
    >
      {subnets.map((s) => {
        const high = s.util > 70;
        return (
          <div
            key={s.name}
            className="mesh-card-2"
            data-testid="subnet-card"
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span
                style={{
                  font: "600 13px var(--font-sans)",
                  color: "var(--text)",
                }}
              >
                {s.name}
              </span>
              <span
                className="mono"
                style={{ color: "var(--text-mute)", fontSize: 10 }}
              >
                {s.cidr}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: high ? T.statusWarning : "var(--text)",
                  lineHeight: 1,
                }}
              >
                {s.util}
              </span>
              <span
                className="t-small mono"
                style={{ color: "var(--text-mute)" }}
              >
                %
              </span>
              <span style={{ flex: 1 }} />
              <span
                className="mono"
                style={{ fontSize: 11, color: "var(--text-dim)" }}
              >
                {s.hosts} hosts
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "var(--surface-3)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${s.util}%`,
                  background: high ? T.statusWarning : T.primary,
                  borderRadius: 2,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                font: "500 10px var(--font-mono)",
                color: "var(--text-mute)",
              }}
            >
              <span>
                — Mbps
                {/* TODO: backend gap — per-subnet bandwidth */}
              </span>
              <Spark
                data={[s.util * 0.6, s.util * 0.8, s.util, s.util * 0.9, s.util * 1.05]}
                width={50}
                height={14}
                color="var(--accent-cyan)"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
