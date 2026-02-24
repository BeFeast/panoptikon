"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  Lock,
  Key,
  Download,
  Copy,
  QrCode,
  Eye,
  EyeOff,
  Users,
  Search,
  GitCompare,
  Cpu,
  MemoryStick,
  HardDrive,
  ScrollText,
  RefreshCw,
  Monitor,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
  fetchRouterSummary,
  fetchRouterInterfaces,
  fetchRouterRoutes,
  fetchRouterDhcpLeases,
  fetchRouterFirewall,
  fetchRouterConfigInterfaces,
  runSpeedTest,
  fetchSpeedTestHistory,
  toggleInterface,
  fetchDhcpStaticMappings,
  createDhcpStaticMapping,
  updateDhcpStaticMapping,
  deleteDhcpStaticMapping,
  fetchDhcpServerConfig,
  toggleDhcpSubnet,
  updateDhcpSubnet,
  createDhcpSubnet,
  deleteDhcpSubnet,
  createDhcpPoolRange,
  deleteDhcpPoolRange,
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
  fetchWireguardInterfaces,
  createWireguardInterface,
  deleteWireguardInterface,
  addWireguardPeer,
  deleteWireguardPeer,
  generateWireguardClientConfig,
  fetchOpenVpnInterfaces,
  createOpenVpnInterface,
  deleteOpenVpnInterface,
  toggleOpenVpnInterface,
  fetchDnsForwarding,
  addDnsNameServer,
  deleteDnsNameServer,
  addDnsDomainOverride,
  editDnsDomainOverride,
  deleteDnsDomainOverride,
  fetchSystemInfo,
  fetchSyslog,
  fetchMikrotikStatus,
  fetchSettings,
} from "@/lib/api";
import type { FirewallConfig, FirewallChain, FirewallRule, FirewallRuleRequest, FirewallGroups, RouterStatus, RouterSummary, SpeedTestResult, SpeedTestHistoryEntry, VyosDhcpLease, VyosInterface, VyosRoute, DhcpStaticMapping, DhcpServerConfig, DhcpSubnetConfig, WireguardInterface, ClientConfigResponse, DnsForwardingConfig, DnsDomainOverride, SystemInfo, SyslogResponse, MikrotikStatus, SettingsData, OpenVpnInterface, OpenVpnConnectedClient } from "@/lib/types";
import MikrotikRouter from "@/components/MikrotikRouter";
import XiaomiRouter from "@/components/XiaomiRouter";
import QRCode from "qrcode";
import { Progress } from "@/components/ui/progress";
import { PageTransition } from "@/components/PageTransition";
import { copyToClipboard } from "@/lib/utils";

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

function VyosNotConfigured() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
            <Router className="h-8 w-8 text-slate-500" />
          </div>
          <h1 className="text-xl font-semibold text-white">
            VyOS Not Configured
          </h1>
          <p className="text-center text-sm text-slate-500">
            VyOS is optional. To enable it, add the VyOS URL and API key in
            Settings.
          </p>
          <Link href="/settings/router">
            <Button
              variant="outline"
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Settings className="mr-2 h-4 w-4" />
              Configure VyOS
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
        <Link href="/settings/config-backup">
          <Badge
            variant="outline"
            className="cursor-pointer border-blue-500/30 bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20"
          >
            <GitCompare className="mr-1 h-3 w-3" />
            Diff & Rollback
          </Badge>
        </Link>
      </div>
    </div>
  );
}

// ── System Info Panel ───────────────────────────────────

function SystemInfoPanel({
  onTabActive,
}: {
  onTabActive: boolean;
}) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [syslog, setSyslog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [syslogLoading, setSyslogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Debounce the filter input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(logFilter), 300);
    return () => clearTimeout(timer);
  }, [logFilter]);

  // Fetch system info
  const loadInfo = useCallback(async () => {
    if (!onTabActive) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemInfo();
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load system info");
    } finally {
      setLoading(false);
    }
  }, [onTabActive]);

  // Fetch syslog
  const loadSyslog = useCallback(async () => {
    if (!onTabActive) return;
    setSyslogLoading(true);
    try {
      const data = await fetchSyslog(50, debouncedFilter || undefined);
      setSyslog(data.lines);
    } catch {
      // Syslog errors are non-critical; keep existing lines
    } finally {
      setSyslogLoading(false);
    }
  }, [onTabActive, debouncedFilter]);

  // Initial load + 30s auto-refresh
  useEffect(() => {
    loadInfo();
    const interval = setInterval(loadInfo, 30_000);
    return () => clearInterval(interval);
  }, [loadInfo]);

  useEffect(() => {
    loadSyslog();
    const interval = setInterval(loadSyslog, 30_000);
    return () => clearInterval(interval);
  }, [loadSyslog]);

  if (loading && !info) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top cards: Version, Uptime, CPU, Memory */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Version */}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Monitor className="h-4.5 w-4.5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Version</p>
              <p className="truncate text-sm font-medium text-white">
                {info?.version ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Clock className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Uptime</p>
              <p className="truncate text-sm font-medium text-white">
                {info?.uptime ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CPU Load */}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <Cpu className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">CPU Load</p>
              {info?.cpu_load ? (
                <p className="text-sm font-medium text-white">
                  {info.cpu_load.load1.toFixed(2)}{" "}
                  <span className="text-xs text-slate-500">
                    / {info.cpu_load.load5.toFixed(2)} / {info.cpu_load.load15.toFixed(2)}
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-white">—</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <MemoryStick className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Memory</p>
              {info?.memory ? (
                <p className="text-sm font-medium text-white">
                  {info.memory.percent}%{" "}
                  <span className="text-xs text-slate-500">
                    ({formatBytes(info.memory.used)} / {formatBytes(info.memory.total)})
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-white">—</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Memory + CPU progress bars */}
      {(info?.memory || info?.cpu_load) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {info?.memory && (
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <MemoryStick className="h-4 w-4 text-purple-400" />
                  Memory Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress
                  value={info.memory.percent}
                  className="h-2"
                />
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Used: {formatBytes(info.memory.used)}</span>
                  <span>Free: {formatBytes(info.memory.free)}</span>
                  <span>Total: {formatBytes(info.memory.total)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {info?.disk && info.disk.length > 0 && (
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-white">
                  <HardDrive className="h-4 w-4 text-cyan-400" />
                  Disk Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {info.disk.map((d) => (
                  <div key={d.mount}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-mono">{d.mount}</span>
                      <span>{d.used} / {d.size} ({d.percent}%)</span>
                    </div>
                    <Progress
                      value={d.percent}
                      className="h-2"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Syslog viewer */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-white">
            <ScrollText className="h-4 w-4 text-slate-400" />
            System Log
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                placeholder="Filter logs..."
                className="h-8 w-48 border-slate-800 bg-slate-950 pl-8 text-xs text-slate-300 placeholder:text-slate-600"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSyslog}
              disabled={syslogLoading}
              className="h-8 text-slate-400 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syslogLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={logContainerRef}
            className="max-h-96 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-400"
          >
            {syslog.length === 0 ? (
              <p className="text-center text-slate-600">
                {syslogLoading ? "Loading..." : "No log entries"}
              </p>
            ) : (
              syslog.map((line, i) => (
                <div
                  key={i}
                  className="hover:bg-slate-900/50 hover:text-slate-300"
                >
                  {line}
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-right text-xs text-slate-600">
            {syslog.length} line{syslog.length !== 1 ? "s" : ""} · auto-refreshes every 30s
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Hook: pre-populated data with reload ────────────────

/** State pre-populated from the router summary with reload via individual endpoint. */
function useSummaryData<T>(
  initial: T,
  fetcher: () => Promise<T>
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher());
    } catch (e) {
      if (e instanceof Error && e.message.includes("503")) {
        setError("Router not configured");
      } else {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  return { data, loading, error, reload };
}

// ── DNS Forwarding Panel ────────────────────────────────

function DnsForwardingPanel({
  config,
  loading,
  error,
  onReload,
}: {
  config: DnsForwardingConfig | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [editDomain, setEditDomain] = useState<DnsDomainOverride | null>(null);
  const [confirmDeleteServer, setConfirmDeleteServer] = useState<string | null>(null);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add name server dialog state
  const [newServer, setNewServer] = useState("");
  const [savingServer, setSavingServer] = useState(false);

  // Add/edit domain dialog state
  const [domainName, setDomainName] = useState("");
  const [domainServer, setDomainServer] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);

  async function handleAddServer(e: React.FormEvent) {
    e.preventDefault();
    setSavingServer(true);
    try {
      const res = await addDnsNameServer(newServer.trim());
      toast.success(res.message);
      setNewServer("");
      setAddServerOpen(false);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add name server");
    } finally {
      setSavingServer(false);
    }
  }

  async function handleDeleteServer() {
    if (!confirmDeleteServer) return;
    setDeleting(true);
    try {
      await deleteDnsNameServer(confirmDeleteServer);
      toast.success(`Name server ${confirmDeleteServer} removed`);
      setConfirmDeleteServer(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete name server");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveDomain(e: React.FormEvent) {
    e.preventDefault();
    setSavingDomain(true);
    try {
      if (editDomain) {
        const res = await editDnsDomainOverride(editDomain.domain, {
          domain: editDomain.domain,
          server: domainServer.trim(),
        });
        toast.success(res.message);
        setEditDomain(null);
      } else {
        const res = await addDnsDomainOverride({
          domain: domainName.trim(),
          server: domainServer.trim(),
        });
        toast.success(res.message);
        setAddDomainOpen(false);
      }
      setDomainName("");
      setDomainServer("");
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save domain override");
    } finally {
      setSavingDomain(false);
    }
  }

  async function handleDeleteDomain() {
    if (!confirmDeleteDomain) return;
    setDeleting(true);
    try {
      await deleteDnsDomainOverride(confirmDeleteDomain);
      toast.success(`Domain override ${confirmDeleteDomain} deleted`);
      setConfirmDeleteDomain(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete domain override");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Name Servers */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-white">Name Servers</CardTitle>
            <Button
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setAddServerOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Server
            </Button>
          </CardHeader>
          <CardContent>
            {!config?.name_servers.length ? (
              <p className="text-sm text-slate-500">No name servers configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-left">
                      <th className="px-4 py-3 font-medium text-slate-400">Server IP</th>
                      <th className="px-4 py-3 font-medium text-slate-400 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {config.name_servers.map((srv) => (
                      <tr key={srv} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <span className="font-mono tabular-nums text-white">{srv}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                            onClick={() => setConfirmDeleteServer(srv)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Domain Overrides */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-white">Domain Overrides</CardTitle>
            <Button
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                setDomainName("");
                setDomainServer("");
                setEditDomain(null);
                setAddDomainOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Override
            </Button>
          </CardHeader>
          <CardContent>
            {!config?.domain_overrides.length ? (
              <p className="text-sm text-slate-500">No domain overrides configured.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-left">
                      <th className="px-4 py-3 font-medium text-slate-400">Domain</th>
                      <th className="px-4 py-3 font-medium text-slate-400">DNS Server</th>
                      <th className="px-4 py-3 font-medium text-slate-400 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {config.domain_overrides.map((override) => (
                      <tr key={override.domain} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-white">{override.domain}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono tabular-nums text-slate-300">{override.server}</span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400"
                            onClick={() => {
                              setEditDomain(override);
                              setDomainName(override.domain);
                              setDomainServer(override.server);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                            onClick={() => setConfirmDeleteDomain(override.domain)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config Info */}
        {config && (config.listen_addresses.length > 0 || config.allow_from.length > 0 || config.cache_size) && (
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {config.listen_addresses.length > 0 && (
                  <div>
                    <span className="text-slate-400">Listen Addresses: </span>
                    <span className="font-mono text-slate-300">
                      {config.listen_addresses.join(", ")}
                    </span>
                  </div>
                )}
                {config.allow_from.length > 0 && (
                  <div>
                    <span className="text-slate-400">Allow From: </span>
                    <span className="font-mono text-slate-300">
                      {config.allow_from.join(", ")}
                    </span>
                  </div>
                )}
                {config.cache_size != null && (
                  <div>
                    <span className="text-slate-400">Cache Size: </span>
                    <span className="font-mono text-slate-300">
                      {config.cache_size.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Name Server Dialog */}
      <Dialog open={addServerOpen} onOpenChange={(v) => { if (!v) setNewServer(""); setAddServerOpen(v); }}>
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Name Server</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add an upstream DNS name server for forwarding.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddServer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dns-server-ip" className="text-slate-300">
                Server IP <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="dns-server-ip"
                placeholder="1.1.1.1"
                value={newServer}
                onChange={(e) => setNewServer(e.target.value)}
                className="border-slate-700 bg-slate-800 font-mono text-white"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddServerOpen(false)} className="text-slate-400 hover:text-white">
                Cancel
              </Button>
              <Button type="submit" disabled={savingServer} className="bg-blue-600 text-white hover:bg-blue-700">
                {savingServer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Server
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Domain Override Dialog */}
      <Dialog
        open={addDomainOpen || !!editDomain}
        onOpenChange={(v) => {
          if (!v) {
            setAddDomainOpen(false);
            setEditDomain(null);
            setDomainName("");
            setDomainServer("");
          }
        }}
      >
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editDomain ? "Edit Domain Override" : "Add Domain Override"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Forward DNS queries for a specific domain to a custom server.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDomain} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dns-domain" className="text-slate-300">
                Domain <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="dns-domain"
                placeholder="example.com"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                className="border-slate-700 bg-slate-800 font-mono text-white"
                required
                disabled={!!editDomain}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dns-domain-server" className="text-slate-300">
                DNS Server <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="dns-domain-server"
                placeholder="10.10.0.1"
                value={domainServer}
                onChange={(e) => setDomainServer(e.target.value)}
                className="border-slate-700 bg-slate-800 font-mono text-white"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setAddDomainOpen(false); setEditDomain(null); }}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingDomain} className="bg-blue-600 text-white hover:bg-blue-700">
                {savingDomain && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editDomain ? "Save Changes" : "Add Override"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Name Server Confirmation */}
      <AlertDialog open={!!confirmDeleteServer} onOpenChange={(open) => !open && setConfirmDeleteServer(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove Name Server</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to remove the name server{" "}
              <span className="font-mono font-medium text-white">{confirmDeleteServer}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={handleDeleteServer} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Domain Override Confirmation */}
      <AlertDialog open={!!confirmDeleteDomain} onOpenChange={(open) => !open && setConfirmDeleteDomain(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Domain Override</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete the domain override for{" "}
              <span className="font-mono font-medium text-white">{confirmDeleteDomain}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={handleDeleteDomain} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Speed Test Section ──────────────────────────────────

function SpeedTestSection() {
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<SpeedTestHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchSpeedTestHistory(20, 0);
      setHistory(res.items);
      setHistoryTotal(res.total);
    } catch {
      // silently ignore — history is supplementary
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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
      // Refresh history after successful test
      loadHistory();
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
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Sparkline data: download speeds from history (oldest first for chart)
  const sparklineData = [...history].reverse().map((h) => h.download_mbps);

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

      {/* Download speed sparkline chart */}
      {sparklineData.length >= 2 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-400">
              <Activity className="h-4 w-4" />
              Download Speed Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <SpeedTestSparkline data={sparklineData} />
          </CardContent>
        </Card>
      )}

      {/* History table */}
      {!historyLoading && history.length > 0 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-400">
              <Clock className="h-4 w-4" />
              History
              <span className="text-xs text-slate-600">
                ({historyTotal} total)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium text-right">
                      <ArrowDown className="mr-1 inline h-3 w-3 text-emerald-400" />
                      Download
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      <ArrowUp className="mr-1 inline h-3 w-3 text-blue-400" />
                      Upload
                    </th>
                    <th className="px-4 py-2 font-medium text-right">Ping</th>
                    <th className="hidden px-4 py-2 font-medium text-right sm:table-cell">Server</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30"
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">
                        {formatTimestamp(entry.tested_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-emerald-400">
                        {entry.download_mbps.toFixed(1)} Mbps
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-blue-400">
                        {entry.upload_mbps.toFixed(1)} Mbps
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-400">
                        {entry.ping_ms.toFixed(1)} ms
                      </td>
                      <td className="hidden max-w-[200px] truncate px-4 py-2 text-right text-xs text-slate-500 sm:table-cell">
                        {entry.server_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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

/** Inline sparkline chart for download speed trend. */
function SpeedTestSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const h = 48;
  const w = data.length > 1 ? (data.length - 1) * 20 : 100;
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="flex items-end gap-4">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-12 w-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="shrink-0 text-right text-xs text-slate-500">
        <p>
          Max:{" "}
          <span className="text-emerald-400">{max.toFixed(1)}</span> Mbps
        </p>
        <p>
          Min:{" "}
          <span className="text-emerald-400">{min.toFixed(1)}</span> Mbps
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

  // Derive VyOS interface type prefix from the interface name (mirrors backend logic)
  const interfaceType = (name: string): string => {
    if (name.startsWith("eth")) return "ethernet";
    if (name.startsWith("bond")) return "bonding";
    if (name.startsWith("br")) return "bridge";
    if (name.startsWith("wg")) return "wireguard";
    if (name === "lo" || name.startsWith("lo")) return "loopback";
    if (name.startsWith("vtun")) return "openvpn";
    if (name.startsWith("tun")) return "tunnel";
    if (name.startsWith("vti")) return "vti";
    if (name.startsWith("pppoe")) return "pppoe";
    return "ethernet";
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
              {confirmToggle
                ? confirmToggle.disable
                  ? `set interfaces ${interfaceType(confirmToggle.iface.name)} ${confirmToggle.iface.name} disable`
                  : `delete interfaces ${interfaceType(confirmToggle.iface.name)} ${confirmToggle.iface.name} disable`
                : null}
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
  dhcpConfig,
}: {
  mappings: DhcpStaticMapping[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  dhcpConfig: DhcpServerConfig | null;
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
  const [editMapping, setEditMapping] = useState<DhcpStaticMapping | null>(null);
  const [editForm, setEditForm] = useState({ mac: "", ip: "" });
  const [saving, setSaving] = useState(false);

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

  const handleEdit = (m: DhcpStaticMapping) => {
    setEditMapping(m);
    setEditForm({ mac: m.mac, ip: m.ip });
  };

  const handleEditSave = async () => {
    if (!editMapping) return;
    if (!editForm.mac || !editForm.ip) {
      toast.error("MAC and IP are required");
      return;
    }
    setSaving(true);
    try {
      const res = await updateDhcpStaticMapping(
        editMapping.network,
        editMapping.subnet,
        editMapping.name,
        { ...editMapping, mac: editForm.mac, ip: editForm.ip }
      );
      toast.success(res.message);
      setEditMapping(null);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  // Build available networks/subnets from DHCP server config
  const availableNetworks = dhcpConfig?.shared_networks ?? [];
  const selectedNetworkObj = availableNetworks.find((n) => n.name === addForm.network);
  const availableSubnets = selectedNetworkObj?.subnets ?? [];

  // Pre-fill network/subnet from config or existing mappings
  useEffect(() => {
    if (addForm.subnet) return;
    if (availableNetworks.length > 0) {
      const firstNet = availableNetworks[0];
      const firstSub = firstNet.subnets[0]?.subnet ?? "";
      setAddForm((prev) => ({
        ...prev,
        network: prev.network && availableNetworks.some((n) => n.name === prev.network) ? prev.network : firstNet.name,
        subnet: firstSub,
      }));
    } else if (mappings && mappings.length > 0) {
      setAddForm((prev) => ({
        ...prev,
        network: mappings[0].network,
        subnet: mappings[0].subnet,
      }));
    }
  }, [mappings, addForm.subnet, availableNetworks]);

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
                  {availableNetworks.length > 0 ? (
                    <select
                      value={addForm.network}
                      onChange={(e) => {
                        const net = availableNetworks.find((n) => n.name === e.target.value);
                        setAddForm({
                          ...addForm,
                          network: e.target.value,
                          subnet: net?.subnets[0]?.subnet ?? "",
                        });
                      }}
                      className={selectClass}
                    >
                      {availableNetworks.map((n) => (
                        <option key={n.name} value={n.name}>{n.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={addForm.network}
                      onChange={(e) => setAddForm({ ...addForm, network: e.target.value })}
                      placeholder="LAN"
                      className="border-slate-800 bg-slate-950 text-white"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Subnet</Label>
                  {availableSubnets.length > 0 ? (
                    <select
                      value={addForm.subnet}
                      onChange={(e) => setAddForm({ ...addForm, subnet: e.target.value })}
                      className={selectClass}
                    >
                      {availableSubnets.map((s) => (
                        <option key={s.subnet} value={s.subnet}>{s.subnet}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={addForm.subnet}
                      onChange={(e) => setAddForm({ ...addForm, subnet: e.target.value })}
                      placeholder="10.10.0.0/24"
                      className="border-slate-800 bg-slate-950 text-white"
                    />
                  )}
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
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(m)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editMapping !== null} onOpenChange={(open) => { if (!open) setEditMapping(null); }}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit Static Mapping &ldquo;{editMapping?.name}&rdquo;
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Update MAC or IP address for this mapping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">MAC Address</Label>
              <Input
                value={editForm.mac}
                onChange={(e) => setEditForm({ ...editForm, mac: e.target.value })}
                placeholder="aa:bb:cc:dd:ee:ff"
                className="border-slate-800 bg-slate-950 font-mono text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">IP Address</Label>
              <Input
                value={editForm.ip}
                onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })}
                placeholder="10.10.0.100"
                className="border-slate-800 bg-slate-950 font-mono text-white"
              />
            </div>
            {editMapping && editForm.mac && editForm.ip && (
              <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                <p className="text-xs font-medium text-slate-500">Config change:</p>
                <code className="mt-1 block whitespace-pre-wrap text-xs text-blue-400">
                  {`set service dhcp-server shared-network-name ${editMapping.network} subnet ${editMapping.subnet} static-mapping ${editMapping.name} mac-address ${editForm.mac}\nset service dhcp-server shared-network-name ${editMapping.network} subnet ${editMapping.subnet} static-mapping ${editMapping.name} ip-address ${editForm.ip}`}
                </code>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditMapping(null)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

// ── DHCP Pools & Subnets ────────────────────────────────

function DhcpPoolsCard({
  config,
  loading,
  error,
  onReload,
}: {
  config: DhcpServerConfig | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [editSubnet, setEditSubnet] = useState<{ network: string; subnet: DhcpSubnetConfig } | null>(null);
  const [editForm, setEditForm] = useState({ default_router: "", name_server: "", domain_name: "", lease: "", ntp_server: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ network: "", subnet: "", default_router: "", name_server: "", domain_name: "", lease: "", range_start: "", range_stop: "" });
  const [createSaving, setCreateSaving] = useState(false);
  const [addRangeFor, setAddRangeFor] = useState<{ network: string; subnet: string } | null>(null);
  const [rangeForm, setRangeForm] = useState({ name: "", start: "", stop: "" });
  const [rangeSaving, setRangeSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "subnet" | "range"; network: string; subnet: string; rangeName?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleToggle = async (network: string, subnet: DhcpSubnetConfig) => {
    const key = `${network}/${subnet.subnet}`;
    setToggling(key);
    try {
      const newDisabled = !subnet.disabled;
      const res = await toggleDhcpSubnet(network, subnet.subnet, newDisabled);
      toast.success(res.message);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  const openEdit = (network: string, subnet: DhcpSubnetConfig) => {
    setEditForm({
      default_router: subnet.default_router ?? "",
      name_server: subnet.name_server ?? "",
      domain_name: subnet.domain_name ?? "",
      lease: subnet.lease ?? "",
      ntp_server: subnet.ntp_server ?? "",
    });
    setEditSubnet({ network, subnet });
  };

  const handleEditSave = async () => {
    if (!editSubnet) return;
    setEditSaving(true);
    try {
      const res = await updateDhcpSubnet(editSubnet.network, editSubnet.subnet.subnet, {
        default_router: editForm.default_router,
        name_server: editForm.name_server,
        domain_name: editForm.domain_name,
        lease: editForm.lease ? Number(editForm.lease) : undefined,
        ntp_server: editForm.ntp_server,
      });
      toast.success(res.message);
      setEditSubnet(null);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreateSaving(true);
    try {
      const res = await createDhcpSubnet({
        network: createForm.network,
        subnet: createForm.subnet,
        default_router: createForm.default_router || undefined,
        name_server: createForm.name_server || undefined,
        domain_name: createForm.domain_name || undefined,
        lease: createForm.lease ? Number(createForm.lease) : undefined,
        range_start: createForm.range_start || undefined,
        range_stop: createForm.range_stop || undefined,
      });
      toast.success(res.message);
      setCreateOpen(false);
      setCreateForm({ network: "", subnet: "", default_router: "", name_server: "", domain_name: "", lease: "", range_start: "", range_stop: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleAddRange = async () => {
    if (!addRangeFor || !rangeForm.name) return;
    setRangeSaving(true);
    try {
      const res = await createDhcpPoolRange(addRangeFor.network, addRangeFor.subnet, rangeForm.name, { start: rangeForm.start, stop: rangeForm.stop });
      toast.success(res.message);
      setAddRangeFor(null);
      setRangeForm({ name: "", start: "", stop: "" });
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add range failed");
    } finally {
      setRangeSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "range" && deleteTarget.rangeName) {
        const res = await deleteDhcpPoolRange(deleteTarget.network, deleteTarget.subnet, deleteTarget.rangeName);
        toast.success(res.message);
      } else {
        const res = await deleteDhcpSubnet(deleteTarget.network, deleteTarget.subnet);
        toast.success(res.message);
      }
      setDeleteTarget(null);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
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

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Subnet
        </Button>
      </div>

      {(!config || config.shared_networks.length === 0) ? (
        <p className="py-4 text-sm text-slate-500">
          No DHCP shared networks configured.
        </p>
      ) : (
        <div className="space-y-4">
          {config.shared_networks.map((net) => (
            <div key={net.name} className="space-y-3">
              <h4 className="text-sm font-medium text-slate-300">
                Shared Network: <span className="text-white">{net.name}</span>
              </h4>

              {net.subnets.map((sub) => {
                const key = `${net.name}/${sub.subnet}`;
                const isToggling = toggling === key;

                return (
                  <div
                    key={sub.subnet}
                    className="rounded-md border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium text-white">
                          {sub.subnet}
                        </span>
                        {sub.disabled ? (
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
                          >
                            disabled
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          >
                            active
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => openEdit(net.name, sub)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-rose-400" onClick={() => setDeleteTarget({ type: "subnet", network: net.name, subnet: sub.subnet })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isToggling && (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        )}
                        <Switch
                          checked={!sub.disabled}
                          onCheckedChange={() => handleToggle(net.name, sub)}
                          disabled={isToggling}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-5">
                      <div>
                        <span className="text-slate-500">Gateway</span>
                        <p className="font-mono text-slate-300">
                          {sub.default_router ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">DNS</span>
                        <p className="font-mono text-slate-300">
                          {sub.name_server ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Domain</span>
                        <p className="text-slate-300">
                          {sub.domain_name ?? "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Lease</span>
                        <p className="text-slate-300">
                          {sub.lease ? `${sub.lease}s` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">NTP</span>
                        <p className="font-mono text-slate-300">
                          {sub.ntp_server ?? "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Pool Ranges</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-slate-400 hover:text-white" onClick={() => { setAddRangeFor({ network: net.name, subnet: sub.subnet }); setRangeForm({ name: "", start: "", stop: "" }); }}>
                          <Plus className="mr-1 h-3 w-3" /> Add Range
                        </Button>
                      </div>
                      {sub.ranges.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {sub.ranges.map((r) => (
                            <div
                              key={r.name}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="text-slate-500">{r.name}:</span>
                              <span className="font-mono text-slate-300">
                                {r.start}
                              </span>
                              <span className="text-slate-600">→</span>
                              <span className="font-mono text-slate-300">
                                {r.stop}
                              </span>
                              <Button size="icon" variant="ghost" className="ml-auto h-5 w-5 text-slate-500 hover:text-rose-400" onClick={() => setDeleteTarget({ type: "range", network: net.name, subnet: sub.subnet, rangeName: r.name })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-slate-600">No pool ranges configured</p>
                      )}
                    </div>

                    {sub.static_mapping_count > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        {sub.static_mapping_count} static mapping{sub.static_mapping_count !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Edit Subnet Options Dialog */}
      <Dialog open={!!editSubnet} onOpenChange={(v) => { if (!v) setEditSubnet(null); }}>
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Subnet Options</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update DHCP options for {editSubnet?.subnet.subnet}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Default Gateway</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.1" value={editForm.default_router} onChange={(e) => setEditForm({ ...editForm, default_router: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">DNS Server</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.1" value={editForm.name_server} onChange={(e) => setEditForm({ ...editForm, name_server: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Domain Name</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. home.lan" value={editForm.domain_name} onChange={(e) => setEditForm({ ...editForm, domain_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Lease Time (seconds)</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" type="number" placeholder="e.g. 86400" value={editForm.lease} onChange={(e) => setEditForm({ ...editForm, lease: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">NTP Server</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.1" value={editForm.ntp_server} onChange={(e) => setEditForm({ ...editForm, ntp_server: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setEditSubnet(null)}>Cancel</Button>
            <Button className="bg-sky-600 text-white hover:bg-sky-700" onClick={handleEditSave} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Subnet Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setCreateForm({ network: "", subnet: "", default_router: "", name_server: "", domain_name: "", lease: "", range_start: "", range_stop: "" }); } }}>
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add DHCP Subnet</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new DHCP subnet with optional pool range and options.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Shared Network Name</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. LAN" value={createForm.network} onChange={(e) => setCreateForm({ ...createForm, network: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Subnet (CIDR)</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.0/24" value={createForm.subnet} onChange={(e) => setCreateForm({ ...createForm, subnet: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Default Gateway</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.1" value={createForm.default_router} onChange={(e) => setCreateForm({ ...createForm, default_router: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">DNS Server</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.1" value={createForm.name_server} onChange={(e) => setCreateForm({ ...createForm, name_server: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Domain Name</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. home.lan" value={createForm.domain_name} onChange={(e) => setCreateForm({ ...createForm, domain_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Lease Time (seconds)</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" type="number" placeholder="e.g. 86400" value={createForm.lease} onChange={(e) => setCreateForm({ ...createForm, lease: e.target.value })} />
            </div>
            <div className="rounded border border-slate-800 p-3">
              <span className="text-xs font-medium text-slate-400">Initial Pool Range (optional)</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-300">Start IP</Label>
                  <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.100" value={createForm.range_start} onChange={(e) => setCreateForm({ ...createForm, range_start: e.target.value })} />
                </div>
                <div>
                  <Label className="text-slate-300">Stop IP</Label>
                  <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.200" value={createForm.range_stop} onChange={(e) => setCreateForm({ ...createForm, range_stop: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="bg-sky-600 text-white hover:bg-sky-700" onClick={handleCreate} disabled={createSaving || !createForm.network || !createForm.subnet}>
              {createSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Pool Range Dialog */}
      <Dialog open={!!addRangeFor} onOpenChange={(v) => { if (!v) setAddRangeFor(null); }}>
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Pool Range</DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new IP address range to {addRangeFor?.subnet}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Range Name</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. pool-1" value={rangeForm.name} onChange={(e) => setRangeForm({ ...rangeForm, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Start IP</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.100" value={rangeForm.start} onChange={(e) => setRangeForm({ ...rangeForm, start: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Stop IP</Label>
              <Input className="border-slate-700 bg-slate-800 text-white" placeholder="e.g. 192.168.1.200" value={rangeForm.stop} onChange={(e) => setRangeForm({ ...rangeForm, stop: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setAddRangeFor(null)}>Cancel</Button>
            <Button className="bg-sky-600 text-white hover:bg-sky-700" onClick={handleAddRange} disabled={rangeSaving || !rangeForm.name || !rangeForm.start || !rangeForm.stop}>
              {rangeSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete {deleteTarget?.type === "range" ? "Pool Range" : "Subnet"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {deleteTarget?.type === "range"
                ? `This will remove pool range "${deleteTarget.rangeName}" from ${deleteTarget.subnet}.`
                : `This will remove the entire DHCP subnet ${deleteTarget?.subnet} and all its configuration.`}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

// ── WireGuard helpers ────────────────────────────────────

/** Format a UNIX timestamp as a relative "time ago" string. */
function formatHandshake(ts: number): string {
  const now = Date.now() / 1000;
  const diff = Math.max(0, Math.floor(now - ts));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Format bytes into a human-readable string (KiB, MiB, GiB). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

// ── WireGuard VPN Panel ──────────────────────────────────

function WireGuardPanel({
  interfaces,
  loading,
  error,
  onReload,
}: {
  interfaces: WireguardInterface[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading WireGuard interfaces…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={onReload}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const wgInterfaces = interfaces ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white">
            WireGuard Interfaces
          </CardTitle>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Interface
              </Button>
            </DialogTrigger>
            <CreateWireGuardInterfaceDialog
              onCreated={() => {
                setShowCreateDialog(false);
                onReload();
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {wgInterfaces.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No WireGuard interfaces configured. Create one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {wgInterfaces.map((iface) => (
                <WireGuardInterfaceCard
                  key={iface.name}
                  iface={iface}
                  onReload={onReload}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Create WireGuard Interface Dialog ────────────────────

function CreateWireGuardInterfaceDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [name, setName] = useState("wg0");
  const [port, setPort] = useState("51820");
  const [address, setAddress] = useState("10.10.20.1/24");
  const [saving, setSaving] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const handleCreate = async () => {
    const portNum = parseInt(port, 10);
    if (!name || !port || !address || isNaN(portNum)) {
      toast.error("Please fill in all fields");
      return;
    }
    setSaving(true);
    try {
      const result = await createWireguardInterface({
        name,
        port: portNum,
        address,
      });
      setPublicKey(result.public_key);
      toast.success(`WireGuard interface ${name} created`);
      onCreated();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create interface"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-white">
          Create WireGuard Interface
        </DialogTitle>
        <DialogDescription>
          Configure a new WireGuard VPN interface. A keypair will be generated
          automatically.
        </DialogDescription>
      </DialogHeader>

      {publicKey ? (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-950/50 border border-emerald-800 p-4">
            <p className="text-sm font-medium text-emerald-400 mb-2">
              Interface created successfully
            </p>
            <div>
              <Label className="text-xs text-slate-400">
                Server Public Key (share with peers)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white break-all">
                  {publicKey}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyToClipboard(publicKey);
                    toast[ok ? "success" : "error"](ok ? "Public key copied" : "Copy failed");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Interface Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="wg0"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Listen Port</Label>
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="51820"
              type="number"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Address (CIDR)</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="10.10.20.1/24"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Interface
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}

// ── WireGuard Interface Card ─────────────────────────────

function WireGuardInterfaceCard({
  iface,
  onReload,
}: {
  iface: WireguardInterface;
  onReload: () => void;
}) {
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteInterface = async () => {
    setDeleting(true);
    try {
      await deleteWireguardInterface(iface.name);
      toast.success(`Interface ${iface.name} deleted`);
      onReload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to delete interface"
      );
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-indigo-950/50 p-2">
            <Lock className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">{iface.name}</h3>
              {iface.status && (
                <Badge
                  variant="outline"
                  className={
                    iface.status === "u"
                      ? "border-emerald-700 bg-emerald-950/50 text-emerald-400 text-[10px] px-1.5 py-0"
                      : "border-red-700 bg-red-950/50 text-red-400 text-[10px] px-1.5 py-0"
                  }
                >
                  {iface.status === "u" ? "UP" : "DOWN"}
                </Badge>
              )}
            </div>
            <div className="flex gap-3 text-xs text-slate-400">
              {iface.address && <span>{iface.address}</span>}
              {iface.port && <span>Port {iface.port}</span>}
              <span>
                <Users className="mr-0.5 inline h-3 w-3" />
                {iface.peers.length} peer{iface.peers.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Dialog open={showAddPeer} onOpenChange={setShowAddPeer}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Peer
              </Button>
            </DialogTrigger>
            <AddPeerDialog
              interfaceName={iface.name}
              onAdded={() => {
                setShowAddPeer(false);
                onReload();
              }}
            />
          </Dialog>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      {iface.public_key && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Public Key:</span>
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300 break-all">
              {iface.public_key}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={async () => {
                const ok = await copyToClipboard(iface.public_key!);
                toast[ok ? "success" : "error"](ok ? "Public key copied" : "Copy failed");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {iface.peers.length > 0 && (
        <CardContent className="pt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                  <th className="pb-2 pr-4">Peer</th>
                  <th className="pb-2 pr-4">Public Key</th>
                  <th className="pb-2 pr-4">Allowed IPs</th>
                  <th className="pb-2 pr-4">Endpoint</th>
                  <th className="pb-2 pr-4">Last Handshake</th>
                  <th className="pb-2 pr-4">Transfer</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {iface.peers.map((peer) => (
                  <PeerRow
                    key={peer.name}
                    peer={peer}
                    interfaceName={iface.name}
                    onReload={onReload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete {iface.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the WireGuard interface and all its peers. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInterface}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Peer Row ─────────────────────────────────────────────

function PeerRow({
  peer,
  interfaceName,
  onReload,
}: {
  peer: WireguardInterface["peers"][0];
  interfaceName: string;
  onReload: () => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWireguardPeer(interfaceName, peer.name);
      toast.success(`Peer ${peer.name} deleted`);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete peer");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const truncatedKey = peer.public_key
    ? peer.public_key.length > 20
      ? peer.public_key.slice(0, 10) + "…" + peer.public_key.slice(-6)
      : peer.public_key
    : "—";

  return (
    <>
      <tr className="border-b border-slate-700/50">
        <td className="py-2 pr-4 font-medium text-white">{peer.name}</td>
        <td className="py-2 pr-4">
          <code className="text-xs text-slate-300">{truncatedKey}</code>
        </td>
        <td className="py-2 pr-4 text-slate-300">
          {peer.allowed_ips.join(", ") || "—"}
        </td>
        <td className="py-2 pr-4 text-xs text-slate-400">
          {peer.endpoint || "—"}
        </td>
        <td className="py-2 pr-4 text-xs text-slate-400">
          {peer.last_handshake ? formatHandshake(peer.last_handshake) : "—"}
        </td>
        <td className="py-2 pr-4 text-xs text-slate-400">
          {peer.rx_bytes != null || peer.tx_bytes != null ? (
            <span>
              <ArrowDown className="mr-0.5 inline h-3 w-3 text-emerald-400" />
              {formatBytes(peer.rx_bytes ?? 0)}
              <ArrowUp className="ml-1.5 mr-0.5 inline h-3 w-3 text-blue-400" />
              {formatBytes(peer.tx_bytes ?? 0)}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" title="Generate client config">
                  <QrCode className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <GenerateClientConfigDialog
                interfaceName={interfaceName}
                peerName={peer.name}
                defaultAddress={peer.allowed_ips[0] || "10.10.20.2/32"}
                onClose={() => setShowConfigDialog(false)}
              />
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete peer {peer.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the peer from the WireGuard interface.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Add Peer Dialog ──────────────────────────────────────

function AddPeerDialog({
  interfaceName,
  onAdded,
}: {
  interfaceName: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [keepalive, setKeepalive] = useState("25");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name || !publicKey || !allowedIps) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      const keepaliveNum = parseInt(keepalive, 10);
      await addWireguardPeer(interfaceName, {
        name,
        public_key: publicKey,
        allowed_ips: allowedIps,
        persistent_keepalive: isNaN(keepaliveNum) ? undefined : keepaliveNum,
      });
      toast.success(`Peer ${name} added`);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add peer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-white">
          Add Peer to {interfaceName}
        </DialogTitle>
        <DialogDescription>
          Add a new peer to this WireGuard interface. You can generate a client
          config after adding the peer.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-slate-300">Peer Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CLIENT1"
            className="mt-1 border-slate-700 bg-slate-800 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">Public Key</Label>
          <Input
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="Client's WireGuard public key"
            className="mt-1 border-slate-700 bg-slate-800 text-white font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-slate-300">Allowed IPs (CIDR)</Label>
          <Input
            value={allowedIps}
            onChange={(e) => setAllowedIps(e.target.value)}
            placeholder="10.10.20.2/32"
            className="mt-1 border-slate-700 bg-slate-800 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">Persistent Keepalive (seconds)</Label>
          <Input
            value={keepalive}
            onChange={(e) => setKeepalive(e.target.value)}
            placeholder="25"
            type="number"
            className="mt-1 border-slate-700 bg-slate-800 text-white"
          />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add Peer
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

// ── Generate Client Config Dialog ────────────────────────

function GenerateClientConfigDialog({
  interfaceName,
  peerName,
  defaultAddress,
  onClose,
}: {
  interfaceName: string;
  peerName: string;
  defaultAddress: string;
  onClose: () => void;
}) {
  const [clientAddress, setClientAddress] = useState(defaultAddress);
  const [dns, setDns] = useState("1.1.1.1");
  const [endpoint, setEndpoint] = useState("");
  const [allowedIps, setAllowedIps] = useState("0.0.0.0/0, ::/0");
  const [generating, setGenerating] = useState(false);
  const [configResult, setConfigResult] = useState<ClientConfigResponse | null>(
    null
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handleGenerate = async () => {
    if (!clientAddress) {
      toast.error("Client address is required");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateWireguardClientConfig(
        interfaceName,
        peerName,
        {
          client_address: clientAddress,
          dns: dns || undefined,
          endpoint: endpoint || undefined,
          allowed_ips: allowedIps || undefined,
        }
      );
      setConfigResult(result);

      // Generate QR code client-side
      try {
        const url = await QRCode.toDataURL(result.config, {
          width: 280,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
        setQrDataUrl(url);
      } catch {
        // QR generation is optional - don't block if it fails
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to generate config"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!configResult) return;
    const blob = new Blob([configResult.config], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${peerName}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyConfig = async () => {
    if (!configResult) return;
    const ok = await copyToClipboard(configResult.config);
    toast[ok ? "success" : "error"](ok ? "Config copied to clipboard" : "Copy failed");
  };

  return (
    <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-white">
          Generate Client Config — {peerName}
        </DialogTitle>
        <DialogDescription>
          {configResult
            ? "Save this configuration now — the private key is shown only once."
            : "Generate a new client keypair and configuration file for this peer."}
        </DialogDescription>
      </DialogHeader>

      {configResult ? (
        <div className="space-y-4">
          <div className="rounded-md bg-amber-950/30 border border-amber-800/50 px-3 py-2">
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Save this config now — the private key will not be shown again.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-xs text-slate-400">Config File</Label>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-950 p-3 text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {configResult.config}
                </pre>
              </div>

              <div>
                <Label className="text-xs text-slate-400">Client Private Key</Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white break-all font-mono">
                    {showPrivateKey
                      ? configResult.private_key
                      : "••••••••••••••••••••••"}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {qrDataUrl && (
              <div className="flex flex-col items-center gap-2">
                <Label className="text-xs text-slate-400">QR Code</Label>
                <div className="rounded bg-white p-1">
                  <img src={qrDataUrl} alt="QR Code" width={140} height={140} />
                </div>
                <p className="text-[10px] text-slate-500 text-center">
                  Scan with WireGuard app
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCopyConfig}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Config
            </Button>
            <Button onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download .conf
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Client Address (CIDR)</Label>
            <Input
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="10.10.20.2/32"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">DNS Server</Label>
            <Input
              value={dns}
              onChange={(e) => setDns(e.target.value)}
              placeholder="1.1.1.1"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Endpoint (router_ip:port)</Label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="Auto-detect from router config"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Allowed IPs</Label>
            <Input
              value={allowedIps}
              onChange={(e) => setAllowedIps(e.target.value)}
              placeholder="0.0.0.0/0, ::/0"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              <Key className="mr-1.5 h-3.5 w-3.5" />
              Generate Config
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}

// ── OpenVPN Panel ────────────────────────────────────────

function OpenVpnPanel({
  interfaces,
  loading,
  error,
  onReload,
}: {
  interfaces: OpenVpnInterface[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading OpenVPN interfaces…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={onReload}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ovpnInterfaces = interfaces ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white">
            OpenVPN Interfaces
          </CardTitle>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Interface
              </Button>
            </DialogTrigger>
            <CreateOpenVpnInterfaceDialog
              onCreated={() => {
                setShowCreateDialog(false);
                onReload();
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {ovpnInterfaces.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No OpenVPN interfaces configured. Create one to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {ovpnInterfaces.map((iface) => (
                <OpenVpnInterfaceCard
                  key={iface.name}
                  iface={iface}
                  onReload={onReload}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Create OpenVPN Interface Dialog ──────────────────────

function CreateOpenVpnInterfaceDialog({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const [name, setName] = useState("vtun0");
  const [mode, setMode] = useState("server");
  const [protocol, setProtocol] = useState("udp");
  const [localPort, setLocalPort] = useState("1194");
  const [subnet, setSubnet] = useState("10.8.0.0/24");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState("1194");
  const [encryption, setEncryption] = useState("aes256");
  const [hash, setHash] = useState("sha512");
  const [description, setDescription] = useState("");
  const [tlsCaCert, setTlsCaCert] = useState("");
  const [tlsCert, setTlsCert] = useState("");
  const [tlsKey, setTlsKey] = useState("");
  const [tlsDh, setTlsDh] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name || !mode) {
      toast.error("Please fill in required fields");
      return;
    }
    setSaving(true);
    try {
      await createOpenVpnInterface({
        name,
        mode,
        protocol: protocol || undefined,
        local_port: mode === "server" ? parseInt(localPort, 10) || undefined : undefined,
        subnet: mode === "server" && subnet ? subnet : undefined,
        remote_host: mode === "client" && remoteHost ? remoteHost : undefined,
        remote_port: mode === "client" ? parseInt(remotePort, 10) || undefined : undefined,
        encryption: encryption || undefined,
        hash: hash || undefined,
        description: description || undefined,
        tls_ca_cert: tlsCaCert || undefined,
        tls_cert: tlsCert || undefined,
        tls_key: tlsKey || undefined,
        tls_dh: mode === "server" && tlsDh ? tlsDh : undefined,
      });
      toast.success(`OpenVPN interface ${name} created`);
      onCreated();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create interface"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-lg max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-white">
          Create OpenVPN Interface
        </DialogTitle>
        <DialogDescription>
          Configure a new OpenVPN interface. TLS certificate paths refer to
          files on the VyOS router filesystem.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Interface Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vtun0"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Mode</Label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="server">Server</option>
              <option value="client">Client</option>
              <option value="site-to-site">Site-to-Site</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Protocol</Label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="udp">UDP</option>
              <option value="tcp-passive">TCP (Server)</option>
              <option value="tcp-active">TCP (Client)</option>
            </select>
          </div>
          {mode === "server" && (
            <div>
              <Label className="text-slate-300">Local Port</Label>
              <Input
                value={localPort}
                onChange={(e) => setLocalPort(e.target.value)}
                placeholder="1194"
                type="number"
                className="mt-1 border-slate-700 bg-slate-800 text-white"
              />
            </div>
          )}
          {mode === "client" && (
            <div>
              <Label className="text-slate-300">Remote Port</Label>
              <Input
                value={remotePort}
                onChange={(e) => setRemotePort(e.target.value)}
                placeholder="1194"
                type="number"
                className="mt-1 border-slate-700 bg-slate-800 text-white"
              />
            </div>
          )}
        </div>

        {mode === "client" && (
          <div>
            <Label className="text-slate-300">Remote Host</Label>
            <Input
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
              placeholder="vpn.example.com"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
        )}

        {mode === "server" && (
          <div>
            <Label className="text-slate-300">Server Subnet (CIDR)</Label>
            <Input
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="10.8.0.0/24"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-slate-300">Encryption</Label>
            <Input
              value={encryption}
              onChange={(e) => setEncryption(e.target.value)}
              placeholder="aes256"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
          <div>
            <Label className="text-slate-300">Hash</Label>
            <Input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="sha512"
              className="mt-1 border-slate-700 bg-slate-800 text-white"
            />
          </div>
        </div>

        <div>
          <Label className="text-slate-300">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="mt-1 border-slate-700 bg-slate-800 text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300 text-sm font-medium">TLS Certificates (file paths on VyOS)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-slate-400">CA Certificate</Label>
              <Input
                value={tlsCaCert}
                onChange={(e) => setTlsCaCert(e.target.value)}
                placeholder="/config/auth/ca.crt"
                className="mt-1 border-slate-700 bg-slate-800 text-white text-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Certificate</Label>
              <Input
                value={tlsCert}
                onChange={(e) => setTlsCert(e.target.value)}
                placeholder="/config/auth/server.crt"
                className="mt-1 border-slate-700 bg-slate-800 text-white text-xs"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">Private Key</Label>
              <Input
                value={tlsKey}
                onChange={(e) => setTlsKey(e.target.value)}
                placeholder="/config/auth/server.key"
                className="mt-1 border-slate-700 bg-slate-800 text-white text-xs"
              />
            </div>
            {mode === "server" && (
              <div>
                <Label className="text-xs text-slate-400">DH Parameters</Label>
                <Input
                  value={tlsDh}
                  onChange={(e) => setTlsDh(e.target.value)}
                  placeholder="/config/auth/dh.pem"
                  className="mt-1 border-slate-700 bg-slate-800 text-white text-xs"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create Interface
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  );
}

// ── OpenVPN Interface Card ──────────────────────────────

function OpenVpnInterfaceCard({
  iface,
  onReload,
}: {
  iface: OpenVpnInterface;
  onReload: () => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showClients, setShowClients] = useState(false);

  const handleDeleteInterface = async () => {
    setDeleting(true);
    try {
      await deleteOpenVpnInterface(iface.name);
      toast.success(`Interface ${iface.name} deleted`);
      onReload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to delete interface"
      );
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const newDisable = !iface.disabled;
      await toggleOpenVpnInterface(iface.name, newDisable);
      toast.success(
        `OpenVPN interface ${iface.name} ${newDisable ? "disabled" : "enabled"}`
      );
      onReload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to toggle interface"
      );
    } finally {
      setToggling(false);
    }
  };

  const modeLabel =
    iface.mode === "server"
      ? "Server"
      : iface.mode === "client"
        ? "Client"
        : iface.mode === "site-to-site"
          ? "Site-to-Site"
          : iface.mode ?? "Unknown";

  return (
    <Card className="border-slate-700 bg-slate-800/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-orange-950/50 p-2">
            <Globe className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">
                {iface.name}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] border-orange-800 text-orange-400"
              >
                {modeLabel}
              </Badge>
              {iface.disabled ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-red-800 text-red-400"
                >
                  Disabled
                </Badge>
              ) : iface.status === "u/u" ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-emerald-800 text-emerald-400"
                >
                  Up
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] border-slate-600 text-slate-400"
                >
                  {iface.status ?? "Unknown"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              {iface.protocol && <span>Protocol: {iface.protocol}</span>}
              {iface.local_port && <span>Port: {iface.local_port}</span>}
              {iface.subnet && <span>Subnet: {iface.subnet}</span>}
              {iface.remote_host && <span>Remote: {iface.remote_host}</span>}
              {iface.encryption && <span>Cipher: {iface.encryption}</span>}
            </div>
            {iface.description && (
              <p className="text-xs text-slate-500 mt-0.5">{iface.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            onClick={handleToggle}
            disabled={toggling}
            title={iface.disabled ? "Enable" : "Disable"}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </Button>
          <AlertDialog
            open={showDeleteConfirm}
            onOpenChange={setShowDeleteConfirm}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <AlertDialogContent className="border-slate-800 bg-slate-900">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">
                  Delete {iface.name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the OpenVPN interface and all its
                  configuration from the router.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-slate-700">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteInterface}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleting && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      {/* Connected clients for server mode */}
      {iface.mode === "server" && (
        <CardContent className="pt-0">
          <div className="border-t border-slate-700 pt-3">
            <button
              onClick={() => setShowClients(!showClients)}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              {iface.clients.length} connected client
              {iface.clients.length !== 1 ? "s" : ""}
            </button>

            {showClients && iface.clients.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Common Name
                      </th>
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Real Address
                      </th>
                      <th className="py-1.5 pr-3 text-left font-medium">
                        Virtual Address
                      </th>
                      <th className="py-1.5 pr-3 text-right font-medium">
                        Received
                      </th>
                      <th className="py-1.5 pr-3 text-right font-medium">
                        Sent
                      </th>
                      <th className="py-1.5 text-left font-medium">
                        Connected Since
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {iface.clients.map((c, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-800 last:border-0"
                      >
                        <td className="py-1.5 pr-3 text-white">
                          {c.common_name}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-300">
                          {c.real_address ?? "-"}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-300">
                          {c.virtual_address ?? "-"}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">
                          {c.bytes_received != null
                            ? formatBytes(c.bytes_received)
                            : "-"}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">
                          {c.bytes_sent != null
                            ? formatBytes(c.bytes_sent)
                            : "-"}
                        </td>
                        <td className="py-1.5 text-slate-400">
                          {c.connected_since ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────

export default function RouterPage() {
  const [summary, setSummary] = useState<RouterSummary | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mikrotikEnabled, setMikrotikEnabled] = useState(false);
  const [vyosConfigured, setVyosConfigured] = useState(false);
  const [xiaomiEnabled, setXiaomiEnabled] = useState(false);
  const [routerType, setRouterType] = useState<"vyos" | "mikrotik" | "xiaomi">("mikrotik");

  // Load settings to determine which routers are configured
  useEffect(() => {
    const loadSettings = async () => {
      let mtEnabled = false;
      let vyosConf = false;
      let xiEnabled = false;
      try {
        const settings = await fetchSettings();
        mtEnabled = settings.mikrotik_enabled;
        vyosConf = settings.vyos_configured;
        xiEnabled = settings.xiaomi_mesh_enabled;
      } catch {
        // ignore
      }
      setMikrotikEnabled(mtEnabled);
      setVyosConfigured(vyosConf);
      setXiaomiEnabled(xiEnabled);

      // Default to mikrotik if enabled, fallback to xiaomi, then vyos
      if (mtEnabled) {
        setRouterType("mikrotik");
      } else if (xiEnabled) {
        setRouterType("xiaomi");
      } else if (vyosConf) {
        setRouterType("vyos");
      }

      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  // Lazy-load VyOS summary only when VyOS tab is selected
  useEffect(() => {
    if (routerType !== "vyos") return;
    if (summary) return; // already loaded

    const loadVyosSummary = async () => {
      try {
        const s = await fetchRouterSummary();
        setSummary(s);
      } catch {
        setSummary({
          status: { configured: false, reachable: false, version: null, uptime: null, hostname: null },
          interfaces: [],
          config_interfaces: {},
          routes: [],
          dhcp_leases: [],
          dhcp_static_mappings: [],
          dhcp_server_config: { shared_networks: [] },
          firewall: { chains: [] },
          firewall_groups: { address_groups: [], network_groups: [], port_groups: [] },
          dns_forwarding: { name_servers: [], domain_overrides: [], listen_addresses: [], allow_from: [], cache_size: null },
          wireguard: [],
        });
      }
    };
    loadVyosSummary();
  }, [routerType, summary]);

  const neitherConfigured = settingsLoaded && !vyosConfigured && !mikrotikEnabled && !xiaomiEnabled;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Router type selector — skeleton while settings load, tabs when multiple routers available */}
        {!settingsLoaded ? (
          <Skeleton className="h-9 w-48" />
        ) : [mikrotikEnabled, vyosConfigured, xiaomiEnabled].filter(Boolean).length > 1 ? (
          <div className="flex gap-2">
            {mikrotikEnabled && (
              <Button
                variant={routerType === "mikrotik" ? "default" : "outline"}
                size="sm"
                onClick={() => setRouterType("mikrotik")}
                className={
                  routerType === "mikrotik"
                    ? "bg-pink-600 text-white hover:bg-pink-500"
                    : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                }
              >
                <Router className="mr-1.5 h-3.5 w-3.5" />
                MikroTik
              </Button>
            )}
            {xiaomiEnabled && (
              <Button
                variant={routerType === "xiaomi" ? "default" : "outline"}
                size="sm"
                onClick={() => setRouterType("xiaomi")}
                className={
                  routerType === "xiaomi"
                    ? "bg-orange-600 text-white hover:bg-orange-500"
                    : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                }
              >
                <Router className="mr-1.5 h-3.5 w-3.5" />
                Xiaomi
              </Button>
            )}
            {vyosConfigured && (
              <Button
                variant={routerType === "vyos" ? "default" : "outline"}
                size="sm"
                onClick={() => setRouterType("vyos")}
                className={
                  routerType === "vyos"
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                }
              >
                <Router className="mr-1.5 h-3.5 w-3.5" />
                VyOS
              </Button>
            )}
          </div>
        ) : null}

        {/* Content area — skeletons until settings arrive, then router-specific content */}
        {!settingsLoaded ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : neitherConfigured ? (
          <NotConfigured />
        ) : routerType === "xiaomi" && xiaomiEnabled ? (
          <XiaomiRouter />
        ) : routerType === "mikrotik" && mikrotikEnabled ? (
          <MikrotikRouter />
        ) : routerType === "vyos" && !vyosConfigured ? (
          <VyosNotConfigured />
        ) : routerType === "vyos" && !summary ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : routerType === "vyos" && summary?.status.configured ? (
          <Suspense fallback={null}>
            <RouterTabs summary={summary} />
          </Suspense>
        ) : routerType === "vyos" ? (
          <VyosNotConfigured />
        ) : null}
      </div>
    </PageTransition>
  );
}

// ── Tabs component (only rendered when configured) ──────

const VALID_TABS = new Set([
  "system",
  "interfaces",
  "routes",
  "dhcp",
  "dns",
  "firewall",
  "vpn",
  "speedtest",
]);
const DEFAULT_TAB = "interfaces";

function RouterTabs({ summary }: { summary: RouterSummary }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab");
  const tab = rawTab && VALID_TABS.has(rawTab) ? rawTab : DEFAULT_TAB;

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(`/router${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router]
  );
  const { status } = summary;

  const interfaces = useSummaryData(
    summary.interfaces,
    useCallback(() => fetchRouterInterfaces(), [])
  );

  const configIfaces = useSummaryData(
    summary.config_interfaces,
    useCallback(() => fetchRouterConfigInterfaces(), [])
  );

  const routes = useSummaryData(
    summary.routes,
    useCallback(() => fetchRouterRoutes(), [])
  );

  const dhcp = useSummaryData(
    summary.dhcp_leases,
    useCallback(() => fetchRouterDhcpLeases(), [])
  );

  const staticMappings = useSummaryData(
    summary.dhcp_static_mappings,
    useCallback(() => fetchDhcpStaticMappings(), [])
  );

  const dhcpConfig = useSummaryData(
    summary.dhcp_server_config,
    useCallback(() => fetchDhcpServerConfig(), [])
  );

  const firewall = useSummaryData(
    summary.firewall,
    useCallback(() => fetchRouterFirewall(), [])
  );

  const firewallGroups = useSummaryData(
    summary.firewall_groups,
    useCallback(() => fetchFirewallGroups(), [])
  );

  const dnsForwarding = useSummaryData(
    summary.dns_forwarding,
    useCallback(() => fetchDnsForwarding(), [])
  );

  const wireguard = useSummaryData(
    summary.wireguard,
    useCallback(() => fetchWireguardInterfaces(), [])
  );

  const openvpn = useSummaryData(
    null as OpenVpnInterface[] | null,
    useCallback(() => fetchOpenVpnInterfaces(), [])
  );

  // Auto-load OpenVPN data on VPN tab
  const openvpnLoadedRef = useRef(false);
  useEffect(() => {
    if (tab === "vpn" && !openvpnLoadedRef.current) {
      openvpnLoadedRef.current = true;
      openvpn.reload();
    }
  }, [tab, openvpn]);

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
            value="system"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            System
          </TabsTrigger>
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
            value="dns"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Search className="mr-1.5 h-3.5 w-3.5" />
            DNS
          </TabsTrigger>
          <TabsTrigger
            value="firewall"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Firewall
          </TabsTrigger>
          <TabsTrigger
            value="vpn"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            VPN
          </TabsTrigger>
          <TabsTrigger
            value="speedtest"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Gauge className="mr-1.5 h-3.5 w-3.5" />
            Speed Test
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <SystemInfoPanel onTabActive={tab === "system"} />
        </TabsContent>

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
                Pools &amp; Subnets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DhcpPoolsCard
                config={dhcpConfig.data ?? null}
                loading={dhcpConfig.loading}
                error={dhcpConfig.error}
                onReload={dhcpConfig.reload}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Active Leases
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
                Static Mappings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StaticMappingsTable
                mappings={Array.isArray(staticMappings.data) ? staticMappings.data : null}
                loading={staticMappings.loading}
                error={staticMappings.error}
                onReload={staticMappings.reload}
                dhcpConfig={dhcpConfig.data ?? null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dns" className="space-y-4">
          <DnsForwardingPanel
            config={dnsForwarding.data ?? null}
            loading={dnsForwarding.loading}
            error={dnsForwarding.error}
            onReload={dnsForwarding.reload}
          />
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

        <TabsContent value="vpn">
          <div className="space-y-6">
            <WireGuardPanel
              interfaces={Array.isArray(wireguard.data) ? wireguard.data : null}
              loading={wireguard.loading}
              error={wireguard.error}
              onReload={wireguard.reload}
            />
            <OpenVpnPanel
              interfaces={Array.isArray(openvpn.data) ? openvpn.data : null}
              loading={openvpn.loading}
              error={openvpn.error}
              onReload={openvpn.reload}
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
