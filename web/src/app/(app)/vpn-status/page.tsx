"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Search,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { fetchSettings, fetchVpnStatus } from "@/lib/api";
import type { VpnStatusResponse, VpnInterfaceStatus } from "@/lib/types";

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
  const [legacyRoutersEnabled, setLegacyRoutersEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const vyosVisible = legacyRoutersEnabled && !!data?.vyos_available;
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
    // Auto-refresh every 30 seconds
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    fetchSettings()
      .then((settings) => setLegacyRoutersEnabled(settings.show_legacy_routers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!vyosVisible && activeTab === "vyos") {
      setActiveTab("overview");
    }
  }, [activeTab, vyosVisible]);

  // Default to MikroTik tab when available (once, on first data load)
  useEffect(() => {
    if (!data || defaultTabSet.current) return;
    defaultTabSet.current = true;
    if (data.mikrotik_available) {
      setActiveTab("mikrotik");
    } else if (data.vyos_available) {
      setActiveTab("vyos");
    }
  }, [data]);

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

  // Group interfaces by source
  const vyosInterfaces = useMemo(
    () => filteredInterfaces?.filter((i) => i.source === "vyos") ?? [],
    [filteredInterfaces],
  );
  const mikrotikInterfaces = useMemo(
    () => filteredInterfaces?.filter((i) => i.source === "mikrotik") ?? [],
    [filteredInterfaces],
  );
  const overviewInterfaces = useMemo(() => {
    if (!data) return [];
    return vyosVisible
      ? data.interfaces
      : data.interfaces.filter((i) => i.source !== "vyos");
  }, [data, vyosVisible]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-semibold text-white">VPN Status</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <SummaryCard
            title="Interfaces"
            value={data ? overviewInterfaces.length : null}
            loading={loading && !data}
            icon={<Shield className="h-4 w-4 text-blue-400" />}
          />
          <SummaryCard
            title="Peers Online"
            value={data?.online_peers ?? null}
            loading={loading && !data}
            icon={<Wifi className="h-4 w-4 text-emerald-400" />}
            subtitle={
              data
                ? `of ${data.total_peers} total`
                : undefined
            }
          />
          <SummaryCard
            title="Total RX"
            value={data ? formatBytes(data.total_rx_bytes) : null}
            loading={loading && !data}
            icon={<ArrowDownToLine className="h-4 w-4 text-cyan-400" />}
            isText
          />
          <SummaryCard
            title="Total TX"
            value={data ? formatBytes(data.total_tx_bytes) : null}
            loading={loading && !data}
            icon={<ArrowUpFromLine className="h-4 w-4 text-amber-400" />}
            isText
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>

            {data?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                MikroTik
              </TabsTrigger>
            )}
            {vyosVisible && (
              <TabsTrigger
                value="vyos"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                VyOS
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-white">
                  VPN Tunnel Overview
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Real-time WireGuard peer status across all configured routers.
                  Peers are considered online if their last handshake was within
                  3 minutes. Data refreshes automatically every 30 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-slate-400">
                  {vyosVisible && (
                    <p>
                      VyOS:{" "}
                      <span className="font-medium text-white">
                        {vyosInterfaces.length}
                      </span>{" "}
                      {vyosInterfaces.length === 1
                        ? "interface"
                        : "interfaces"}
                      {" with "}
                      <span className="font-medium text-white">
                        {vyosInterfaces.reduce(
                          (sum, i) => sum + i.peers_total,
                          0,
                        )}
                      </span>{" "}
                      peers (
                      <span className="text-emerald-400">
                        {vyosInterfaces.reduce(
                          (sum, i) => sum + i.peers_online,
                          0,
                        )}{" "}
                        online
                      </span>
                      )
                    </p>
                  )}
                  {data?.mikrotik_available && (
                    <p>
                      MikroTik:{" "}
                      <span className="font-medium text-white">
                        {mikrotikInterfaces.length}
                      </span>{" "}
                      {mikrotikInterfaces.length === 1
                        ? "interface"
                        : "interfaces"}
                      {" with "}
                      <span className="font-medium text-white">
                        {mikrotikInterfaces.reduce(
                          (sum, i) => sum + i.peers_total,
                          0,
                        )}
                      </span>{" "}
                      peers (
                      <span className="text-emerald-400">
                        {mikrotikInterfaces.reduce(
                          (sum, i) => sum + i.peers_online,
                          0,
                        )}{" "}
                        online
                      </span>
                      )
                    </p>
                  )}
                  {!vyosVisible && !data?.mikrotik_available && !loading && (
                    <p>
                      No router is configured. Go to{" "}
                      <span className="font-medium text-white">Settings</span>{" "}
                      to configure a router.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* All interfaces overview */}
            {overviewInterfaces.length > 0 && (
              <div className="space-y-4">
                {overviewInterfaces.map((iface) => (
                  <InterfaceCard key={`${iface.source}-${iface.name}`} iface={iface} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* VyOS Tab */}
          <TabsContent value="vyos" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Filter peers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
              />
            </div>
            {vyosInterfaces.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center text-slate-500">
                  {search
                    ? "No interfaces or peers match your filter."
                    : "No VyOS WireGuard interfaces found."}
                </CardContent>
              </Card>
            ) : (
              vyosInterfaces.map((iface) => (
                <InterfaceCard key={iface.name} iface={iface} />
              ))
            )}
          </TabsContent>

          {/* MikroTik Tab */}
          <TabsContent value="mikrotik" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Filter peers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
              />
            </div>
            {mikrotikInterfaces.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-12 text-center text-slate-500">
                  {search
                    ? "No interfaces or peers match your filter."
                    : "No MikroTik WireGuard interfaces found."}
                </CardContent>
              </Card>
            ) : (
              mikrotikInterfaces.map((iface) => (
                <InterfaceCard key={iface.name} iface={iface} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}

// ─── Summary Card ──────────────────────────────────────────

function SummaryCard({
  title,
  value,
  loading,
  icon,
  subtitle,
  isText,
}: {
  title: string;
  value: number | string | null;
  loading: boolean;
  icon: React.ReactNode;
  subtitle?: string;
  isText?: boolean;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12 bg-slate-800" />
          ) : isText ? (
            <p className="text-lg font-bold text-white">{value ?? "—"}</p>
          ) : (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Interface Card with Peer Table ─────────────────────────

function InterfaceCard({ iface }: { iface: VpnInterfaceStatus }) {
  const isUp = iface.status === "up" || iface.status === "u/u";

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-medium text-white">
              {iface.name}
            </CardTitle>
            <Badge
              variant="outline"
              className={
                isUp
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-rose-500/30 text-rose-400"
              }
            >
              {isUp ? "up" : "down"}
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-700 text-slate-400"
            >
              {iface.source}
            </Badge>
          </div>
          <div className="text-xs text-slate-500">
            {iface.peers_online}/{iface.peers_total} peers online
          </div>
        </div>
        <CardDescription className="text-xs text-slate-500">
          {[
            iface.address && `Address: ${iface.address}`,
            iface.port && `Port: ${iface.port}`,
            iface.public_key &&
              `Key: ${iface.public_key.substring(0, 12)}...`,
          ]
            .filter(Boolean)
            .join(" | ")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-400">Status</TableHead>
              <TableHead className="text-slate-400">Peer</TableHead>
              <TableHead className="text-slate-400">Endpoint</TableHead>
              <TableHead className="text-slate-400">Allowed IPs</TableHead>
              <TableHead className="text-slate-400">Last Handshake</TableHead>
              <TableHead className="text-right text-slate-400">RX</TableHead>
              <TableHead className="text-right text-slate-400">TX</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {iface.peers.length === 0 ? (
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-slate-500"
                >
                  No peers configured.
                </TableCell>
              </TableRow>
            ) : (
              iface.peers.map((peer, idx) => (
                <TableRow
                  key={peer.public_key ?? idx}
                  className="border-slate-800 hover:bg-slate-800/30"
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
                        className={
                          peer.connectivity === "online"
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-slate-700 text-slate-500"
                        }
                      >
                        {peer.connectivity}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-white">
                    {peer.name || (
                      <span className="text-slate-500">
                        {peer.public_key
                          ? `${peer.public_key.substring(0, 8)}...`
                          : "Unknown"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">
                    {peer.endpoint ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">
                    {peer.allowed_ips.length > 0
                      ? peer.allowed_ips.join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {timeAgo(peer.last_handshake)}
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
      </CardContent>
    </Card>
  );
}
