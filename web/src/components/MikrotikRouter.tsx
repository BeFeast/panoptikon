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
  Activity,
  Lock,
  Search,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  if (!bytes) return "-";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatMemory(bytes: string | null): string {
  if (!bytes) return "-";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
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
              <span className="text-slate-600">· RouterOS {status.version}</span>
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
            Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
          >
            Unreachable
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

// ── System Tab ────────────────────────────────────────────

function SystemTab({ status }: { status: MikrotikStatus }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">Version</p>
          <p className="text-lg text-white">{status.version ?? "-"}</p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">CPU Load</p>
          <p className="text-lg text-white">{status.cpu_load ? `${status.cpu_load}%` : "-"}</p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">Memory</p>
          <p className="text-lg text-white">
            {status.free_memory && status.total_memory
              ? `${formatMemory(String(parseInt(status.total_memory) - parseInt(status.free_memory)))} / ${formatMemory(status.total_memory)}`
              : "-"}
          </p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">Uptime</p>
          <p className="text-lg text-white">{status.uptime ?? "-"}</p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">Platform</p>
          <p className="text-lg text-white">{status.platform ?? "-"} {status.architecture ? `(${status.architecture})` : ""}</p>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-2 py-4">
          <p className="text-xs font-medium uppercase text-slate-500">Board</p>
          <p className="text-lg text-white">{status.board_name ?? "-"}</p>
        </CardContent>
      </Card>
    </div>
  );
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

// ── Table wrapper ─────────────────────────────────────────

function DataTable<T>({
  data,
  loading,
  error,
  onReload,
  columns,
  renderRow,
}: {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  columns: string[];
  renderRow: (item: T, i: number) => React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-rose-400">
        <AlertCircle className="h-4 w-4" />
        {error}
        <Button variant="ghost" size="sm" onClick={onReload}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-500">No data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {data.map(renderRow)}
        </tbody>
      </table>
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

  const ifaces = useData(
    useCallback(() => fetchMikrotikInterfaces(), [])
  );
  const routes = useData(
    useCallback(() => fetchMikrotikRoutes(), [])
  );
  const dhcp = useData(
    useCallback(() => fetchMikrotikDhcpLeases(), [])
  );
  const fw = useData(
    useCallback(() => fetchMikrotikFirewall(), [])
  );
  const dns = useData(
    useCallback(() => fetchMikrotikDns(), [])
  );
  const wg = useData(
    useCallback(() => fetchMikrotikWireguard(), [])
  );

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
            WireGuard
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
              <DataTable<MikrotikInterface>
                data={ifaces.data}
                loading={ifaces.loading}
                error={ifaces.error}
                onReload={ifaces.reload}
                columns={["Name", "Type", "IP Address", "MAC", "MTU", "Status", "TX", "RX"]}
                renderRow={(iface, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="px-3 py-2 font-mono text-xs">{iface.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{iface.iface_type ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{iface.ip_address ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{iface.mac ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{iface.mtu ?? "-"}</td>
                    <td className="px-3 py-2">
                      {iface.running ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">up</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
                          {iface.disabled ? "disabled" : "down"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatBytes(iface.tx_bytes)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{formatBytes(iface.rx_bytes)}</td>
                  </tr>
                )}
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
              <DataTable<MikrotikRoute>
                data={routes.data}
                loading={routes.loading}
                error={routes.error}
                onReload={routes.reload}
                columns={["Destination", "Gateway", "Distance", "Table", "Status"]}
                renderRow={(route, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="px-3 py-2 font-mono text-xs">{route.dst_address}</td>
                    <td className="px-3 py-2 font-mono text-xs">{route.gateway ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{route.distance ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{route.routing_table ?? "main"}</td>
                    <td className="px-3 py-2">
                      {route.active ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">active</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
                          {route.disabled ? "disabled" : "inactive"}
                        </Badge>
                      )}
                      {route.dynamic && (
                        <Badge variant="outline" className="ml-1 border-blue-500/30 text-blue-400 text-xs">dynamic</Badge>
                      )}
                    </td>
                  </tr>
                )}
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
              <DataTable<MikrotikDhcpLease>
                data={dhcp.data}
                loading={dhcp.loading}
                error={dhcp.error}
                onReload={dhcp.reload}
                columns={["IP Address", "MAC", "Hostname", "Status", "Expires", "Server"]}
                renderRow={(lease, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="px-3 py-2 font-mono text-xs">{lease.address}</td>
                    <td className="px-3 py-2 font-mono text-xs">{lease.mac_address ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{lease.host_name ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          lease.status === "bound"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                            : "border-slate-700 text-slate-500 text-xs"
                        }
                      >
                        {lease.status ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{lease.expires_after ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{lease.server ?? "-"}</td>
                  </tr>
                )}
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
              {dns.loading ? (
                <Skeleton className="h-20 w-full" />
              ) : dns.error ? (
                <div className="flex items-center gap-2 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4" />
                  {dns.error}
                </div>
              ) : dns.data ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-slate-500">Servers</p>
                    <div className="flex flex-wrap gap-2">
                      {dns.data.servers.length > 0 ? (
                        dns.data.servers.map((s) => (
                          <Badge key={s} variant="outline" className="border-slate-700 font-mono text-xs text-slate-300">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">No DNS servers configured.</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Allow Remote Requests</p>
                      <p className="text-white">{dns.data.allow_remote_requests ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Cache Size</p>
                      <p className="text-white">{dns.data.cache_size ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Cache Used</p>
                      <p className="text-white">{dns.data.cache_used ?? "-"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall" className="space-y-4">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Filter Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={fw.data?.filter_rules ?? null}
                loading={fw.loading}
                error={fw.error}
                onReload={fw.reload}
                columns={["Chain", "Action", "Protocol", "Src", "Dst", "Port", "Comment", "Status"]}
                renderRow={(rule, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="px-3 py-2 text-xs">{rule.chain ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          rule.action === "accept"
                            ? "border-emerald-500/30 text-emerald-400 text-xs"
                            : rule.action === "drop"
                              ? "border-rose-500/30 text-rose-400 text-xs"
                              : "border-slate-700 text-slate-400 text-xs"
                        }
                      >
                        {rule.action ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{rule.protocol ?? "any"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{rule.src_address ?? "any"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{rule.dst_address ?? "any"}</td>
                    <td className="px-3 py-2 text-xs">{rule.dst_port ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rule.comment ?? ""}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={rule.disabled ? "border-slate-700 text-slate-500 text-xs" : "border-emerald-500/30 text-emerald-400 text-xs"}
                      >
                        {rule.disabled ? "disabled" : "enabled"}
                      </Badge>
                    </td>
                  </tr>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                NAT Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={fw.data?.nat_rules ?? null}
                loading={fw.loading}
                error={fw.error}
                onReload={fw.reload}
                columns={["Chain", "Action", "Protocol", "Dst", "Port", "To", "Comment"]}
                renderRow={(rule, i) => (
                  <tr key={i} className="text-slate-300">
                    <td className="px-3 py-2 text-xs">{rule.chain ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{rule.action ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{rule.protocol ?? "any"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{rule.dst_address ?? "any"}</td>
                    <td className="px-3 py-2 text-xs">{rule.dst_port ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {rule.to_addresses ?? "-"}{rule.to_ports ? `:${rule.to_ports}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{rule.comment ?? ""}</td>
                  </tr>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vpn">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                WireGuard Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              {wg.loading ? (
                <Skeleton className="h-20 w-full" />
              ) : wg.error ? (
                <div className="flex items-center gap-2 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4" />
                  {wg.error}
                </div>
              ) : !wg.data?.interfaces.length ? (
                <p className="text-sm text-slate-500">No WireGuard interfaces configured.</p>
              ) : (
                <div className="space-y-4">
                  {wg.data.interfaces.map((iface) => (
                    <div key={iface.name} className="rounded-lg border border-slate-800 p-4">
                      <div className="mb-3 flex items-center gap-3">
                        <span className="font-mono text-sm text-white">{iface.name}</span>
                        <Badge
                          variant="outline"
                          className={iface.running ? "border-emerald-500/30 text-emerald-400 text-xs" : "border-slate-700 text-slate-500 text-xs"}
                        >
                          {iface.running ? "running" : iface.disabled ? "disabled" : "down"}
                        </Badge>
                        {iface.listen_port && (
                          <span className="text-xs text-slate-500">port {iface.listen_port}</span>
                        )}
                      </div>
                      {iface.peers.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-left text-slate-500">
                              <th className="px-2 py-1">Public Key</th>
                              <th className="px-2 py-1">Endpoint</th>
                              <th className="px-2 py-1">Allowed IPs</th>
                              <th className="px-2 py-1">RX</th>
                              <th className="px-2 py-1">TX</th>
                              <th className="px-2 py-1">Last Handshake</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {iface.peers.map((peer, i) => (
                              <tr key={i} className="text-slate-300">
                                <td className="px-2 py-1 font-mono">{peer.public_key ? `${peer.public_key.slice(0, 12)}...` : "-"}</td>
                                <td className="px-2 py-1 font-mono">{peer.endpoint ?? "-"}</td>
                                <td className="px-2 py-1 font-mono">{peer.allowed_address ?? "-"}</td>
                                <td className="px-2 py-1">{formatBytes(peer.rx)}</td>
                                <td className="px-2 py-1">{formatBytes(peer.tx)}</td>
                                <td className="px-2 py-1">{peer.last_handshake ?? "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
