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
  Pencil,
  Power,
  Ban,
  Layers,
  X,
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
  createFirewallRule,
  updateFirewallRule,
  deleteFirewallRule,
  toggleFirewallRule,
  fetchFirewallGroups,
  createStaticRoute,
  deleteStaticRoute,
  createAddressGroup,
  deleteAddressGroup,
  addAddressGroupMember,
  removeAddressGroupMember,
  createNetworkGroup,
  deleteNetworkGroup,
  addNetworkGroupMember,
  removeNetworkGroupMember,
  createPortGroup,
  deletePortGroup,
  addPortGroupMember,
  removePortGroupMember,
} from "@/lib/api";
import type { FirewallConfig, FirewallChain, FirewallRule, FirewallRuleRequest, FirewallGroups, RouterStatus, SpeedTestResult, VyosDhcpLease, VyosInterface, VyosRoute, DhcpStaticMapping } from "@/lib/types";
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
  onReload,
}: {
  routes: VyosRoute[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<VyosRoute | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await deleteStaticRoute(confirmDelete.destination);
      toast.success(res.message);
      setConfirmDelete(null);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete route");
    } finally {
      setDeleting(false);
    }
  }

  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
      <th className="px-4 py-3 font-medium text-slate-400">Destination</th>
      <th className="px-4 py-3 font-medium text-slate-400">Gateway</th>
      <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
      <th className="px-4 py-3 font-medium text-slate-400">Metric</th>
      <th className="px-4 py-3 font-medium text-slate-400">Uptime</th>
      <th className="px-4 py-3 font-medium text-slate-400 w-16"></th>
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><Skeleton className="h-5 w-8 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-10" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"></td>
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
    <>
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
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
                <td className="px-4 py-3">
                  {route.protocol === "S" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title="Delete static route"
                      onClick={() => setConfirmDelete(route)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Static Route</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete the static route to{" "}
              <span className="font-mono font-medium text-white">{confirmDelete?.destination}</span>
              {confirmDelete?.gateway && (
                <>
                  {" "}via <span className="font-mono font-medium text-white">{confirmDelete.gateway}</span>
                </>
              )}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Add Static Route Dialog ─────────────────────────────

function AddStaticRouteDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [destination, setDestination] = useState("");
  const [nextHop, setNextHop] = useState("");
  const [distance, setDistance] = useState("");
  const [description, setDescription] = useState("");
  const [blackhole, setBlackhole] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setDestination("");
    setNextHop("");
    setDistance("");
    setDescription("");
    setBlackhole(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: {
        destination: string;
        next_hop?: string;
        distance?: number;
        description?: string;
        blackhole?: boolean;
      } = { destination };

      if (blackhole) {
        body.blackhole = true;
      } else {
        body.next_hop = nextHop;
      }

      if (distance) {
        body.distance = parseInt(distance, 10);
      }
      if (description.trim()) {
        body.description = description.trim();
      }

      const res = await createStaticRoute(body);
      toast.success(res.message);
      reset();
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create route");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Static Route</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new static route on the router.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sr-dest" className="text-slate-300">
              Destination CIDR <span className="text-rose-400">*</span>
            </Label>
            <Input
              id="sr-dest"
              placeholder="10.0.0.0/8"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="border-slate-700 bg-slate-800 font-mono text-white"
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="sr-blackhole"
              type="checkbox"
              checked={blackhole}
              onChange={(e) => setBlackhole(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
            />
            <Label htmlFor="sr-blackhole" className="text-slate-300 cursor-pointer">
              Blackhole (null route — drops traffic)
            </Label>
          </div>

          {!blackhole && (
            <div className="space-y-2">
              <Label htmlFor="sr-nexthop" className="text-slate-300">
                Next-hop IP <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="sr-nexthop"
                placeholder="192.168.1.1"
                value={nextHop}
                onChange={(e) => setNextHop(e.target.value)}
                className="border-slate-700 bg-slate-800 font-mono text-white"
                required={!blackhole}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sr-distance" className="text-slate-300">
              Admin Distance <span className="text-slate-500 text-xs">(optional, 0–255)</span>
            </Label>
            <Input
              id="sr-distance"
              type="number"
              min={0}
              max={255}
              placeholder="1"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="border-slate-700 bg-slate-800 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sr-desc" className="text-slate-300">
              Description <span className="text-slate-500 text-xs">(optional)</span>
            </Label>
            <Input
              id="sr-desc"
              placeholder="Route description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-slate-700 bg-slate-800 text-white"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 text-white hover:bg-blue-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Route
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStaticRouteButton({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        className="bg-blue-600 text-white hover:bg-blue-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Static Route
      </Button>
      <AddStaticRouteDialog open={open} onOpenChange={setOpen} onSaved={onSaved} />
    </>
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

// ── Firewall Rule Form Helpers ───────────────────────────

const EMPTY_RULE_FORM: FirewallRuleRequest = {
  number: 0,
  action: "drop",
  protocol: undefined,
  source_address: undefined,
  source_port: undefined,
  destination_address: undefined,
  destination_port: undefined,
  description: undefined,
  state: undefined,
  disabled: false,
};

const STATE_OPTIONS = ["new", "established", "related", "invalid"] as const;

/** Build VyOS config preview lines for a rule request. */
function buildConfigPreview(chainPath: string[], rule: FirewallRuleRequest): string[] {
  const prefix = `firewall ${chainPath.join(" ")} rule ${rule.number}`;
  const lines: string[] = [];
  lines.push(`set ${prefix} action ${rule.action}`);
  if (rule.protocol) lines.push(`set ${prefix} protocol ${rule.protocol}`);
  if (rule.source_address) lines.push(`set ${prefix} source address ${rule.source_address}`);
  if (rule.source_port) lines.push(`set ${prefix} source port ${rule.source_port}`);
  if (rule.destination_address) lines.push(`set ${prefix} destination address ${rule.destination_address}`);
  if (rule.destination_port) lines.push(`set ${prefix} destination port ${rule.destination_port}`);
  if (rule.description) lines.push(`set ${prefix} description "${rule.description}"`);
  if (rule.state?.length) {
    for (const s of rule.state) lines.push(`set ${prefix} state ${s} enable`);
  }
  if (rule.disabled) lines.push(`set ${prefix} disable`);
  return lines;
}

/** Styled native select matching the dark theme. */
const selectClass = "h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500";

// ── Firewall Rule Dialog (Create / Edit) ─────────────────

function FirewallRuleDialog({
  chain,
  editRule,
  open,
  onOpenChange,
  onSaved,
}: {
  chain: FirewallChain;
  editRule: FirewallRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = editRule !== null;
  const nextNumber = chain.rules.length > 0
    ? Math.max(...chain.rules.map((r) => r.number)) + 10
    : 10;

  const [form, setForm] = useState<FirewallRuleRequest>({ ...EMPTY_RULE_FORM, number: nextNumber });
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editRule) {
      setForm({
        number: editRule.number,
        action: editRule.action,
        protocol: editRule.protocol ?? undefined,
        source_address: undefined, // can't reverse the formatted display back to raw
        source_port: undefined,
        destination_address: undefined,
        destination_port: undefined,
        description: editRule.description ?? undefined,
        state: editRule.state ? editRule.state.split(", ").filter(Boolean) : undefined,
        disabled: editRule.disabled,
      });
    } else {
      setForm({ ...EMPTY_RULE_FORM, number: nextNumber });
    }
  }, [open, editRule, nextNumber]);

  const handleSave = async () => {
    if (form.number <= 0) {
      toast.error("Rule number must be positive");
      return;
    }
    setSaving(true);
    try {
      // Strip empty optional fields
      const body: FirewallRuleRequest = {
        ...form,
        protocol: form.protocol || undefined,
        source_address: form.source_address || undefined,
        source_port: form.source_port || undefined,
        destination_address: form.destination_address || undefined,
        destination_port: form.destination_port || undefined,
        description: form.description || undefined,
        state: form.state?.length ? form.state : undefined,
      };
      const res = isEdit
        ? await updateFirewallRule(chain, editRule!.number, body)
        : await createFirewallRule(chain, body);
      toast.success(res.message);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleState = (s: string) => {
    const current = form.state ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    setForm({ ...form, state: next });
  };

  const showPorts = form.protocol === "tcp" || form.protocol === "udp" || form.protocol === "tcp_udp";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? `Edit Rule ${editRule!.number}` : "Add Firewall Rule"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isEdit ? `Update rule in ${chain.name}.` : `Add a new rule to ${chain.name}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Row: Rule number + Action */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Rule Number</Label>
              <Input
                type="number"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: parseInt(e.target.value) || 0 })}
                disabled={isEdit}
                className="border-slate-800 bg-slate-950 font-mono text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Action</Label>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
                className={selectClass}
              >
                <option value="accept">accept</option>
                <option value="drop">drop</option>
                <option value="reject">reject</option>
              </select>
            </div>
          </div>

          {/* Protocol */}
          <div className="space-y-2">
            <Label className="text-slate-300">Protocol</Label>
            <select
              value={form.protocol ?? ""}
              onChange={(e) => setForm({ ...form, protocol: e.target.value || undefined })}
              className={selectClass}
            >
              <option value="">any</option>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="tcp_udp">tcp_udp</option>
              <option value="icmp">icmp</option>
            </select>
          </div>

          {/* Source */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Source Address / CIDR</Label>
              <Input
                value={form.source_address ?? ""}
                onChange={(e) => setForm({ ...form, source_address: e.target.value || undefined })}
                placeholder="e.g. 10.0.0.0/8"
                className="border-slate-800 bg-slate-950 font-mono text-white"
              />
            </div>
            {showPorts && (
              <div className="space-y-2">
                <Label className="text-slate-300">Source Port</Label>
                <Input
                  value={form.source_port ?? ""}
                  onChange={(e) => setForm({ ...form, source_port: e.target.value || undefined })}
                  placeholder="e.g. 1024-65535"
                  className="border-slate-800 bg-slate-950 font-mono text-white"
                />
              </div>
            )}
          </div>

          {/* Destination */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Destination Address / CIDR</Label>
              <Input
                value={form.destination_address ?? ""}
                onChange={(e) => setForm({ ...form, destination_address: e.target.value || undefined })}
                placeholder="e.g. 192.168.1.0/24"
                className="border-slate-800 bg-slate-950 font-mono text-white"
              />
            </div>
            {showPorts && (
              <div className="space-y-2">
                <Label className="text-slate-300">Destination Port</Label>
                <Input
                  value={form.destination_port ?? ""}
                  onChange={(e) => setForm({ ...form, destination_port: e.target.value || undefined })}
                  placeholder="e.g. 443"
                  className="border-slate-800 bg-slate-950 font-mono text-white"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-slate-300">Description</Label>
            <Input
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
              placeholder="Allow HTTPS from LAN"
              className="border-slate-800 bg-slate-950 text-white"
            />
          </div>

          {/* State checkboxes */}
          <div className="space-y-2">
            <Label className="text-slate-300">Connection State</Label>
            <div className="flex flex-wrap gap-3">
              {STATE_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.state?.includes(s) ?? false}
                    onChange={() => toggleState(s)}
                    className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Disable toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={form.disabled}
              onCheckedChange={(checked) => setForm({ ...form, disabled: checked })}
              className="data-[state=checked]:bg-rose-600 data-[state=unchecked]:bg-slate-700"
            />
            <Label className="text-slate-300">Disabled (rule exists but is inactive)</Label>
          </div>

          {/* Config diff preview */}
          {form.number > 0 && (
            <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs font-medium text-slate-500">Config change:</p>
              <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                {buildConfigPreview(chain.path, form).join("\n")}
              </code>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              "Update Rule"
            ) : (
              "Create Rule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Firewall Chain Card ─────────────────────────────────

function FirewallChainCard({
  chain,
  onReload,
}: {
  chain: FirewallChain;
  onReload: () => void;
}) {
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editRule, setEditRule] = useState<FirewallRule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FirewallRule | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const num = confirmDelete.number;
    setConfirmDelete(null);
    setDeleting(num);
    try {
      const res = await deleteFirewallRule(chain, num);
      toast.success(res.message);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (rule: FirewallRule) => {
    setToggling(rule.number);
    try {
      const res = await toggleFirewallRule(chain, rule.number, !rule.disabled);
      toast.success(res.message);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  const openEdit = (rule: FirewallRule) => {
    setEditRule(rule);
    setShowRuleDialog(true);
  };

  const openCreate = () => {
    setEditRule(null);
    setShowRuleDialog(true);
  };

  return (
    <>
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base text-white">{chain.name}</CardTitle>
              <DefaultActionBadge action={chain.default_action} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openCreate}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Rule
            </Button>
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
                    <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.rules.map((rule) => (
                    <tr
                      key={rule.number}
                      className={`border-b border-slate-800 last:border-b-0 transition-colors ${
                        rule.disabled ? "opacity-50" : "hover:bg-slate-800/60"
                      }`}
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {toggling === rule.number ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggle(rule)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-yellow-400"
                              title={rule.disabled ? "Enable rule" : "Disable rule"}
                            >
                              {rule.disabled ? <Power className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(rule)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400"
                            title="Edit rule"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {deleting === rule.number ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(rule)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                              title="Delete rule"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <FirewallRuleDialog
        chain={chain}
        editRule={editRule}
        open={showRuleDialog}
        onOpenChange={setShowRuleDialog}
        onSaved={onReload}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Firewall Rule
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete rule{" "}
              <span className="font-mono font-medium text-white">
                {confirmDelete?.number}
              </span>{" "}
              from {chain.name}.
              {confirmDelete?.description && (
                <> ({confirmDelete.description})</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs font-medium text-slate-500">Config change:</p>
            <code className="mt-1 block whitespace-pre-wrap text-xs text-rose-400">
              {confirmDelete &&
                `delete firewall ${chain.path.join(" ")} rule ${confirmDelete.number}`}
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

// ── Firewall Panel ──────────────────────────────────────

function FirewallPanel({
  config,
  loading,
  error,
  onReload,
}: {
  config: FirewallConfig | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
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
                      <th className="px-4 py-3 font-medium text-slate-400"></th>
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
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
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
        <FirewallChainCard key={chain.name} chain={chain} onReload={onReload} />
      ))}
    </div>
  );
}

// ── Firewall Groups Panel ───────────────────────────────

function FirewallGroupsPanel({
  groups,
  loading,
  error,
  onReload,
}: {
  groups: FirewallGroups | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  // ── Create dialogs ──────────────────
  const [showCreateAddr, setShowCreateAddr] = useState(false);
  const [addrForm, setAddrForm] = useState({ name: "", description: "", addresses: "" });
  const [creatingAddr, setCreatingAddr] = useState(false);

  const [showCreateNet, setShowCreateNet] = useState(false);
  const [netForm, setNetForm] = useState({ name: "", description: "", networks: "" });
  const [creatingNet, setCreatingNet] = useState(false);

  const [showCreatePort, setShowCreatePort] = useState(false);
  const [portForm, setPortForm] = useState({ name: "", description: "", ports: "" });
  const [creatingPort, setCreatingPort] = useState(false);

  // ── Delete confirmation ─────────────
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "address" | "network" | "port";
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Add member dialogs ──────────────
  const [addMember, setAddMember] = useState<{
    type: "address" | "network" | "port";
    groupName: string;
  } | null>(null);
  const [memberValue, setMemberValue] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  // ── Removing member ─────────────────
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  async function handleCreateAddr() {
    setCreatingAddr(true);
    try {
      const addresses = addrForm.addresses
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await createAddressGroup({
        name: addrForm.name,
        description: addrForm.description || undefined,
        addresses,
      });
      toast.success(`Address group '${addrForm.name}' created`);
      setShowCreateAddr(false);
      setAddrForm({ name: "", description: "", addresses: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create address group");
    } finally {
      setCreatingAddr(false);
    }
  }

  async function handleCreateNet() {
    setCreatingNet(true);
    try {
      const networks = netForm.networks
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await createNetworkGroup({
        name: netForm.name,
        description: netForm.description || undefined,
        networks,
      });
      toast.success(`Network group '${netForm.name}' created`);
      setShowCreateNet(false);
      setNetForm({ name: "", description: "", networks: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create network group");
    } finally {
      setCreatingNet(false);
    }
  }

  async function handleCreatePort() {
    setCreatingPort(true);
    try {
      const ports = portForm.ports
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await createPortGroup({
        name: portForm.name,
        description: portForm.description || undefined,
        ports,
      });
      toast.success(`Port group '${portForm.name}' created`);
      setShowCreatePort(false);
      setPortForm({ name: "", description: "", ports: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create port group");
    } finally {
      setCreatingPort(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.type === "address") {
        await deleteAddressGroup(confirmDelete.name);
      } else if (confirmDelete.type === "network") {
        await deleteNetworkGroup(confirmDelete.name);
      } else {
        await deletePortGroup(confirmDelete.name);
      }
      toast.success(`Group '${confirmDelete.name}' deleted`);
      setConfirmDelete(null);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete group");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddMember() {
    if (!addMember || !memberValue.trim()) return;
    setAddingMember(true);
    try {
      if (addMember.type === "address") {
        await addAddressGroupMember(addMember.groupName, memberValue.trim());
      } else if (addMember.type === "network") {
        await addNetworkGroupMember(addMember.groupName, memberValue.trim());
      } else {
        await addPortGroupMember(addMember.groupName, memberValue.trim());
      }
      toast.success(`Added '${memberValue.trim()}' to '${addMember.groupName}'`);
      setAddMember(null);
      setMemberValue("");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(
    type: "address" | "network" | "port",
    groupName: string,
    value: string
  ) {
    setRemovingMember(`${groupName}:${value}`);
    try {
      if (type === "address") {
        await removeAddressGroupMember(groupName, value);
      } else if (type === "network") {
        await removeNetworkGroupMember(groupName, value);
      } else {
        await removePortGroupMember(groupName, value);
      }
      toast.success(`Removed '${value}' from '${groupName}'`);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingMember(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="border-slate-800 bg-slate-900">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
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

  const addrGroups = groups?.address_groups ?? [];
  const netGroups = groups?.network_groups ?? [];
  const portGroups = groups?.port_groups ?? [];

  function renderGroupCard(
    type: "address" | "network" | "port",
    name: string,
    description: string | null,
    members: string[],
    memberLabel: string
  ) {
    return (
      <Card key={name} className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base text-white">{name}</CardTitle>
              {description && (
                <span className="text-xs text-slate-500">{description}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-slate-400 hover:text-white"
                onClick={() => setAddMember({ type, groupName: name })}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add {memberLabel}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                onClick={() => setConfirmDelete({ type, name })}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">No {memberLabel}s in this group.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <Badge
                  key={member}
                  variant="outline"
                  className="border-slate-700 bg-slate-800 text-slate-300 font-mono text-xs gap-1.5 pr-1"
                >
                  {member}
                  <button
                    className="ml-0.5 rounded p-0.5 hover:bg-slate-700 disabled:opacity-50"
                    disabled={removingMember === `${name}:${member}`}
                    onClick={() => handleRemoveMember(type, name, member)}
                  >
                    {removingMember === `${name}:${member}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Address Groups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Address Groups</h3>
            <Dialog open={showCreateAddr} onOpenChange={setShowCreateAddr}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  <Plus className="mr-1 h-3 w-3" />
                  New Address Group
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-800 bg-slate-900">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Address Group</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a named group of IP addresses for use in firewall rules.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Group Name</Label>
                    <Input
                      value={addrForm.name}
                      onChange={(e) => setAddrForm({ ...addrForm, name: e.target.value })}
                      placeholder="BLOCKED_IPS"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description (optional)</Label>
                    <Input
                      value={addrForm.description}
                      onChange={(e) => setAddrForm({ ...addrForm, description: e.target.value })}
                      placeholder="Blocked IP addresses"
                      className="border-slate-800 bg-slate-950 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">IP Addresses (comma-separated, optional)</Label>
                    <Input
                      value={addrForm.addresses}
                      onChange={(e) => setAddrForm({ ...addrForm, addresses: e.target.value })}
                      placeholder="1.2.3.4, 5.6.7.8"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                </div>
                {addrForm.name && (
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-medium text-slate-500">Config change:</p>
                    <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                      {`set firewall group address-group ${addrForm.name}${addrForm.addresses ? ` address ${addrForm.addresses.split(/[,\s]+/).filter(Boolean).join("\nset firewall group address-group " + addrForm.name + " address ")}` : ""}`}
                    </code>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateAddr(false)} className="border-slate-800 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAddr} disabled={creatingAddr || !addrForm.name}>
                    {creatingAddr && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {addrGroups.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex flex-col items-center gap-2 py-8">
                <p className="text-sm text-slate-500">No address groups configured.</p>
              </CardContent>
            </Card>
          ) : (
            addrGroups.map((g) => renderGroupCard("address", g.name, g.description, g.members, "address"))
          )}
        </div>

        {/* Network Groups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Network Groups</h3>
            <Dialog open={showCreateNet} onOpenChange={setShowCreateNet}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  <Plus className="mr-1 h-3 w-3" />
                  New Network Group
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-800 bg-slate-900">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Network Group</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a named group of CIDR subnets for use in firewall rules.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Group Name</Label>
                    <Input
                      value={netForm.name}
                      onChange={(e) => setNetForm({ ...netForm, name: e.target.value })}
                      placeholder="TRUSTED_NETS"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description (optional)</Label>
                    <Input
                      value={netForm.description}
                      onChange={(e) => setNetForm({ ...netForm, description: e.target.value })}
                      placeholder="Trusted internal networks"
                      className="border-slate-800 bg-slate-950 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Networks (comma-separated CIDR, optional)</Label>
                    <Input
                      value={netForm.networks}
                      onChange={(e) => setNetForm({ ...netForm, networks: e.target.value })}
                      placeholder="10.0.0.0/8, 172.16.0.0/12"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                </div>
                {netForm.name && (
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-medium text-slate-500">Config change:</p>
                    <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                      {`set firewall group network-group ${netForm.name}${netForm.networks ? ` network ${netForm.networks.split(/[,\s]+/).filter(Boolean).join("\nset firewall group network-group " + netForm.name + " network ")}` : ""}`}
                    </code>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateNet(false)} className="border-slate-800 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateNet} disabled={creatingNet || !netForm.name}>
                    {creatingNet && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {netGroups.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex flex-col items-center gap-2 py-8">
                <p className="text-sm text-slate-500">No network groups configured.</p>
              </CardContent>
            </Card>
          ) : (
            netGroups.map((g) => renderGroupCard("network", g.name, g.description, g.members, "network"))
          )}
        </div>

        {/* Port Groups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-400">Port Groups</h3>
            <Dialog open={showCreatePort} onOpenChange={setShowCreatePort}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 border-slate-800 text-xs text-slate-300 hover:bg-slate-800">
                  <Plus className="mr-1 h-3 w-3" />
                  New Port Group
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-800 bg-slate-900">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Port Group</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a named group of ports and port ranges for use in firewall rules.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Group Name</Label>
                    <Input
                      value={portForm.name}
                      onChange={(e) => setPortForm({ ...portForm, name: e.target.value })}
                      placeholder="WEB_PORTS"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description (optional)</Label>
                    <Input
                      value={portForm.description}
                      onChange={(e) => setPortForm({ ...portForm, description: e.target.value })}
                      placeholder="Web server ports"
                      className="border-slate-800 bg-slate-950 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Ports (comma-separated, use - for ranges, optional)</Label>
                    <Input
                      value={portForm.ports}
                      onChange={(e) => setPortForm({ ...portForm, ports: e.target.value })}
                      placeholder="80, 443, 8080-8090"
                      className="border-slate-800 bg-slate-950 text-white font-mono"
                    />
                  </div>
                </div>
                {portForm.name && (
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-medium text-slate-500">Config change:</p>
                    <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                      {`set firewall group port-group ${portForm.name}${portForm.ports ? ` port ${portForm.ports.split(/[,\s]+/).filter(Boolean).join("\nset firewall group port-group " + portForm.name + " port ")}` : ""}`}
                    </code>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreatePort(false)} className="border-slate-800 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </Button>
                  <Button onClick={handleCreatePort} disabled={creatingPort || !portForm.name}>
                    {creatingPort && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {portGroups.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="flex flex-col items-center gap-2 py-8">
                <p className="text-sm text-slate-500">No port groups configured.</p>
              </CardContent>
            </Card>
          ) : (
            portGroups.map((g) => renderGroupCard("port", g.name, g.description, g.members, "port"))
          )}
        </div>
      </div>

      {/* Delete group confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Group</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete the {confirmDelete?.type} group{" "}
              <span className="font-mono font-medium text-white">{confirmDelete?.name}</span> and all its members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <p className="text-xs font-medium text-slate-500">Config change:</p>
            <code className="mt-1 block whitespace-pre-wrap text-xs text-rose-400">
              {confirmDelete && `delete firewall group ${confirmDelete.type === "address" ? "address-group" : confirmDelete.type === "network" ? "network-group" : "port-group"} ${confirmDelete.name}`}
            </code>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add member dialog */}
      <Dialog
        open={addMember !== null}
        onOpenChange={(open) => { if (!open) { setAddMember(null); setMemberValue(""); } }}
      >
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              Add {addMember?.type === "address" ? "Address" : addMember?.type === "network" ? "Network" : "Port"} to {addMember?.groupName}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {addMember?.type === "address"
                ? "Enter an IP address (e.g. 10.0.0.1)."
                : addMember?.type === "network"
                ? "Enter a CIDR network (e.g. 10.0.0.0/8)."
                : "Enter a port or port range (e.g. 80 or 8080-8090)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-slate-300">Value</Label>
            <Input
              value={memberValue}
              onChange={(e) => setMemberValue(e.target.value)}
              placeholder={
                addMember?.type === "address"
                  ? "1.2.3.4"
                  : addMember?.type === "network"
                  ? "10.0.0.0/8"
                  : "443"
              }
              className="border-slate-800 bg-slate-950 text-white font-mono"
              onKeyDown={(e) => { if (e.key === "Enter" && memberValue.trim()) handleAddMember(); }}
            />
          </div>
          {memberValue.trim() && addMember && (
            <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
              <p className="text-xs font-medium text-slate-500">Config change:</p>
              <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                {`set firewall group ${addMember.type === "address" ? "address-group" : addMember.type === "network" ? "network-group" : "port-group"} ${addMember.groupName} ${addMember.type === "address" ? "address" : addMember.type === "network" ? "network" : "port"} ${memberValue.trim()}`}
              </code>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMember(null); setMemberValue(""); }} className="border-slate-800 text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={addingMember || !memberValue.trim()}>
              {addingMember && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

  const firewall = useAsyncData<FirewallConfig>(
    useCallback(() => fetchRouterFirewall(), []),
    tab === "firewall"
  );

  const firewallGroups = useAsyncData<FirewallGroups>(
    useCallback(() => fetchFirewallGroups(), []),
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base text-white">
                Routing Table
              </CardTitle>
              <AddStaticRouteButton onSaved={routes.reload} />
            </CardHeader>
            <CardContent>
              <RoutesTable
                routes={Array.isArray(routes.data) ? routes.data : null}
                loading={routes.loading}
                error={routes.error}
                onReload={routes.reload}
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

        <TabsContent value="firewall" className="space-y-6">
          <FirewallPanel
            config={firewall.data}
            loading={firewall.loading}
            error={firewall.error}
            onReload={firewall.reload}
          />

          <div className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <Layers className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-300">Firewall Groups</h2>
            </div>
            <FirewallGroupsPanel
              groups={firewallGroups.data}
              loading={firewallGroups.loading}
              error={firewallGroups.error}
              onReload={firewallGroups.reload}
            />
          </div>
        </TabsContent>

        <TabsContent value="speedtest">
          <SpeedTestSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
