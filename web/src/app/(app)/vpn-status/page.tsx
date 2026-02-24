"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  RefreshCw,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { fetchVpnStatus } from "@/lib/api";
import type { VpnStatusResponse, VpnInterfaceStatus, VpnPeerStatus } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";

const REFRESH_INTERVAL_MS = 30_000;

function handshakeAgo(ts: number | null): string {
  if (ts === null) return "Never";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PeerStatusDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        isOnline
          ? "bg-emerald-400 ring-2 ring-emerald-400/30"
          : "bg-slate-600 ring-2 ring-slate-600/30"
      }`}
    />
  );
}

function InterfaceStatusBadge({ status }: { status: string | null }) {
  if (status === "up") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15">
        Up
      </Badge>
    );
  }
  if (status === "down") {
    return (
      <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/15">
        Down
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/15">
      Unknown
    </Badge>
  );
}

function PeerTable({ peers }: { peers: VpnPeerStatus[] }) {
  if (peers.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-slate-500">
        No peers configured
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-800 hover:bg-transparent">
          <TableHead className="text-slate-400 w-10">Status</TableHead>
          <TableHead className="text-slate-400">Peer</TableHead>
          <TableHead className="text-slate-400">Endpoint</TableHead>
          <TableHead className="text-slate-400">Allowed IPs</TableHead>
          <TableHead className="text-slate-400">Last Handshake</TableHead>
          <TableHead className="text-slate-400 text-right">RX</TableHead>
          <TableHead className="text-slate-400 text-right">TX</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {peers.map((peer, i) => (
          <TableRow key={peer.public_key || i} className="border-slate-800">
            <TableCell>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger>
                    <PeerStatusDot isOnline={peer.is_online} />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border-slate-800 bg-slate-900"
                  >
                    <p>{peer.is_online ? "Online" : "Offline"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                {peer.name && (
                  <span className="font-medium text-slate-200">
                    {peer.name}
                  </span>
                )}
                {peer.public_key && (
                  <span className="font-mono text-xs text-slate-500 truncate max-w-[200px]">
                    {peer.public_key.slice(0, 12)}...
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-slate-300 font-mono text-sm">
              {peer.endpoint || "—"}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                {peer.allowed_ips.length > 0
                  ? peer.allowed_ips.map((ip) => (
                      <span
                        key={ip}
                        className="font-mono text-xs text-slate-400"
                      >
                        {ip}
                      </span>
                    ))
                  : <span className="text-slate-500">—</span>}
              </div>
            </TableCell>
            <TableCell className="text-slate-300">
              {handshakeAgo(peer.last_handshake)}
            </TableCell>
            <TableCell className="text-right text-slate-300 tabular-nums">
              {peer.rx_bytes != null ? formatBytes(peer.rx_bytes) : "—"}
            </TableCell>
            <TableCell className="text-right text-slate-300 tabular-nums">
              {peer.tx_bytes != null ? formatBytes(peer.tx_bytes) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InterfaceCard({ iface }: { iface: VpnInterfaceStatus }) {
  const onlinePeers = iface.peers.filter((p) => p.is_online).length;
  const totalPeers = iface.peers.length;

  return (
    <Card className="border-slate-800 bg-slate-950">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">
                {iface.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <InterfaceStatusBadge status={iface.status} />
                {iface.listen_port && (
                  <span className="text-xs text-slate-500">
                    Port {iface.listen_port}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Wifi className="h-4 w-4 text-slate-500" />
            <span className="text-slate-400">
              <span className="text-emerald-400 font-medium">{onlinePeers}</span>
              <span className="text-slate-600"> / </span>
              <span>{totalPeers}</span>
              <span className="text-slate-500 ml-1">peers</span>
            </span>
          </div>
        </div>
        {iface.public_key && (
          <p className="mt-2 font-mono text-xs text-slate-600 truncate">
            Public key: {iface.public_key}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <PeerTable peers={iface.peers} />
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((i) => (
        <Card key={i} className="border-slate-800 bg-slate-950">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function VpnStatusPage() {
  const [data, setData] = useState<VpnStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await fetchVpnStatus();
      setData(result);
    } catch {
      if (!silent) toast.error("Failed to load VPN status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  const totalPeers = data?.interfaces.reduce((sum, i) => sum + i.peers.length, 0) ?? 0;
  const onlinePeers = data?.interfaces.reduce(
    (sum, i) => sum + i.peers.filter((p) => p.is_online).length,
    0
  ) ?? 0;
  const totalInterfaces = data?.interfaces.length ?? 0;
  const upInterfaces = data?.interfaces.filter((i) => i.status === "up").length ?? 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">VPN Status</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              WireGuard tunnel health and connected peers
              {data?.router_type && data.router_type !== "none" && (
                <> &middot; {data.router_type === "vyos" ? "VyOS" : "MikroTik"}</>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        {!loading && data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-slate-800 bg-slate-950">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {upInterfaces}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}/ {totalInterfaces}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">Tunnels Up</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Wifi className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {onlinePeers}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}/ {totalPeers}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">Peers Online</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950">
              <CardContent className="flex items-center gap-3 pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <ArrowDownUp className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {formatBytes(
                      data.interfaces.reduce(
                        (sum, i) =>
                          sum +
                          i.peers.reduce(
                            (ps, p) => ps + (p.rx_bytes ?? 0) + (p.tx_bytes ?? 0),
                            0
                          ),
                        0
                      )
                    )}
                  </p>
                  <p className="text-xs text-slate-500">Total Transfer</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Interfaces */}
        {loading ? (
          <LoadingSkeleton />
        ) : data?.router_type === "none" ? (
          <Card className="border-slate-800 bg-slate-950">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <WifiOff className="h-12 w-12 text-slate-600 mb-4" />
              <h2 className="text-lg font-semibold text-slate-300">
                No Router Configured
              </h2>
              <p className="mt-1 text-sm text-slate-500 max-w-md text-center">
                Configure a VyOS or MikroTik router in Settings to see WireGuard
                VPN status here.
              </p>
            </CardContent>
          </Card>
        ) : data?.interfaces.length === 0 ? (
          <Card className="border-slate-800 bg-slate-950">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Shield className="h-12 w-12 text-slate-600 mb-4" />
              <h2 className="text-lg font-semibold text-slate-300">
                No WireGuard Interfaces
              </h2>
              <p className="mt-1 text-sm text-slate-500 max-w-md text-center">
                No WireGuard interfaces are configured on your router. Create one
                from the Router page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {data?.interfaces.map((iface) => (
              <InterfaceCard key={iface.name} iface={iface} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
