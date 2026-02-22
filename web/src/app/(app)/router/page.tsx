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
  Plus,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  fetchRouterStatus,
  fetchRouterInterfaces,
  fetchRouterRoutes,
  fetchRouterDhcpLeases,
  fetchRouterFirewall,
  fetchRouterConfigInterfaces,
  runSpeedTest,
  toggleInterface,
  fetchDhcpStaticMappings,
  createDhcpStaticMapping,
  deleteDhcpStaticMapping,
  fetchNatDestinationRules,
  createNatDestinationRule,
  deleteNatDestinationRule,
} from "@/lib/api";
import type { FirewallConfig, FirewallChain, RouterStatus, SpeedTestResult, VyosDhcpLease, VyosInterface, VyosRoute, DhcpStaticMapping, NatDestinationRule } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { PageTransition } from "@/components/PageTransition";

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
        } else if (e.message.includes("502")) {
          setError("Speed test failed — the server could not complete the test. Check server logs for details.");
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
  onReload,
}: {
  interfaces: VyosInterface[] | null;
  configData: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [confirmToggle, setConfirmToggle] = useState<{
    iface: VyosInterface;
    disable: boolean;
  } | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async () => {
    if (!confirmToggle) return;
    const { iface, disable } = confirmToggle;
    setConfirmToggle(null);
    setToggling(iface.name);
    try {
      const res = await toggleInterface(iface.name, disable);
      toast.success(res.message);
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Toggle failed";
      toast.error(msg);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
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
              <th className="px-4 py-3 font-medium text-slate-400">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Skeleton className="h-2.5 w-2.5 rounded-full" /><Skeleton className="h-5 w-10 rounded-full" /></div></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-10" /></td>
              </tr>
            ))}
          </tbody>
        </table>
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

  // Check if an interface has the "disable" flag in config
  const isDisabledInConfig = (name: string): boolean => {
    if (!configData) return false;
    for (const [, typeConfig] of Object.entries(configData)) {
      if (typeConfig && typeof typeConfig === "object" && name in (typeConfig as Record<string, unknown>)) {
        const ifConfig = (typeConfig as Record<string, unknown>)[name] as Record<string, unknown> | undefined;
        if (ifConfig && "disable" in ifConfig) {
          return true;
        }
      }
    }
    return false;
  };

  // Loopback interfaces shouldn't be toggled
  const canToggle = (name: string) => name !== "lo";

  return (
    <>
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
              <th className="px-4 py-3 font-medium text-slate-400">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((iface) => {
              const configDesc = getConfigDescription(iface.name);
              const description = iface.description || configDesc;
              const isAdminDown = iface.admin_state === "admin-down" || isDisabledInConfig(iface.name);
              const isEnabled = !isAdminDown;
              const isToggling = toggling === iface.name;
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
                  <td className="px-4 py-3">
                    {canToggle(iface.name) ? (
                      <div className="flex items-center gap-2">
                        {isToggling ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => {
                              setConfirmToggle({
                                iface,
                                disable: !checked,
                              });
                            }}
                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-700"
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Interface toggle confirmation dialog */}
      <AlertDialog
        open={confirmToggle !== null}
        onOpenChange={(open) => { if (!open) setConfirmToggle(null); }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {confirmToggle?.disable ? "Disable" : "Enable"} Interface
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {confirmToggle?.disable ? (
                <>
                  This will disable <span className="font-mono font-medium text-white">{confirmToggle?.iface.name}</span> on the router.
                  Any traffic on this interface will stop.
                </>
              ) : (
                <>
                  This will enable <span className="font-mono font-medium text-white">{confirmToggle?.iface.name}</span> on the router.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs font-medium text-slate-500">Config change:</p>
            <code className="mt-1 block text-xs text-blue-400">
              {confirmToggle?.disable
                ? `set interfaces ethernet ${confirmToggle?.iface.name} disable`
                : `delete interfaces ethernet ${confirmToggle?.iface.name} disable`}
            </code>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggle}
              className={
                confirmToggle?.disable
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
            >
              {confirmToggle?.disable ? "Disable" : "Enable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><Skeleton className="h-5 w-8 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-10" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
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
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
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

// ── DHCP Static Mappings ────────────────────────────────

function StaticMappingsTable({
  mappings,
  loading,
  error,
  onReload,
}: {
  mappings: DhcpStaticMapping[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<DhcpStaticMapping | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    network: "LAN",
    subnet: "",
    name: "",
    mac: "",
    ip: "",
  });
  const [adding, setAdding] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { network, subnet, name } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(name);
    try {
      await deleteDhcpStaticMapping(network, subnet, name);
      toast.success(`Static mapping '${name}' deleted`);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleAdd = async () => {
    if (!addForm.name || !addForm.mac || !addForm.ip || !addForm.network || !addForm.subnet) {
      toast.error("All fields are required");
      return;
    }
    setAdding(true);
    try {
      const res = await createDhcpStaticMapping(addForm);
      toast.success(res.message);
      setShowAdd(false);
      setAddForm({ network: "LAN", subnet: "", name: "", mac: "", ip: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setAdding(false);
    }
  };

  // Pre-fill subnet from existing mappings
  useEffect(() => {
    if (mappings && mappings.length > 0 && !addForm.subnet) {
      setAddForm((prev) => ({
        ...prev,
        network: mappings[0].network,
        subnet: mappings[0].subnet,
      }));
    }
  }, [mappings, addForm.subnet]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Static Mappings</h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Static Mapping
            </Button>
          </DialogTrigger>
          <DialogContent className="border-slate-800 bg-slate-900">
            <DialogHeader>
              <DialogTitle className="text-white">Add DHCP Static Mapping</DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a fixed IP assignment for a MAC address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Network Name</Label>
                  <Input
                    value={addForm.network}
                    onChange={(e) => setAddForm({ ...addForm, network: e.target.value })}
                    placeholder="LAN"
                    className="border-slate-800 bg-slate-950 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Subnet</Label>
                  <Input
                    value={addForm.subnet}
                    onChange={(e) => setAddForm({ ...addForm, subnet: e.target.value })}
                    placeholder="10.10.0.0/24"
                    className="border-slate-800 bg-slate-950 text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Hostname / Name</Label>
                <Input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="my-device"
                  className="border-slate-800 bg-slate-950 text-white"
                />
                <p className="text-xs text-slate-500">
                  Alphanumeric, hyphens, and underscores only.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">MAC Address</Label>
                <Input
                  value={addForm.mac}
                  onChange={(e) => setAddForm({ ...addForm, mac: e.target.value })}
                  placeholder="aa:bb:cc:dd:ee:ff"
                  className="border-slate-800 bg-slate-950 font-mono text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">IP Address</Label>
                <Input
                  value={addForm.ip}
                  onChange={(e) => setAddForm({ ...addForm, ip: e.target.value })}
                  placeholder="10.10.0.100"
                  className="border-slate-800 bg-slate-950 font-mono text-white"
                />
              </div>
              {/* Config diff preview */}
              {addForm.name && addForm.mac && addForm.ip && (
                <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs font-medium text-slate-500">Config change:</p>
                  <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                    {`set service dhcp-server shared-network-name ${addForm.network} subnet ${addForm.subnet} static-mapping ${addForm.name} mac-address ${addForm.mac}\nset service dhcp-server shared-network-name ${addForm.network} subnet ${addForm.subnet} static-mapping ${addForm.name} ip-address ${addForm.ip}`}
                  </code>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={adding}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {adding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Mapping"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                <th className="px-4 py-3 font-medium text-slate-400">MAC Address</th>
                <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
                <th className="px-4 py-3 font-medium text-slate-400">Network</th>
                <th className="px-4 py-3 font-medium text-slate-400">Subnet</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-8" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      ) : !mappings || mappings.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          No static mappings configured.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                <th className="px-4 py-3 font-medium text-slate-400">MAC Address</th>
                <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
                <th className="px-4 py-3 font-medium text-slate-400">Network</th>
                <th className="px-4 py-3 font-medium text-slate-400">Subnet</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr
                  key={`${m.network}-${m.subnet}-${m.name}`}
                  className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{m.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-xs text-slate-400">
                      {m.mac}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">
                      {m.ip}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-300">{m.network}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-xs text-slate-400">
                      {m.subnet}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {deleting === m.name ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(m)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Static Mapping
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove the static mapping{" "}
              <span className="font-mono font-medium text-white">
                {confirmDelete?.name}
              </span>{" "}
              ({confirmDelete?.mac} → {confirmDelete?.ip}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs font-medium text-slate-500">Config change:</p>
            <code className="mt-1 block whitespace-pre-wrap text-xs text-rose-400">
              {confirmDelete &&
                `delete service dhcp-server shared-network-name ${confirmDelete.network} subnet ${confirmDelete.subnet} static-mapping ${confirmDelete.name}`}
            </code>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── NAT Port Forwarding Table ────────────────────────────

function NatPortForwardTable({
  rules,
  interfaces,
  loading,
  error,
  onReload,
}: {
  rules: NatDestinationRule[] | null;
  interfaces: VyosInterface[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<NatDestinationRule | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    rule: "",
    description: "",
    inbound_interface: "",
    external_port: "",
    protocol: "tcp",
    internal_ip: "",
    internal_port: "",
  });
  const [adding, setAdding] = useState(false);

  // Auto-suggest next rule number
  useEffect(() => {
    if (rules && rules.length > 0 && !addForm.rule) {
      const maxRule = Math.max(...rules.map((r) => r.rule));
      const next = Math.ceil((maxRule + 10) / 10) * 10;
      setAddForm((prev) => ({ ...prev, rule: String(next) }));
    } else if ((!rules || rules.length === 0) && !addForm.rule) {
      setAddForm((prev) => ({ ...prev, rule: "10" }));
    }
  }, [rules, addForm.rule]);

  // Pre-fill interface from first available
  useEffect(() => {
    if (interfaces && interfaces.length > 0 && !addForm.inbound_interface) {
      const first = interfaces.find((i) => i.name.startsWith("eth")) ?? interfaces[0];
      setAddForm((prev) => ({ ...prev, inbound_interface: first.name }));
    }
  }, [interfaces, addForm.inbound_interface]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { rule } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(rule);
    try {
      await deleteNatDestinationRule(rule);
      toast.success(`Port forward rule ${rule} deleted`);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleAdd = async () => {
    const ruleNum = parseInt(addForm.rule, 10);
    if (!ruleNum || !addForm.description || !addForm.inbound_interface || !addForm.external_port || !addForm.internal_ip) {
      toast.error("Description, interface, external port, and internal IP are required");
      return;
    }
    setAdding(true);
    try {
      const res = await createNatDestinationRule({
        rule: ruleNum,
        description: addForm.description,
        inbound_interface: addForm.inbound_interface,
        external_port: addForm.external_port,
        protocol: addForm.protocol,
        internal_ip: addForm.internal_ip,
        internal_port: addForm.internal_port || undefined,
      });
      toast.success(res.message);
      setShowAdd(false);
      setAddForm({
        rule: "",
        description: "",
        inbound_interface: "",
        external_port: "",
        protocol: "tcp",
        internal_ip: "",
        internal_port: "",
      });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setAdding(false);
    }
  };

  const protocolLabel = (p: string | null) => {
    if (!p) return "—";
    return p.toUpperCase().replace("_", "+");
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Port Forwarding Rules</h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Port Forward
            </Button>
          </DialogTrigger>
          <DialogContent className="border-slate-800 bg-slate-900">
            <DialogHeader>
              <DialogTitle className="text-white">Add Port Forward</DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a destination NAT rule to forward external traffic to an internal host.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Rule Number</Label>
                  <Input
                    type="number"
                    value={addForm.rule}
                    onChange={(e) => setAddForm({ ...addForm, rule: e.target.value })}
                    placeholder="10"
                    className="border-slate-800 bg-slate-950 font-mono text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Protocol</Label>
                  <select
                    value={addForm.protocol}
                    onChange={(e) => setAddForm({ ...addForm, protocol: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="tcp_udp">TCP+UDP</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Home Assistant"
                  className="border-slate-800 bg-slate-950 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Inbound Interface</Label>
                {interfaces && interfaces.length > 0 ? (
                  <select
                    value={addForm.inbound_interface}
                    onChange={(e) => setAddForm({ ...addForm, inbound_interface: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm"
                  >
                    {interfaces.map((iface) => (
                      <option key={iface.name} value={iface.name}>
                        {iface.name}{iface.description ? ` (${iface.description})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={addForm.inbound_interface}
                    onChange={(e) => setAddForm({ ...addForm, inbound_interface: e.target.value })}
                    placeholder="eth0"
                    className="border-slate-800 bg-slate-950 font-mono text-white"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">External Port</Label>
                  <Input
                    value={addForm.external_port}
                    onChange={(e) => setAddForm({ ...addForm, external_port: e.target.value })}
                    placeholder="8123"
                    className="border-slate-800 bg-slate-950 font-mono text-white"
                  />
                  <p className="text-xs text-slate-500">Port or range (e.g. 8000-8100)</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Internal Port</Label>
                  <Input
                    value={addForm.internal_port}
                    onChange={(e) => setAddForm({ ...addForm, internal_port: e.target.value })}
                    placeholder={addForm.external_port || "same as external"}
                    className="border-slate-800 bg-slate-950 font-mono text-white"
                  />
                  <p className="text-xs text-slate-500">Defaults to external port</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Internal IP</Label>
                <Input
                  value={addForm.internal_ip}
                  onChange={(e) => setAddForm({ ...addForm, internal_ip: e.target.value })}
                  placeholder="192.168.1.10"
                  className="border-slate-800 bg-slate-950 font-mono text-white"
                />
              </div>
              {/* Config diff preview */}
              {addForm.description && addForm.external_port && addForm.internal_ip && (
                <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs font-medium text-slate-500">Config change:</p>
                  <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                    {[
                      `set nat destination rule ${addForm.rule} description '${addForm.description}'`,
                      `set nat destination rule ${addForm.rule} inbound-interface name ${addForm.inbound_interface}`,
                      `set nat destination rule ${addForm.rule} destination port ${addForm.external_port}`,
                      `set nat destination rule ${addForm.rule} protocol ${addForm.protocol}`,
                      `set nat destination rule ${addForm.rule} translation address ${addForm.internal_ip}`,
                      `set nat destination rule ${addForm.rule} translation port ${addForm.internal_port || addForm.external_port}`,
                    ].join("\n")}
                  </code>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={adding}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {adding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Rule"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">#</th>
                <th className="px-4 py-3 font-medium text-slate-400">Description</th>
                <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
                <th className="px-4 py-3 font-medium text-slate-400">External Port</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
                <th className="px-4 py-3 font-medium text-slate-400">Internal IP:Port</th>
                <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-12 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-8" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      ) : !rules || rules.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          No port forwarding rules configured.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">#</th>
                <th className="px-4 py-3 font-medium text-slate-400">Description</th>
                <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
                <th className="px-4 py-3 font-medium text-slate-400">External Port</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
                <th className="px-4 py-3 font-medium text-slate-400">Internal IP:Port</th>
                <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                <th className="px-4 py-3 font-medium text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.rule}
                  className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">{rule.rule}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{rule.description ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">{rule.inbound_interface ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">{rule.external_port ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600">&rarr;</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">
                      {rule.internal_ip ?? "—"}
                      {rule.internal_port ? `:${rule.internal_port}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className="border-blue-500/30 bg-blue-500/10 text-blue-400"
                    >
                      {protocolLabel(rule.protocol)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {deleting === rule.rule ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(rule)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Port Forward Rule
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove rule{" "}
              <span className="font-mono font-medium text-white">
                {confirmDelete?.rule}
              </span>{" "}
              ({confirmDelete?.description ?? "unnamed"}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs font-medium text-slate-500">Config change:</p>
            <code className="mt-1 block whitespace-pre-wrap text-xs text-rose-400">
              {confirmDelete &&
                `delete nat destination rule ${confirmDelete.rule}`}
            </code>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, ci) => (
          <Card key={ci} className="border-slate-800 bg-slate-900">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </CardHeader>
            <CardContent>
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
                    {Array.from({ length: 3 }).map((_, ri) => (
                      <tr key={ri} className="border-b border-slate-800 last:border-b-0">
                        <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
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
    return <PageTransition><NotConfigured /></PageTransition>;
  }

  return <PageTransition><RouterTabs status={status} /></PageTransition>;
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

  const staticMappings = useAsyncData<DhcpStaticMapping[]>(
    useCallback(() => fetchDhcpStaticMappings(), []),
    tab === "dhcp"
  );

  const natRules = useAsyncData<NatDestinationRule[]>(
    useCallback(() => fetchNatDestinationRules(), []),
    tab === "nat"
  );

  const natInterfaces = useAsyncData<VyosInterface[]>(
    useCallback(() => fetchRouterInterfaces(), []),
    tab === "nat"
  );

  const firewall = useAsyncData<FirewallConfig>(
    useCallback(() => fetchRouterFirewall(), []),
    tab === "firewall"
  );

  const reloadInterfaces = useCallback(() => {
    interfaces.reload();
    configIfaces.reload();
  }, [interfaces, configIfaces]);

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
            DHCP
          </TabsTrigger>
          <TabsTrigger
            value="nat"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
            NAT
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
                onReload={reloadInterfaces}
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

        <TabsContent value="dhcp" className="space-y-4">
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

          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DHCP Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StaticMappingsTable
                mappings={Array.isArray(staticMappings.data) ? staticMappings.data : null}
                loading={staticMappings.loading}
                error={staticMappings.error}
                onReload={staticMappings.reload}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nat">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Port Forwarding (Destination NAT)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NatPortForwardTable
                rules={Array.isArray(natRules.data) ? natRules.data : null}
                interfaces={Array.isArray(natInterfaces.data) ? natInterfaces.data : null}
                loading={natRules.loading}
                error={natRules.error}
                onReload={natRules.reload}
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
