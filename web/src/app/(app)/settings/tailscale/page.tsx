"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe,
  MonitorSmartphone,
  Network,
  RefreshCw,
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
import { PageTransition } from "@/components/PageTransition";
import { fetchTailscaleStatus } from "@/lib/api";
import type { TailscaleStatusResponse, TailscalePeer } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function TailscaleSettingsPage() {
  const [data, setData] = useState<TailscaleStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTailscaleStatus();
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

  const sortedPeers = useMemo(() => {
    if (!data) return [];
    return [...data.peers].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.hostname.localeCompare(b.hostname);
    });
  }, [data]);

  const isConnected = data?.connected ?? false;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-semibold tracking-tight text-white">Tailscale</h1>
            {data && (
              <Badge
                variant="outline"
                className={
                  isConnected
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-cyan-900/45 text-slate-500"
                }
              >
                {data.backend_state || "Unknown"}
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-5 sm:grid-cols-4">
          <SummaryCard
            title="Status"
            value={data?.backend_state ?? null}
            loading={loading && !data}
            icon={<Shield className="h-4 w-4 text-blue-400" />}
            isText
          />
          <SummaryCard
            title="Peers Online"
            value={data?.online_peers ?? null}
            loading={loading && !data}
            icon={<Wifi className="h-4 w-4 text-emerald-400" />}
            subtitle={data ? `of ${data.total_peers} total` : undefined}
          />
          <SummaryCard
            title="Tailscale IP"
            value={data?.tailscale_ips?.[0] ?? null}
            loading={loading && !data}
            icon={<Globe className="h-4 w-4 text-cyan-400" />}
            isText
          />
          <SummaryCard
            title="Subnet Routes"
            value={
              data
                ? data.subnet_routes.length > 0
                  ? data.subnet_routes.join(", ")
                  : "None"
                : null
            }
            loading={loading && !data}
            icon={<Network className="h-4 w-4 text-amber-400" />}
            isText
          />
        </div>

        {/* Node Info Card */}
        {data && isConnected && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardHeader>
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">This Node</CardTitle>
              <CardDescription className="text-slate-400">
                Local Tailscale node information for this Panoptikon instance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <InfoRow label="Hostname" value={data.hostname} />
                <InfoRow label="DNS Name" value={data.dns_name} />
                <InfoRow label="OS" value={data.os} />
                <InfoRow
                  label="Tailscale IPs"
                  value={data.tailscale_ips.join(", ") || "—"}
                />
                <InfoRow
                  label="Exit Node"
                  value={
                    data.exit_node
                      ? "Active"
                      : data.exit_node_option
                        ? "Available"
                        : "Disabled"
                  }
                />
                <InfoRow
                  label="Subnet Routes"
                  value={data.subnet_routes.join(", ") || "None"}
                />
                <InfoRow
                  label="MagicDNS Suffix"
                  value={data.magic_dns_suffix || "—"}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not Connected State */}
        {!loading && !isConnected && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="py-12 text-center">
              <WifiOff className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">
                Tailscale is not connected. Make sure the{" "}
                <code className="rounded bg-cyan-950/35 px-1.5 py-0.5 text-xs text-slate-300">
                  panoptikon-tailscale
                </code>{" "}
                container is running and{" "}
                <code className="rounded bg-cyan-950/35 px-1.5 py-0.5 text-xs text-slate-300">
                  TS_AUTHKEY
                </code>{" "}
                is set in your environment.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Peers Table */}
        {data && isConnected && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardHeader>
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Connected Peers</CardTitle>
              <CardDescription className="text-slate-400">
                Devices on your Tailscale network. Data refreshes every 30
                seconds.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-cyan-900/45 hover:bg-transparent">
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Hostname</TableHead>
                    <TableHead className="text-slate-400">OS</TableHead>
                    <TableHead className="text-slate-400">
                      Tailscale IP
                    </TableHead>
                    <TableHead className="text-slate-400">Exit Node</TableHead>
                    <TableHead className="text-right text-slate-400">
                      RX
                    </TableHead>
                    <TableHead className="text-right text-slate-400">
                      TX
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPeers.length === 0 ? (
                    <TableRow className="border-cyan-900/45 hover:bg-transparent">
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        No peers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedPeers.map((peer, idx) => (
                      <PeerRow key={peer.dns_name || idx} peer={peer} />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-4 w-3/4 bg-cyan-950/35" />
              <Skeleton className="h-4 w-1/2 bg-cyan-950/35" />
              <Skeleton className="h-4 w-2/3 bg-cyan-950/35" />
            </CardContent>
          </Card>
        )}
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
    <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
      <CardContent className="flex items-center gap-5 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-950/35">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-16 bg-cyan-950/35" />
          ) : isText ? (
            <p className="truncate text-lg font-bold text-white">
              {value ?? "—"}
            </p>
          ) : (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          )}
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Info Row ──────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}:</span>{" "}
      <span className="font-medium text-white">{value || "—"}</span>
    </div>
  );
}

// ─── Peer Table Row ────────────────────────────────────────

function PeerRow({ peer }: { peer: TailscalePeer }) {
  return (
    <TableRow className="border-cyan-900/45 hover:bg-cyan-950/35">
      <TableCell>
        <div className="flex items-center gap-2">
          {peer.online ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-slate-600" />
          )}
          <Badge
            variant="outline"
            className={
              peer.online
                ? "border-emerald-500/30 text-emerald-400"
                : "border-cyan-900/45 text-slate-500"
            }
          >
            {peer.online ? "online" : "offline"}
          </Badge>
        </div>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium text-white">{peer.hostname || "—"}</p>
          {peer.dns_name && (
            <p className="text-xs text-slate-500">{peer.dns_name}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <MonitorSmartphone className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm text-slate-400">{peer.os || "—"}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-400">
        {peer.tailscale_ips?.[0] ?? "—"}
      </TableCell>
      <TableCell>
        {peer.exit_node ? (
          <Badge
            variant="outline"
            className="border-blue-500/30 text-blue-400"
          >
            Active
          </Badge>
        ) : peer.exit_node_option ? (
          <span className="text-xs text-slate-500">Available</span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-slate-400">
        {formatBytes(peer.rx_bytes)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-slate-400">
        {formatBytes(peer.tx_bytes)}
      </TableCell>
    </TableRow>
  );
}
