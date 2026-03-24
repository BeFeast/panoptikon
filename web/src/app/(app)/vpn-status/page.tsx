"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import { fetchVpnStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  OvpnClientStatus,
  VpnInterfaceStatus,
  VpnStatusResponse,
} from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

/** Format bytes into a human-readable string. */
function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format a UNIX timestamp into a human-friendly "time ago" string. */
function timeAgo(ts: number | null): string {
  if (ts == null) return "Never";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 0) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function VpnStatusPage() {
  const [data, setData] = useState<VpnStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useHashTab("overview", [
    "overview",
    "mikrotik",
    "openvpn",
  ]);
  const defaultTabSet = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchVpnStatus();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Default to MikroTik tab when available (once, on first data load)
  // Skip if hash already specifies a tab.
  useEffect(() => {
    if (!data || defaultTabSet.current) return;
    defaultTabSet.current = true;
    if (data.mikrotik_available && !window.location.hash.slice(1)) {
      setActiveTab("mikrotik");
    }
  }, [data, setActiveTab]);

  const filteredInterfaces = useMemo(() => {
    if (!data) return null;
    if (!search.trim()) return data.interfaces;
    const q = search.toLowerCase();
    return data.interfaces
      .map((iface) => ({
        ...iface,
        peers: iface.peers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.endpoint ?? "").toLowerCase().includes(q) ||
            p.allowed_ips.some((ip) => ip.toLowerCase().includes(q)) ||
            (p.public_key ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter(
        (iface) =>
          iface.name.toLowerCase().includes(q) || iface.peers.length > 0,
      );
  }, [data, search]);

  const mikrotikInterfaces = useMemo(
    () => filteredInterfaces?.filter((i) => i.source === "mikrotik") ?? [],
    [filteredInterfaces],
  );

  const wireguardInterfaces = useMemo(
    () =>
      filteredInterfaces?.filter(
        (i) => (i.vpn_type ?? "wireguard") === "wireguard",
      ) ?? [],
    [filteredInterfaces],
  );

  const openvpnInterfaces = useMemo(
    () => filteredInterfaces?.filter((i) => i.vpn_type === "openvpn") ?? [],
    [filteredInterfaces],
  );

  const overviewInterfaces = useMemo(() => {
    if (!data) return [];
    return data.interfaces;
  }, [data]);

  const openvpnClients = data?.openvpn_clients ?? [];

  return (
    <PageTransition>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-cyan-500/10 text-indigo-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                VPN Status
              </h1>
              <p className="text-sm text-slate-400">
                WireGuard &amp; OpenVPN tunnels, peer connectivity, and transfer
                stats.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Interfaces"
            value={data ? overviewInterfaces.length : null}
            loading={loading && !data}
            icon={<Shield className="h-4 w-4 text-indigo-300" />}
            iconClass="border-indigo-500/30 bg-indigo-500/15"
          />
          <SummaryCard
            title="Peers Online"
            value={data?.online_peers ?? null}
            loading={loading && !data}
            icon={<Wifi className="h-4 w-4 text-emerald-300" />}
            iconClass="border-emerald-500/30 bg-emerald-500/15"
            subtitle={data ? `of ${data.total_peers} total` : undefined}
          />
          <SummaryCard
            title="Total RX"
            value={data ? formatBytes(data.total_rx_bytes) : null}
            loading={loading && !data}
            icon={<ArrowDownToLine className="h-4 w-4 text-cyan-300" />}
            iconClass="border-cyan-500/30 bg-cyan-500/15"
            isText
          />
          <SummaryCard
            title="Total TX"
            value={data ? formatBytes(data.total_tx_bytes) : null}
            loading={loading && !data}
            icon={<ArrowUpFromLine className="h-4 w-4 text-amber-300" />}
            iconClass="border-amber-500/30 bg-amber-500/15"
            isText
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto rounded-xl border border-slate-800/80 bg-slate-900/70 p-1">
            <TabsTrigger
              value="overview"
              className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            {data?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                MikroTik
              </TabsTrigger>
            )}
            {data?.openvpn_enabled && (
              <TabsTrigger
                value="openvpn"
                className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                OpenVPN
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">
                  Tunnel Overview
                </CardTitle>
                <CardDescription className="text-sm text-slate-400">
                  Peers are treated as online when the last handshake is within
                  3 minutes. Data auto-refreshes every 30 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  {wireguardInterfaces.length > 0 && (
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        WireGuard
                      </p>
                      <p className="mt-1 text-slate-200">
                        <span className="font-semibold text-white">
                          {wireguardInterfaces.length}
                        </span>{" "}
                        interface
                        {wireguardInterfaces.length === 1 ? "" : "s"},{" "}
                        <span className="font-semibold text-white">
                          {wireguardInterfaces.reduce(
                            (sum, i) => sum + i.peers_total,
                            0,
                          )}
                        </span>{" "}
                        peer
                        {wireguardInterfaces.reduce(
                          (sum, i) => sum + i.peers_total,
                          0,
                        ) === 1
                          ? ""
                          : "s"}
                        ,{" "}
                        <span className="font-semibold text-emerald-300">
                          {wireguardInterfaces.reduce(
                            (sum, i) => sum + i.peers_online,
                            0,
                          )}{" "}
                          online
                        </span>
                      </p>
                    </div>
                  )}
                  {data?.openvpn_enabled && (
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        OpenVPN
                      </p>
                      <p className="mt-1 text-slate-200">
                        <span className="font-semibold text-emerald-300">
                          {openvpnClients.length} connected
                        </span>{" "}
                        client{openvpnClients.length === 1 ? "" : "s"}
                        {openvpnInterfaces.length > 0 && (
                          <>
                            ,{" "}
                            <span className="font-semibold text-white">
                              {openvpnInterfaces.reduce(
                                (sum, i) => sum + i.peers_total,
                                0,
                              )}
                            </span>{" "}
                            interface
                            {openvpnInterfaces.reduce(
                              (sum, i) => sum + i.peers_total,
                              0,
                            ) === 1
                              ? ""
                              : "s"}
                          </>
                        )}
                      </p>
                    </div>
                  )}
                  {!data?.mikrotik_available &&
                    !data?.openvpn_enabled &&
                    !loading && (
                      <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3 text-slate-400">
                        No router is configured. Configure router credentials in
                        Settings.
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {overviewInterfaces.length === 0 && !loading ? (
              <Card className={surfaceClass}>
                <CardContent className="py-12 text-center text-sm text-slate-500">
                  No VPN interfaces found.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {overviewInterfaces.map((iface) => (
                  <InterfaceCard
                    key={`${iface.source}-${iface.name}`}
                    iface={iface}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="mikrotik" className="space-y-4 pt-2">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Filter peers, endpoints, or allowed IPs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-slate-800 bg-slate-950/70 pl-10 text-white placeholder:text-slate-600"
              />
            </div>

            {mikrotikInterfaces.length === 0 ? (
              <Card className={surfaceClass}>
                <CardContent className="py-12 text-center text-slate-500">
                  {search
                    ? "No interfaces or peers match your filter."
                    : "No MikroTik WireGuard interfaces found."}
                </CardContent>
              </Card>
            ) : (
              mikrotikInterfaces.map((iface) => (
                <InterfaceCard
                  key={`${iface.source}-${iface.name}`}
                  iface={iface}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="openvpn" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-orange-300" />
                  <CardTitle className="text-base text-white">
                    OpenVPN Connected Clients
                  </CardTitle>
                </div>
                <CardDescription className="text-sm text-slate-400">
                  Active OpenVPN sessions from MikroTik PPP connections.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-slate-800/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Status
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Client
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Address
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Caller ID
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Uptime
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Encoding
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openvpnClients.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell
                            colSpan={6}
                            className="py-9 text-center text-sm text-slate-500"
                          >
                            No OpenVPN clients connected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        openvpnClients.map((client) => (
                          <OvpnClientRow key={client.name} client={client} />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {openvpnInterfaces.map((iface) => (
              <InterfaceCard
                key={`${iface.source}-${iface.name}`}
                iface={iface}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}

function SummaryCard({
  title,
  value,
  loading,
  icon,
  iconClass,
  subtitle,
  isText,
}: {
  title: string;
  value: number | string | null;
  loading: boolean;
  icon: React.ReactNode;
  iconClass: string;
  subtitle?: string;
  isText?: boolean;
}) {
  return (
    <Card className={surfaceClass}>
      <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
            iconClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-20 bg-slate-800" />
          ) : (
            <p
              className={cn(
                "mt-1 font-semibold text-white",
                isText ? "text-base" : "text-2xl",
              )}
            >
              {value ?? "—"}
            </p>
          )}
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function InterfaceCard({ iface }: { iface: VpnInterfaceStatus }) {
  const isUp = iface.status === "up" || iface.status === "u/u";
  const vpnType = iface.vpn_type ?? "wireguard";

  return (
    <Card className={surfaceClass}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold text-white">
              {iface.name}
            </CardTitle>
            <Badge
              variant="outline"
              className={cn(
                "rounded-md border text-[11px] uppercase",
                isUp
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300",
              )}
            >
              {isUp ? "up" : "down"}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md border-slate-700 bg-slate-900/60 text-[11px] uppercase text-slate-400"
            >
              {iface.source}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "rounded-md border text-[11px] uppercase",
                vpnType === "openvpn"
                  ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-300",
              )}
            >
              {vpnType}
            </Badge>
          </div>

          <div className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-1 text-xs text-slate-400">
            <span className="font-medium text-slate-200">
              {iface.peers_online}
            </span>
            <span className="mx-1 text-slate-600">/</span>
            <span>{iface.peers_total}</span> online
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
          {iface.address && (
            <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-1 font-mono">
              {iface.address}
            </span>
          )}
          {iface.port && (
            <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-1">
              Port {iface.port}
            </span>
          )}
          {iface.public_key && (
            <span className="max-w-full truncate rounded-md border border-slate-800/80 bg-slate-950/60 px-2 py-1 font-mono">
              Key {iface.public_key.substring(0, 12)}...
            </span>
          )}
        </div>

        {/* Per-tunnel bandwidth summary */}
        {iface.peers.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <ArrowDownToLine className="h-3 w-3 text-cyan-400" />
              RX:{" "}
              {formatBytes(
                iface.peers.reduce(
                  (sum, p) => sum + (p.rx_bytes ?? 0),
                  0,
                ),
              )}
            </span>
            <span className="flex items-center gap-1">
              <ArrowUpFromLine className="h-3 w-3 text-amber-400" />
              TX:{" "}
              {formatBytes(
                iface.peers.reduce(
                  (sum, p) => sum + (p.tx_bytes ?? 0),
                  0,
                ),
              )}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto border-t border-slate-800/70">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800/70 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                  Status
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                  Peer
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                  Endpoint
                </TableHead>
                {vpnType === "wireguard" && (
                  <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                    Allowed IPs
                  </TableHead>
                )}
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                  {vpnType === "wireguard" ? "Last Handshake" : "Status"}
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                  RX
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                  TX
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {iface.peers.length === 0 ? (
                <TableRow className="border-slate-800/70 hover:bg-transparent">
                  <TableCell
                    colSpan={vpnType === "wireguard" ? 7 : 6}
                    className="py-9 text-center text-sm text-slate-500"
                  >
                    No peers configured.
                  </TableCell>
                </TableRow>
              ) : (
                iface.peers.map((peer, idx) => (
                  <TableRow
                    key={peer.public_key ?? `${iface.name}-${idx}`}
                    className="border-slate-800/70 hover:bg-slate-800/35"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {peer.connectivity === "online" ? (
                          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5 text-slate-600" />
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-md border text-[11px] uppercase",
                            peer.connectivity === "online"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-slate-700 bg-slate-900/70 text-slate-500",
                          )}
                        >
                          {peer.connectivity}
                        </Badge>
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[220px]">
                      <div
                        className="truncate font-medium text-white"
                        title={peer.name || undefined}
                      >
                        {peer.name || (
                          <span className="font-mono text-slate-500">
                            {peer.public_key
                              ? `${peer.public_key.substring(0, 12)}...`
                              : "Unknown"}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[220px] font-mono text-xs text-slate-400">
                      <span
                        className="block truncate"
                        title={peer.endpoint ?? undefined}
                      >
                        {peer.endpoint ?? "—"}
                      </span>
                    </TableCell>

                    {vpnType === "wireguard" && (
                      <TableCell className="max-w-[260px] font-mono text-xs text-slate-400">
                        <span
                          className="block truncate"
                          title={
                            peer.allowed_ips.join(", ") || undefined
                          }
                        >
                          {peer.allowed_ips.length > 0
                            ? peer.allowed_ips.join(", ")
                            : "—"}
                        </span>
                      </TableCell>
                    )}

                    <TableCell className="text-slate-400">
                      {vpnType === "wireguard"
                        ? timeAgo(peer.last_handshake)
                        : peer.connectivity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-400">
                      {formatBytes(peer.rx_bytes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-400">
                      {formatBytes(peer.tx_bytes)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function OvpnClientRow({ client }: { client: OvpnClientStatus }) {
  return (
    <TableRow className="border-slate-800/70 hover:bg-slate-800/35">
      <TableCell>
        <div className="flex items-center gap-2">
          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          <Badge
            variant="outline"
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[11px] uppercase text-emerald-300"
          >
            online
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-medium text-white">{client.name}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-400">
        {client.address ?? "—"}
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-400">
        {client.caller_id ?? "—"}
      </TableCell>
      <TableCell className="text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-500" />
          {client.uptime ?? "—"}
        </div>
      </TableCell>
      <TableCell className="text-xs text-slate-400">
        {client.encoding ?? "—"}
      </TableCell>
    </TableRow>
  );
}
