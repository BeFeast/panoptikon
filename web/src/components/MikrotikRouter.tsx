"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Network,
  Globe,
  Shield,
  Server,
  AlertCircle,
  Activity,
  Lock,
  Search,
  Cpu,
  Clock,
  MemoryStick,
  Monitor,
  HardDrive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchMikrotikStatus,
  fetchMikrotikInterfaces,
  fetchMikrotikRoutes,
  fetchMikrotikDhcpLeases,
  fetchMikrotikFirewall,
  fetchMikrotikDns,
  fetchMikrotikWireguard,
} from "@/lib/api";
import type {
  MikrotikStatus,
  MikrotikInterface,
  MikrotikRoute,
  MikrotikDhcpLease,
  MikrotikFirewall,
  MikrotikDns,
  MikrotikWireguard,
} from "@/lib/types";

function formatBytes(bytes: string | null): string {
  if (!bytes) return "\u2014";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatMemory(bytes: string | null): string {
  if (!bytes) return "\u2014";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

// ── Generic data loader hook ──────────────────────────────

function useData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

// ── Status Header ─────────────────────────────────────────

function StatusHeader({ status }: { status: MikrotikStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10">
          <Router className="h-5 w-5 text-pink-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">MikroTik Router</h1>
          <p className="text-xs text-slate-500">
            {status.board_name ?? "RouterOS"}{" "}
            {status.version && (
              <span className="text-slate-600">&middot; RouterOS {status.version}</span>
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
            &#9679; Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
          >
            &#9679; Unreachable
          </Badge>
        )}
        {status.uptime && (
          <Badge variant="outline" className="border-slate-800 text-slate-400">
            Uptime: {status.uptime}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────

function SystemTab({ status }: { status: MikrotikStatus }) {
  const memUsed =
    status.free_memory && status.total_memory
      ? String(parseInt(status.total_memory) - parseInt(status.free_memory))
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pink-500/10">
              <Monitor className="h-4.5 w-4.5 text-pink-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Version</p>
              <p className="truncate text-sm font-medium text-white">
                {status.version ?? "\u2014"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Clock className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Uptime</p>
              <p className="truncate text-sm font-medium text-white">
                {status.uptime ?? "\u2014"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <Cpu className="h-4.5 w-4.5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">CPU Load</p>
              <p className="text-sm font-medium text-white">
                {status.cpu_load ? `${status.cpu_load}%` : "\u2014"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
              <MemoryStick className="h-4.5 w-4.5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Memory</p>
              <p className="text-sm font-medium text-white">
                {memUsed
                  ? `${formatMemory(memUsed)} / ${formatMemory(status.total_memory)}`
                  : "\u2014"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
              <HardDrive className="h-4.5 w-4.5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Platform</p>
              <p className="truncate text-sm font-medium text-white">
                {status.platform ?? "\u2014"}{" "}
                {status.architecture ? `(${status.architecture})` : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Server className="h-4.5 w-4.5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">Board</p>
              <p className="truncate text-sm font-medium text-white">
                {status.board_name ?? "\u2014"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Interfaces Table ──────────────────────────────────────

function InterfacesTable({
  data,
  loading,
  error,
}: {
  data: MikrotikInterface[] | null;
  loading: boolean;
  error: string | null;
}) {
  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
      <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
      <th className="px-4 py-3 font-medium text-slate-400">Type</th>
      <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">MAC</th>
      <th className="px-4 py-3 font-medium text-slate-400">MTU</th>
      <th className="px-4 py-3 font-medium text-slate-400">TX</th>
      <th className="px-4 py-3 font-medium text-slate-400">RX</th>
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Skeleton className="h-2.5 w-2.5 rounded-full" /><Skeleton className="h-5 w-10 rounded-full" /></div></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
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

  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No interfaces found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((iface) => (
            <tr
              key={iface.name}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      iface.running
                        ? "bg-emerald-400"
                        : iface.disabled
                          ? "bg-slate-600"
                          : "bg-amber-400"
                    }`}
                  />
                  <Badge
                    variant="outline"
                    className={
                      iface.running
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                        : "border-slate-700 text-slate-500 text-xs"
                    }
                  >
                    {iface.running ? "up" : iface.disabled ? "disabled" : "down"}
                  </Badge>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {iface.name}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400">{iface.iface_type ?? "\u2014"}</span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {iface.ip_address ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {iface.mac ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">{iface.mtu ?? "\u2014"}</span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {formatBytes(iface.tx_bytes)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {formatBytes(iface.rx_bytes)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Routes Table ──────────────────────────────────────────

function RoutesTable({
  data,
  loading,
  error,
}: {
  data: MikrotikRoute[] | null;
  loading: boolean;
  error: string | null;
}) {
  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
      <th className="px-4 py-3 font-medium text-slate-400">Destination</th>
      <th className="px-4 py-3 font-medium text-slate-400">Gateway</th>
      <th className="px-4 py-3 font-medium text-slate-400">Distance</th>
      <th className="px-4 py-3 font-medium text-slate-400">Table</th>
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
                <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
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

  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No routes found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((route, idx) => (
            <tr
              key={`${route.dst_address}-${idx}`}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {route.active ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                    >
                      active
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-slate-500 text-xs"
                    >
                      {route.disabled ? "disabled" : "inactive"}
                    </Badge>
                  )}
                  {route.dynamic && (
                    <Badge
                      variant="outline"
                      className="border-blue-500/30 text-blue-400 text-xs"
                    >
                      dynamic
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {route.dst_address}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {route.gateway ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {route.distance ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400">
                  {route.routing_table ?? "main"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DHCP Leases Table ─────────────────────────────────────

function DhcpLeasesTable({
  data,
  loading,
  error,
}: {
  data: MikrotikDhcpLease[] | null;
  loading: boolean;
  error: string | null;
}) {
  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">MAC Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">Hostname</th>
      <th className="px-4 py-3 font-medium text-slate-400">Server</th>
      <th className="px-4 py-3 font-medium text-slate-400">Expires</th>
      <th className="px-4 py-3 font-medium text-slate-400">State</th>
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

  if (!data || data.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No DHCP leases found. DHCP server may not be configured.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((lease, idx) => (
            <tr
              key={`${lease.address}-${idx}`}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {lease.address}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {lease.mac_address ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">
                  {lease.host_name ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">
                  {lease.server ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {lease.expires_after ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={
                    lease.status === "bound"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                      : "border-slate-700 text-slate-500 text-xs"
                  }
                >
                  {lease.status ?? "\u2014"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Firewall Tables ───────────────────────────────────────

function FirewallPanel({
  data,
  loading,
  error,
}: {
  data: MikrotikFirewall | null;
  loading: boolean;
  error: string | null;
}) {
  const filterHeaderCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Chain</th>
      <th className="px-4 py-3 font-medium text-slate-400">Action</th>
      <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
      <th className="px-4 py-3 font-medium text-slate-400">Src</th>
      <th className="px-4 py-3 font-medium text-slate-400">Dst</th>
      <th className="px-4 py-3 font-medium text-slate-400">Port</th>
      <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
    </tr>
  );

  const natHeaderCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Chain</th>
      <th className="px-4 py-3 font-medium text-slate-400">Action</th>
      <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
      <th className="px-4 py-3 font-medium text-slate-400">Dst</th>
      <th className="px-4 py-3 font-medium text-slate-400">Port</th>
      <th className="px-4 py-3 font-medium text-slate-400">To</th>
      <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
    </tr>
  );

  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">Filter Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-sm">
              <thead>{filterHeaderCols}</thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-b-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">Filter Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.filter_rules.length ? (
            <p className="py-4 text-sm text-slate-500">No filter rules configured.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-sm">
                <thead>{filterHeaderCols}</thead>
                <tbody>
                  {data.filter_rules.map((rule, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-300">{rule.chain ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            rule.action === "accept"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                              : rule.action === "drop"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs"
                                : "border-slate-700 text-slate-400 text-xs"
                          }
                        >
                          {rule.action ?? "\u2014"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{rule.protocol ?? "any"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-xs text-slate-400">
                          {rule.src_address ?? "any"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-xs text-slate-400">
                          {rule.dst_address ?? "any"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{rule.dst_port ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-500">{rule.comment ?? ""}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            rule.disabled
                              ? "border-slate-700 text-slate-500 text-xs"
                              : "border-emerald-500/30 text-emerald-400 text-xs"
                          }
                        >
                          {rule.disabled ? "disabled" : "enabled"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">NAT Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.nat_rules.length ? (
            <p className="py-4 text-sm text-slate-500">No NAT rules configured.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-sm">
                <thead>{natHeaderCols}</thead>
                <tbody>
                  {data.nat_rules.map((rule, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-300">{rule.chain ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-slate-300">{rule.action ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-slate-300">{rule.protocol ?? "any"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-xs text-slate-400">
                          {rule.dst_address ?? "any"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{rule.dst_port ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-slate-300">
                          {rule.to_addresses ?? "\u2014"}
                          {rule.to_ports ? `:${rule.to_ports}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-500">{rule.comment ?? ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── DNS Panel ─────────────────────────────────────────────

function DnsPanel({
  data,
  loading,
  error,
}: {
  data: MikrotikDns | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
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

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">
          Upstream Servers
        </p>
        <div className="flex flex-wrap gap-2">
          {data.servers.length > 0 ? (
            data.servers.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="border-slate-700 font-mono text-xs text-slate-300"
              >
                {s}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-slate-500">No DNS servers configured.</p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Allow Remote Requests</p>
            <p className="text-sm font-medium text-white">
              {data.allow_remote_requests ? "Yes" : "No"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Cache Size</p>
            <p className="text-sm font-medium text-white">
              {data.cache_size ?? "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Cache Used</p>
            <p className="text-sm font-medium text-white">
              {data.cache_used ?? "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── WireGuard Panel ───────────────────────────────────────

function WireGuardPanel({
  data,
  loading,
  error,
}: {
  data: MikrotikWireguard | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
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

  if (!data?.interfaces.length) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No WireGuard interfaces configured.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.interfaces.map((iface) => (
        <div
          key={iface.name}
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <div className="mb-3 flex items-center gap-3">
            <span className="font-mono text-sm font-medium text-white">
              {iface.name}
            </span>
            <Badge
              variant="outline"
              className={
                iface.running
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                  : "border-slate-700 text-slate-500 text-xs"
              }
            >
              {iface.running ? "running" : iface.disabled ? "disabled" : "down"}
            </Badge>
            {iface.listen_port && (
              <span className="text-xs text-slate-500">
                port {iface.listen_port}
              </span>
            )}
          </div>
          {iface.peers.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 text-left">
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Public Key
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Endpoint
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Allowed IPs
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">RX</th>
                    <th className="px-3 py-2 font-medium text-slate-400">TX</th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Last Handshake
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {iface.peers.map((peer, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors text-slate-300"
                    >
                      <td className="px-3 py-2 font-mono">
                        {peer.public_key
                          ? `${peer.public_key.slice(0, 12)}...`
                          : "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {peer.endpoint ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {peer.allowed_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2">{formatBytes(peer.rx)}</td>
                      <td className="px-3 py-2">{formatBytes(peer.tx)}</td>
                      <td className="px-3 py-2">
                        {peer.last_handshake ?? "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function MikrotikRouter() {
  const [status, setStatus] = useState<MikrotikStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("system");

  useEffect(() => {
    fetchMikrotikStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          configured: false,
          reachable: false,
          version: null,
          uptime: null,
          cpu_load: null,
          total_memory: null,
          free_memory: null,
          board_name: null,
          architecture: null,
          platform: null,
        })
      )
      .finally(() => setLoading(false));
  }, []);

  const ifaces = useData(useCallback(() => fetchMikrotikInterfaces(), []));
  const routes = useData(useCallback(() => fetchMikrotikRoutes(), []));
  const dhcp = useData(useCallback(() => fetchMikrotikDhcpLeases(), []));
  const fw = useData(useCallback(() => fetchMikrotikFirewall(), []));
  const dns = useData(useCallback(() => fetchMikrotikDns(), []));
  const wg = useData(useCallback(() => fetchMikrotikWireguard(), []));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status?.configured || !status?.reachable) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-slate-400">
          {!status?.configured
            ? "MikroTik router is not configured. Enable it in Settings."
            : "MikroTik router is unreachable. Check connection settings."}
        </p>
      </div>
    );
  }

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
        </TabsList>

        <TabsContent value="system">
          <SystemTab status={status} />
        </TabsContent>

        <TabsContent value="interfaces">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Network Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InterfacesTable
                data={ifaces.data}
                loading={ifaces.loading}
                error={ifaces.error}
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
                data={routes.data}
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
                DHCP Leases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DhcpLeasesTable
                data={dhcp.data}
                loading={dhcp.loading}
                error={dhcp.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dns">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DNS Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DnsPanel
                data={dns.data}
                loading={dns.loading}
                error={dns.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall" className="space-y-4">
          <FirewallPanel
            data={fw.data}
            loading={fw.loading}
            error={fw.error}
          />
        </TabsContent>

        <TabsContent value="vpn">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                WireGuard Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WireGuardPanel
                data={wg.data}
                loading={wg.loading}
                error={wg.error}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
