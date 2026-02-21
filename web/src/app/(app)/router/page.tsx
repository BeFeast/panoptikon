"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Network,
  Globe,
  Shield,
  Server,
  Loader2,
  AlertCircle,
  Settings,
  Gauge,
  ArrowDown,
  ArrowUp,
  Clock,
  AlertTriangle,
  ExternalLink,
  Activity,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  fetchRouterStatus,
  fetchRouterInterfaces,
  fetchRouterRoutes,
  fetchRouterDhcpLeases,
  fetchRouterFirewall,
  fetchRouterConfigInterfaces,
  runSpeedTest,
} from "@/lib/api";
import type { FirewallConfig, FirewallChain, RouterStatus, SpeedTestResult, VyosDhcpLease, VyosInterface, VyosRoute } from "@/lib/types";
import { Progress } from "@/components/ui/progress";

// ── Not Configured state ────────────────────────────────

function NotConfigured() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Router className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">
            Router Not Configured
          </h1>
          <p className="text-center text-sm text-slate-500">
            Connect to your VyOS router by adding its URL and API key in
            Settings.
          </p>
          <Link href="/settings">
            <Button
              variant="outline"
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Settings className="mr-2 h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Status Header ───────────────────────────────────────

function StatusHeader({ status }: { status: RouterStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Router className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Router</h1>
          <p className="text-xs text-slate-500">
            {status.hostname ?? "VyOS"}{" "}
            {status.version && (
              <span className="text-slate-600">· {status.version}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status.reachable ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            ● Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
          >
            ● Unreachable
          </Badge>
        )}
        {status.uptime && (
          <Badge
            variant="outline"
            className="border-slate-800 text-slate-400"
          >
            Uptime: {status.uptime}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Hook: fetch with loading/error ──────────────────────

function useAsyncData<T>(
  fetcher: () => Promise<T>,
  enabled: boolean
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      if (e instanceof Error && e.message.includes("503")) {
        setError("Router not configured");
      } else {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, [fetcher, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

// ── Speed Test Section ──────────────────────────────────

function SpeedTestSection() {
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleRunTest = async () => {
    setRunning(true);
    setError(null);
    setProgress(0);

    // Animate progress bar over ~60 seconds (Ookla speedtest takes 30–60s)
    const totalMs = 60000;
    const intervalMs = 100;
    const steps = totalMs / intervalMs;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      // Ease-out progress: fast at first, slows near end
      const pct = Math.min((step / steps) * 95, 95);
      setProgress(pct);
    }, intervalMs);

    try {
      const res = await runSpeedTest();
      setResult(res);
      setProgress(100);
    } catch (e) {
      if (e instanceof Error) {
        // Extract error message from API response if possible
        if (e.message.includes("429")) {
          setError("Rate limited — please wait 60 seconds between tests.");
        } else if (e.message.includes("503")) {
          setError("Speedtest CLI not available on the server.");
        } else {
          setError(e.message);
        }
      } else {
        setError("Speed test failed.");
      }
    } finally {
      clearInterval(timer);
      setRunning(false);
      // Reset progress after a brief pause showing 100%
      setTimeout(() => setProgress(0), 500);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs === 1) return "1 hour ago";
    return `${hrs} hours ago`;
  };

  return (
    <div className="space-y-4">
      {/* Action row */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 text-base font-medium text-white">
              <Gauge className="h-4 w-4 text-blue-400" />
              Speed Test
            </h3>
            <p className="text-xs text-slate-500">
              Measures internet speed from the Panoptikon server using Ookla
              Speedtest.
            </p>
          </div>
          <Button
            onClick={handleRunTest}
            disabled={running}
            className="shrink-0 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Gauge className="mr-2 h-4 w-4" />
                Run Speed Test
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Progress bar while running */}
      {running && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-center text-xs text-slate-500">
            Running speed test… this may take up to 60 seconds
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {/* Result cards */}
      {result && !running && (
        <div className="space-y-4">
          {/* Download + Upload */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Download */}
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
                  <ArrowDown className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Download</p>
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {result.download_mbps.toFixed(1)}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      Mbps
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Upload */}
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex items-center gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                  <ArrowUp className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Upload</p>
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {result.upload_mbps.toFixed(1)}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      Mbps
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ping, Jitter, Packet Loss */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex items-center gap-3 py-4">
                <Activity className="h-5 w-5 text-purple-400" />
                <div>
                  <p className="text-xs text-slate-500">Ping</p>
                  <p className="text-lg font-semibold tabular-nums text-white">
                    {result.ping_ms.toFixed(1)}{" "}
                    <span className="text-xs font-normal text-slate-500">ms</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex items-center gap-3 py-4">
                <Activity className="h-5 w-5 text-yellow-400" />
                <div>
                  <p className="text-xs text-slate-500">Jitter</p>
                  <p className="text-lg font-semibold tabular-nums text-white">
                    {result.jitter_ms.toFixed(2)}{" "}
                    <span className="text-xs font-normal text-slate-500">ms</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex items-center gap-3 py-4">
                <Wifi className="h-5 w-5 text-cyan-400" />
                <div>
                  <p className="text-xs text-slate-500">Packet Loss</p>
                  <p className="text-lg font-semibold tabular-nums text-white">
                    {result.packet_loss.toFixed(1)}
                    <span className="text-xs font-normal text-slate-500">%</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Metadata: ISP, Server, Tested at, Result link */}
          <div className="space-y-1 px-1">
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Globe className="h-3 w-3" />
              ISP: <span className="text-slate-400">{result.isp}</span>
            </p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Server className="h-3 w-3" />
              Server: <span className="text-slate-400">{result.server}</span>
            </p>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                Last tested: {timeAgo(result.tested_at)}
              </p>
              {result.result_url && (
                <a
                  href={result.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  View Result <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Traffic warning */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-400/80">
          Speed test measures WAN throughput using Ookla Speedtest. Tests are
          rate limited to once per 60 seconds.
        </p>
      </div>
    </div>
  );
}

// ── Interfaces Table ────────────────────────────────────

function StatusDot({ admin, link }: { admin: string; link: string }) {
  const isUp = admin === "up" && link === "up";
  const cls = isUp
    ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
    : "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`}
      title={`Admin: ${admin}, Link: ${link}`}
    />
  );
}

function StatusBadge({ admin, link }: { admin: string; link: string }) {
  const isUp = admin === "up" && link === "up";
  return (
    <Badge
      variant="outline"
      className={
        isUp
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
      }
    >
      {isUp ? "Up" : "Down"}
    </Badge>
  );
}

function InterfacesTable({
  interfaces,
  configData,
  loading,
  error,
}: {
  interfaces: VyosInterface[] | null;
  configData: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }
  if (!interfaces || interfaces.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">No interfaces found.</p>
    );
  }

  // Try to extract config info per interface type (e.g. ethernet.eth0, loopback.lo)
  const getConfigDescription = (name: string): string | null => {
    if (!configData) return null;
    // Config data is structured like { ethernet: { eth0: { ... } }, loopback: { lo: { ... } } }
    for (const [, typeConfig] of Object.entries(configData)) {
      if (typeConfig && typeof typeConfig === "object" && name in (typeConfig as Record<string, unknown>)) {
        const ifConfig = (typeConfig as Record<string, unknown>)[name] as Record<string, unknown> | undefined;
        if (ifConfig?.description && typeof ifConfig.description === "string") {
          return ifConfig.description;
        }
      }
    }
    return null;
  };

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950 text-left">
            <th className="px-4 py-3 font-medium text-slate-400">Status</th>
            <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
            <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
            <th className="px-4 py-3 font-medium text-slate-400">MAC</th>
            <th className="px-4 py-3 font-medium text-slate-400">MTU</th>
            <th className="px-4 py-3 font-medium text-slate-400">Description</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map((iface) => {
            const configDesc = getConfigDescription(iface.name);
            const description = iface.description || configDesc;
            return (
              <tr
                key={iface.name}
                className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusDot admin={iface.admin_state} link={iface.link_state} />
                    <StatusBadge admin={iface.admin_state} link={iface.link_state} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums font-medium text-white">
                    {iface.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-slate-300">
                    {iface.ip_address ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    {iface.mac ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-300">{iface.mtu}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-400">
                    {description ?? "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Protocol Badge ──────────────────────────────────────

const PROTOCOL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  C: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  S: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  K: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-gray-500/30" },
  L: { bg: "bg-teal-500/10", text: "text-teal-400", border: "border-teal-500/30" },
  O: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  B: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  R: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
  I: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/30" },
};

const PROTOCOL_NAMES: Record<string, string> = {
  K: "Kernel",
  C: "Connected",
  L: "Local",
  S: "Static",
  R: "RIP",
  O: "OSPF",
  I: "IS-IS",
  B: "BGP",
  E: "EIGRP",
  N: "NHRP",
};

function ProtocolBadge({ protocol }: { protocol: string }) {
  const colors = PROTOCOL_COLORS[protocol] ?? {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-gray-500/30",
  };
  const name = PROTOCOL_NAMES[protocol] ?? protocol;

  return (
    <Badge
      variant="outline"
      className={`${colors.bg} ${colors.text} ${colors.border} font-mono`}
      title={name}
    >
      {protocol}
    </Badge>
  );
}

// ── Routes Table ────────────────────────────────────────

function RoutesTable({
  routes,
  loading,
  error,
}: {
  routes: VyosRoute[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }
  if (!routes || routes.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">No routes found.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950 text-left">
            <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
            <th className="px-4 py-3 font-medium text-slate-400">Destination</th>
            <th className="px-4 py-3 font-medium text-slate-400">Gateway</th>
            <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
            <th className="px-4 py-3 font-medium text-slate-400">Metric</th>
            <th className="px-4 py-3 font-medium text-slate-400">Uptime</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route, idx) => (
            <tr
              key={`${route.destination}-${idx}`}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <ProtocolBadge protocol={route.protocol} />
                  {route.selected && (
                    <span className="text-xs text-emerald-500" title="Selected / Best route">
                      ✓
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {route.destination}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {route.gateway ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {route.interface ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {route.metric ? `[${route.metric}]` : "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400">
                  {route.uptime ?? "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DHCP State Badge ────────────────────────────────────

function DhcpStateBadge({ state }: { state: string }) {
  const lower = state.toLowerCase();
  if (lower === "active") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      >
        active
      </Badge>
    );
  }
  if (lower === "expired") {
    return (
      <Badge
        variant="outline"
        className="border-rose-500/30 bg-rose-500/10 text-rose-400"
      >
        expired
      </Badge>
    );
  }
  if (lower === "free") {
    return (
      <Badge
        variant="outline"
        className="border-gray-500/30 bg-slate-500/10 text-slate-400"
      >
        free
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-gray-500/30 bg-slate-500/10 text-slate-400"
    >
      {state}
    </Badge>
  );
}

// ── DHCP Leases Table ───────────────────────────────────

function DhcpLeasesTable({
  leases,
  loading,
  error,
}: {
  leases: VyosDhcpLease[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }
  if (!leases || leases.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No DHCP leases found. DHCP server may not be configured.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950 text-left">
            <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
            <th className="px-4 py-3 font-medium text-slate-400">MAC Address</th>
            <th className="px-4 py-3 font-medium text-slate-400">Hostname</th>
            <th className="px-4 py-3 font-medium text-slate-400">Pool</th>
            <th className="px-4 py-3 font-medium text-slate-400">Expires</th>
            <th className="px-4 py-3 font-medium text-slate-400">State</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((lease, idx) => (
            <tr
              key={`${lease.ip}-${idx}`}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {lease.ip}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {lease.mac}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">
                  {lease.hostname ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">
                  {lease.pool ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {lease.lease_expiry ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <DhcpStateBadge state={lease.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Firewall Action Badge ───────────────────────────────

function FirewallActionBadge({ action }: { action: string }) {
  const lower = action.toLowerCase();
  if (lower === "accept") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      >
        ACCEPT
      </Badge>
    );
  }
  if (lower === "drop") {
    return (
      <Badge
        variant="outline"
        className="border-rose-500/30 bg-rose-500/10 text-rose-400"
      >
        DROP
      </Badge>
    );
  }
  if (lower === "reject") {
    return (
      <Badge
        variant="outline"
        className="border-orange-500/30 bg-orange-500/10 text-orange-400"
      >
        REJECT
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-gray-500/30 bg-slate-500/10 text-slate-400"
    >
      {action.toUpperCase()}
    </Badge>
  );
}

function DefaultActionBadge({ action }: { action: string }) {
  const lower = action.toLowerCase();
  const colors =
    lower === "drop" || lower === "reject"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";

  return (
    <Badge variant="outline" className={colors}>
      Default: {action.toUpperCase()}
    </Badge>
  );
}

// ── Firewall Chain Card ─────────────────────────────────

function FirewallChainCard({ chain }: { chain: FirewallChain }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base text-white">{chain.name}</CardTitle>
          <DefaultActionBadge action={chain.default_action} />
        </div>
      </CardHeader>
      <CardContent>
        {chain.rules.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">
            No rules in this chain.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">#</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Action</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Source</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Destination</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Description</th>
                </tr>
              </thead>
              <tbody>
                {chain.rules.map((rule) => (
                  <tr
                    key={rule.number}
                    className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono tabular-nums text-slate-300">{rule.number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <FirewallActionBadge action={rule.action} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono tabular-nums text-xs text-slate-300">
                        {rule.source ?? "any"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono tabular-nums text-xs text-slate-300">
                        {rule.destination ?? "any"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">
                        {rule.protocol ?? "any"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-400">
                        {rule.description ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Firewall Panel ──────────────────────────────────────

function FirewallPanel({
  config,
  loading,
  error,
}: {
  config: FirewallConfig | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }
  if (!config || config.chains.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Shield className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-500">No firewall rules configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {config.chains.map((chain) => (
        <FirewallChainCard key={chain.name} chain={chain} />
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────

export default function RouterPage() {
  const [status, setStatus] = useState<RouterStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    fetchRouterStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          configured: false,
          reachable: false,
          version: null,
          uptime: null,
          hostname: null,
        })
      )
      .finally(() => setStatusLoading(false));
  }, []);

  if (statusLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status?.configured) {
    return <NotConfigured />;
  }

  return <RouterTabs status={status} />;
}

// ── Tabs component (only rendered when configured) ──────

function RouterTabs({ status }: { status: RouterStatus }) {
  const [tab, setTab] = useState("interfaces");

  const interfaces = useAsyncData<VyosInterface[]>(
    useCallback(() => fetchRouterInterfaces(), []),
    tab === "interfaces"
  );

  const configIfaces = useAsyncData<Record<string, unknown>>(
    useCallback(() => fetchRouterConfigInterfaces(), []),
    tab === "interfaces"
  );

  const routes = useAsyncData<VyosRoute[]>(
    useCallback(() => fetchRouterRoutes(), []),
    tab === "routes"
  );

  const dhcp = useAsyncData<VyosDhcpLease[]>(
    useCallback(() => fetchRouterDhcpLeases(), []),
    tab === "dhcp"
  );

  const firewall = useAsyncData<FirewallConfig>(
    useCallback(() => fetchRouterFirewall(), []),
    tab === "firewall"
  );

  return (
    <div className="space-y-6">
      <StatusHeader status={status} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="border-slate-800 bg-slate-950">
          <TabsTrigger
            value="interfaces"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Network className="mr-1.5 h-3.5 w-3.5" />
            Interfaces
          </TabsTrigger>
          <TabsTrigger
            value="routes"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            Routes
          </TabsTrigger>
          <TabsTrigger
            value="dhcp"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Server className="mr-1.5 h-3.5 w-3.5" />
            DHCP Leases
          </TabsTrigger>
          <TabsTrigger
            value="firewall"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Firewall
          </TabsTrigger>
          <TabsTrigger
            value="speedtest"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Gauge className="mr-1.5 h-3.5 w-3.5" />
            Speed Test
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interfaces" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Network Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InterfacesTable
                interfaces={
                  Array.isArray(interfaces.data) ? interfaces.data : null
                }
                configData={
                  configIfaces.data &&
                  typeof configIfaces.data === "object"
                    ? configIfaces.data
                    : null
                }
                loading={interfaces.loading}
                error={interfaces.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Routing Table
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RoutesTable
                routes={Array.isArray(routes.data) ? routes.data : null}
                loading={routes.loading}
                error={routes.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dhcp">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DHCP Server Leases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DhcpLeasesTable
                leases={Array.isArray(dhcp.data) ? dhcp.data : null}
                loading={dhcp.loading}
                error={dhcp.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall">
          <FirewallPanel
            config={firewall.data}
            loading={firewall.loading}
            error={firewall.error}
          />
        </TabsContent>

        <TabsContent value="speedtest">
          <SpeedTestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
