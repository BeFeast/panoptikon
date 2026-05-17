"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { VpnInterfaceStatus, VpnStatusResponse } from "@/lib/types";

// ─── Mesh design tokens ───────────────────────────────────

const meshSurface =
  "border-mesh-border bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]";
const meshSurfaceQuiet = "border-mesh-border bg-mesh-surface-1/62";
const meshSectionTitle =
  "text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute";

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

  // Default to MikroTik tab when available (once, on first data load).
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
    () =>
      filteredInterfaces?.filter(
        (i) => i.source === "mikrotik" && i.vpn_type !== "openvpn",
      ) ?? [],
    [filteredInterfaces],
  );

  const openvpnInterfaces = useMemo(
    () =>
      filteredInterfaces?.filter(
        (i) => i.vpn_type === "openvpn" || i.source === "mikrotik-openvpn",
      ) ?? [],
    [filteredInterfaces],
  );

  const overviewInterfaces = useMemo(() => {
    if (!data) return [];
    return data.interfaces;
  }, [data]);

  const initialLoading = loading && !data;

  // Header subtitle reflects current mesh context when data is available.
  const subtitle = data
    ? `${overviewInterfaces.length} interface${overviewInterfaces.length === 1 ? "" : "s"} · ${data.online_peers}/${data.total_peers} peer${data.total_peers === 1 ? "" : "s"} online`
    : "Tunnels, peer connectivity, transfer telemetry.";

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* ─── Page header ─────────────────────────────── */}
        <section className="flex flex-col gap-4 border-b border-mesh-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-mesh-accent" />
            <div>
              <p className={meshSectionTitle}>Network · secure overlay</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-mesh-text">
                VPN status
              </h1>
              <p className="mt-1 font-mono text-xs text-mesh-text-mute">
                {subtitle}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-mesh-border bg-mesh-surface-1/70 text-mesh-text hover:border-mesh-accent/40 hover:bg-mesh-surface-2/60 hover:text-white"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-mesh-accent" />
            Refresh
          </Button>
        </section>

        {/* ─── KPI row ─────────────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Interfaces"
            value={data ? overviewInterfaces.length.toString() : null}
            loading={initialLoading}
            icon={<Cable className="h-4 w-4" />}
          />
          <SummaryCard
            label="Peers online"
            value={data?.online_peers != null ? data.online_peers.toString() : null}
            loading={initialLoading}
            icon={<Users className="h-4 w-4" />}
            subtitle={data ? `of ${data.total_peers} total` : undefined}
            accent="emerald"
          />
          <SummaryCard
            label="Total RX · 24h"
            value={data ? formatBytes(data.total_rx_bytes) : null}
            loading={initialLoading}
            icon={<ArrowDownToLine className="h-4 w-4" />}
          />
          <SummaryCard
            label="Total TX · 24h"
            value={data ? formatBytes(data.total_tx_bytes) : null}
            loading={initialLoading}
            icon={<ArrowUpFromLine className="h-4 w-4" />}
          />
        </section>

        {/* ─── Tabs ────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto rounded-md border border-mesh-border bg-mesh-surface-1/70 p-1">
            <TabsTrigger
              value="overview"
              className="rounded px-3.5 py-1.5 text-xs uppercase tracking-wider text-mesh-text-mute data-[state=active]:bg-mesh-surface-2 data-[state=active]:text-mesh-text"
            >
              Overview
            </TabsTrigger>
            {data?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="rounded px-3.5 py-1.5 text-xs uppercase tracking-wider text-mesh-text-mute data-[state=active]:bg-mesh-surface-2 data-[state=active]:text-mesh-text"
              >
                WireGuard
              </TabsTrigger>
            )}
            {data?.openvpn_available && (
              <TabsTrigger
                value="openvpn"
                className="rounded px-3.5 py-1.5 text-xs uppercase tracking-wider text-mesh-text-mute data-[state=active]:bg-mesh-surface-2 data-[state=active]:text-mesh-text"
              >
                OpenVPN
              </TabsTrigger>
            )}
          </TabsList>

          {/* ─── Overview tab ─────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 pt-4">
            <Card className={meshSurface}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-mesh-accent" />
                  <CardTitle className={meshSectionTitle}>
                    Tunnel overview
                  </CardTitle>
                </div>
                <p className="mt-2 text-sm text-mesh-text">
                  Peers are treated as online when the last handshake is within
                  3 minutes.{" "}
                  <span className="font-mono text-xs text-mesh-text-mute">
                    auto-refresh · 30s
                  </span>
                </p>
              </CardHeader>
              <CardContent>
                {initialLoading ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {data?.mikrotik_available ? (
                      <div
                        className={cn(
                          "rounded-md border p-3",
                          meshSurfaceQuiet,
                        )}
                      >
                        <p className={meshSectionTitle}>MikroTik coverage</p>
                        <p className="mt-2 text-sm text-mesh-text">
                          <span className="font-mono font-semibold tabular-nums text-white">
                            {mikrotikInterfaces.length}
                          </span>{" "}
                          interface
                          {mikrotikInterfaces.length === 1 ? "" : "s"}
                          <span className="px-2 text-mesh-text-mute">·</span>
                          <span className="font-mono font-semibold tabular-nums text-white">
                            {mikrotikInterfaces.reduce(
                              (sum, i) => sum + i.peers_total,
                              0,
                            )}
                          </span>{" "}
                          peer
                          {mikrotikInterfaces.reduce(
                            (sum, i) => sum + i.peers_total,
                            0,
                          ) === 1
                            ? ""
                            : "s"}
                          <span className="px-2 text-mesh-text-mute">·</span>
                          <span className="font-mono font-semibold tabular-nums text-[#4ade80]">
                            {mikrotikInterfaces.reduce(
                              (sum, i) => sum + i.peers_online,
                              0,
                            )}{" "}
                            online
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "rounded-md border p-3 text-sm text-mesh-text-dim",
                          meshSurfaceQuiet,
                        )}
                      >
                        <p className={meshSectionTitle}>MikroTik coverage</p>
                        <p className="mt-2">
                          No router is configured. Configure router credentials
                          in Settings.
                        </p>
                      </div>
                    )}
                    {data?.openvpn_available && (
                      <div
                        className={cn(
                          "rounded-md border p-3",
                          meshSurfaceQuiet,
                        )}
                      >
                        <p className={meshSectionTitle}>OpenVPN</p>
                        <p className="mt-2 text-sm text-mesh-text">
                          <span className="font-mono font-semibold tabular-nums text-white">
                            {openvpnInterfaces.reduce(
                              (sum, i) => sum + i.peers_total,
                              0,
                            )}
                          </span>{" "}
                          connected client
                          {openvpnInterfaces.reduce(
                            (sum, i) => sum + i.peers_total,
                            0,
                          ) === 1
                            ? ""
                            : "s"}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {initialLoading ? (
              <InterfaceSkeleton />
            ) : overviewInterfaces.length === 0 ? (
              <EmptyState
                icon={ShieldOff}
                title="No VPN interfaces"
                message="No tunnels are currently configured on this Panoptikon instance."
                hint="Configure WireGuard or OpenVPN on the router to populate this surface."
              />
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

          {/* ─── MikroTik / WireGuard tab ─────────────── */}
          <TabsContent value="mikrotik" className="space-y-4 pt-4">
            <FilterInput
              value={search}
              onChange={setSearch}
              placeholder="Filter peers, endpoints, or allowed IPs..."
            />

            {initialLoading ? (
              <InterfaceSkeleton />
            ) : mikrotikInterfaces.length === 0 ? (
              <EmptyState
                icon={ShieldOff}
                title={search ? "No matches" : "No WireGuard interfaces"}
                message={
                  search
                    ? "No interfaces or peers match your filter."
                    : "No MikroTik WireGuard interfaces are exported."
                }
                hint={
                  search
                    ? "Try a different search term or clear the filter."
                    : "Provision a WireGuard interface on the router to populate this list."
                }
              />
            ) : (
              mikrotikInterfaces.map((iface) => (
                <InterfaceCard
                  key={`${iface.source}-${iface.name}`}
                  iface={iface}
                />
              ))
            )}
          </TabsContent>

          {/* ─── OpenVPN tab ──────────────────────────── */}
          <TabsContent value="openvpn" className="space-y-4 pt-4">
            <FilterInput
              value={search}
              onChange={setSearch}
              placeholder="Filter clients..."
            />

            {initialLoading ? (
              <InterfaceSkeleton />
            ) : openvpnInterfaces.length === 0 ? (
              <EmptyState
                icon={ShieldOff}
                title={search ? "No matches" : "No OpenVPN clients"}
                message={
                  search
                    ? "No clients match your filter."
                    : "No OpenVPN server configured or no connected clients."
                }
                hint={
                  search
                    ? "Try a different search term or clear the filter."
                    : "Enable OpenVPN on the router and connect a client to populate this list."
                }
              />
            ) : (
              openvpnInterfaces.map((iface) => (
                <InterfaceCard
                  key={`${iface.source}-${iface.name}`}
                  iface={iface}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}

// ─── KPI summary card ─────────────────────────────────────

function SummaryCard({
  label,
  value,
  loading,
  icon,
  subtitle,
  accent = "default",
}: {
  label: string;
  value: string | null;
  loading: boolean;
  icon: React.ReactNode;
  subtitle?: string;
  accent?: "default" | "emerald";
}) {
  const valueClass =
    accent === "emerald" ? "text-[#4ade80]" : "text-white";

  return (
    <Card className={cn("h-full min-h-[8.25rem]", meshSurface)}>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <CardTitle className={meshSectionTitle}>{label}</CardTitle>
        <span className="text-mesh-accent">{icon}</span>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p
            className={cn(
              "truncate text-[1.65rem] font-semibold leading-none tabular-nums",
              valueClass,
            )}
          >
            {value ?? "—"}
          </p>
        )}
        {subtitle && (
          <p className="truncate font-mono text-[11px] text-mesh-text-mute">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Filter input ─────────────────────────────────────────

function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-accent/70" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-mesh-border bg-mesh-surface-1/70 pl-10 text-mesh-text placeholder:text-mesh-text-mute focus-visible:border-mesh-accent/45 focus-visible:ring-mesh-accent/30"
      />
    </div>
  );
}

// ─── Empty state (matches /audit-log style) ───────────────

function EmptyState({
  icon: Icon,
  title,
  message,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  hint?: string;
}) {
  return (
    <Card className={meshSurface}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Icon className="h-10 w-10 text-mesh-text-faint/80" />
        <p className="text-sm text-mesh-text">{title}</p>
        <p className="max-w-md text-sm text-mesh-text-dim">{message}</p>
        {hint && (
          <p className="font-mono text-xs text-mesh-text-mute">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton for an interface card ───────────────

function InterfaceSkeleton() {
  return (
    <Card className={meshSurface}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t border-mesh-border">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-7 gap-3 border-b border-mesh-border-strong/25 px-4 py-3"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                <Skeleton key={c} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status pill ──────────────────────────────────────────

function StatusPill({
  tone,
  label,
}: {
  tone: "online" | "offline" | "neutral";
  label: string;
}) {
  const toneClass =
    tone === "online"
      ? "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
      : tone === "offline"
        ? "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]"
        : "border-mesh-border bg-mesh-surface-1/70 text-mesh-text-dim";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

// ─── Interface card (per tunnel) ──────────────────────────

function InterfaceCard({ iface }: { iface: VpnInterfaceStatus }) {
  const isUp = iface.status === "up" || iface.status === "u/u";
  const isOpenvpn =
    iface.vpn_type === "openvpn" || iface.source === "mikrotik-openvpn";

  return (
    <Card className={meshSurface}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Cable className="h-4 w-4 text-mesh-accent" />
            <CardTitle className="font-mono text-sm font-semibold text-white">
              {iface.name}
            </CardTitle>
            <StatusPill
              tone={isUp ? "online" : "offline"}
              label={isUp ? "up" : "down"}
            />
            <StatusPill tone="neutral" label={iface.source} />
            {iface.vpn_type && (
              <StatusPill tone="neutral" label={iface.vpn_type} />
            )}
          </div>

          <div
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs",
              meshSurfaceQuiet,
            )}
          >
            <span className="font-semibold tabular-nums text-[#4ade80]">
              {iface.peers_online}
            </span>
            <span className="mx-1 text-mesh-text-mute">/</span>
            <span className="tabular-nums text-mesh-text">
              {iface.peers_total}
            </span>
            <span className="ml-1.5 uppercase tracking-wider text-mesh-text-mute">
              online
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {iface.address && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-mesh-text",
                meshSurfaceQuiet,
              )}
            >
              <span className="text-mesh-text-mute">addr</span>
              <span className="tabular-nums">{iface.address}</span>
            </span>
          )}
          {iface.port && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-mesh-text",
                meshSurfaceQuiet,
              )}
            >
              <span className="text-mesh-text-mute">port</span>
              <span className="tabular-nums">{iface.port}</span>
            </span>
          )}
          {iface.public_key && (
            <span
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 truncate rounded border px-2 py-1 font-mono text-mesh-text",
                meshSurfaceQuiet,
              )}
            >
              <KeyRound className="h-3 w-3 text-mesh-accent" />
              <span className="truncate">
                {iface.public_key.substring(0, 16)}…
              </span>
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto border-t border-mesh-border">
          <Table>
            <TableHeader>
              <TableRow className="border-mesh-border hover:bg-transparent">
                <TableHead className={meshSectionTitle}>Status</TableHead>
                <TableHead className={meshSectionTitle}>
                  {isOpenvpn ? "Client" : "Peer"}
                </TableHead>
                <TableHead className={meshSectionTitle}>Endpoint</TableHead>
                <TableHead className={meshSectionTitle}>
                  {isOpenvpn ? "VPN address" : "Allowed IPs"}
                </TableHead>
                <TableHead className={meshSectionTitle}>
                  {isOpenvpn ? "Uptime" : "Last handshake"}
                </TableHead>
                <TableHead
                  className={cn("text-right", meshSectionTitle)}
                >
                  RX
                </TableHead>
                <TableHead
                  className={cn("text-right", meshSectionTitle)}
                >
                  TX
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {iface.peers.length === 0 ? (
                <TableRow className="border-mesh-border hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <WifiOff className="h-7 w-7 text-mesh-text-faint/80" />
                      <p className="text-sm text-mesh-text-dim">
                        {isOpenvpn
                          ? "No clients connected."
                          : "No peers configured."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                iface.peers.map((peer, idx) => (
                  <TableRow
                    key={peer.public_key ?? `${iface.name}-${idx}`}
                    className="border-mesh-border/30 hover:bg-mesh-surface-2/40"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {peer.connectivity === "online" ? (
                          <Wifi className="h-3.5 w-3.5 text-[#4ade80]" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5 text-mesh-text-mute" />
                        )}
                        <StatusPill
                          tone={
                            peer.connectivity === "online"
                              ? "online"
                              : "neutral"
                          }
                          label={peer.connectivity}
                        />
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[220px]">
                      <div
                        className="truncate text-sm font-medium text-white"
                        title={peer.name || undefined}
                      >
                        {peer.name || (
                          <span className="font-mono text-mesh-text-mute">
                            {peer.public_key
                              ? `${peer.public_key.substring(0, 12)}…`
                              : "Unknown"}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[220px] font-mono text-xs tabular-nums text-mesh-text-dim">
                      <span
                        className="block truncate"
                        title={peer.endpoint ?? undefined}
                      >
                        {peer.endpoint ?? "—"}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-[260px] font-mono text-xs tabular-nums text-mesh-text-dim">
                      <span
                        className="block truncate"
                        title={peer.allowed_ips.join(", ") || undefined}
                      >
                        {peer.allowed_ips.length > 0
                          ? peer.allowed_ips.join(", ")
                          : "—"}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono text-xs tabular-nums text-mesh-text-dim">
                      {isOpenvpn
                        ? (peer.uptime ?? "—")
                        : timeAgo(peer.last_handshake)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-mesh-text">
                      {formatBytes(peer.rx_bytes)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-[#67e8f9]">
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
