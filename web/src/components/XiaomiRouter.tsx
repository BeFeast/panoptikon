"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Cpu,
  Clock,
  MemoryStick,
  Thermometer,
  Globe,
  Wifi,
  Users,
  HardDrive,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  fetchXiaomiStatus,
  fetchXiaomiWanInfo,
  fetchXiaomiFirmware,
  fetchXiaomiWifi,
} from "@/lib/api";
import type {
  XiaomiStatus,
  XiaomiWanInfo,
  XiaomiFirmware,
  XiaomiWifi,
} from "@/lib/types";

// ── Helpers ─────────────────────────────────────────────

function formatUptime(seconds: string | null): string {
  if (!seconds) return "\u2014";
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatSpeed(bytesPerSec: string | null): string {
  if (!bytesPerSec) return "\u2014";
  const n = parseInt(bytesPerSec, 10);
  if (isNaN(n)) return bytesPerSec;
  if (n < 1024) return `${n} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB/s`;
  return `${(n / 1024 / 1024).toFixed(1)} MB/s`;
}

/** Returns a Tailwind color class based on percentage thresholds. */
function gaugeColor(pct: number): string {
  if (pct >= 90) return "bg-rose-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function gaugeTextColor(pct: number): string {
  if (pct >= 90) return "text-rose-400";
  if (pct >= 70) return "text-amber-400";
  return "text-emerald-400";
}

// ── Generic data loader hook ────────────────────────────

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

// ── Status Header ───────────────────────────────────────

function StatusHeader({
  firmware,
  status,
}: {
  firmware: XiaomiFirmware | null;
  status: XiaomiStatus | null;
}) {
  const reachable = status?.reachable || firmware?.reachable;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
          <Router className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {firmware?.router_name ?? "Xiaomi Router"}
          </h1>
          <p className="text-xs text-slate-500">
            {firmware?.hardware ?? "MiWiFi"}{" "}
            {firmware?.rom_version && (
              <span className="text-slate-600">
                &middot; v{firmware.rom_version}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {reachable ? (
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
        {status?.uptime && (
          <Badge
            variant="outline"
            className="border-slate-800 text-slate-400"
          >
            Uptime: {formatUptime(status.uptime)}
          </Badge>
        )}
        {firmware?.update_available && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-400"
          >
            Update available
            {firmware.latest_version && `: ${firmware.latest_version}`}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── System Stats Section ────────────────────────────────

function SystemStatsSection({ status }: { status: XiaomiStatus }) {
  const cpuPct = status.cpu_load ?? 0;
  const memPct = (status.mem_usage ?? 0) * 100;

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-white">System Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat cards row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* CPU */}
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                <Cpu className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">CPU</p>
                <p className={`text-sm font-medium ${gaugeTextColor(cpuPct)}`}>
                  {cpuPct.toFixed(0)}%
                </p>
              </div>
            </div>
            <Progress
              value={cpuPct}
              className={`h-1.5 [&>div]:${gaugeColor(cpuPct)}`}
            />
            <p className="text-[10px] text-slate-600">
              {status.cpu_cores ?? "—"} cores @ {status.cpu_freq ?? "—"}
            </p>
          </div>

          {/* Memory */}
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-500/10">
                <MemoryStick className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">RAM</p>
                <p
                  className={`text-sm font-medium ${gaugeTextColor(memPct)}`}
                >
                  {memPct.toFixed(0)}%
                </p>
              </div>
            </div>
            <Progress
              value={memPct}
              className={`h-1.5 [&>div]:${gaugeColor(memPct)}`}
            />
            <p className="text-[10px] text-slate-600">
              {status.mem_total ?? "—"} {status.mem_type ?? ""}{" "}
              {status.mem_hz ? `@ ${status.mem_hz}` : ""}
            </p>
          </div>

          {/* Temperature */}
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-500/10">
                <Thermometer className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Temperature</p>
                <p className="text-sm font-medium text-white">
                  {status.temperature != null
                    ? `${status.temperature.toFixed(1)}\u00b0C`
                    : "\u2014"}
                </p>
              </div>
            </div>
          </div>

          {/* Devices */}
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                <Users className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Devices</p>
                <p className="text-sm font-medium text-white">
                  {status.devices_online ?? 0} online
                  <span className="text-slate-500">
                    {" "}
                    / {status.devices_total ?? 0} total
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* WAN throughput */}
        {(status.wan_download || status.wan_upload) && (
          <div className="flex gap-6 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2">
            <div className="flex items-center gap-2">
              <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs text-slate-400">Download:</span>
              <span className="text-xs font-medium text-white">
                {formatSpeed(status.wan_download)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUp className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs text-slate-400">Upload:</span>
              <span className="text-xs font-medium text-white">
                {formatSpeed(status.wan_upload)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── WAN Info Section ────────────────────────────────────

function WanInfoSection({ wan }: { wan: XiaomiWanInfo }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Globe className="h-4 w-4 text-blue-400" />
          WAN Info
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* IPv4 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-slate-400">IPv4</h3>
            <dl className="space-y-1">
              <Row label="WAN IP" value={wan.wan_ip} />
              <Row label="Gateway" value={wan.gateway} />
              <Row label="Subnet Mask" value={wan.subnet_mask} />
              <Row label="DNS 1" value={wan.dns1} />
              <Row label="DNS 2" value={wan.dns2} />
              <Row
                label="WAN Type"
                value={wan.wan_type?.toUpperCase()}
              />
            </dl>
          </div>

          {/* IPv6 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-slate-400">IPv6</h3>
            {wan.ipv6_ip ? (
              <dl className="space-y-1">
                <Row label="Address" value={wan.ipv6_ip} />
                <Row label="Gateway" value={wan.ipv6_gateway} />
                <Row label="Prefix" value={wan.ipv6_prefix} />
                <Row label="DNS 1" value={wan.ipv6_dns1} />
                <Row label="DNS 2" value={wan.ipv6_dns2} />
              </dl>
            ) : (
              <p className="text-xs text-slate-600">Not configured</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-xs text-white">{value ?? "\u2014"}</dd>
    </div>
  );
}

// ── WiFi Section ────────────────────────────────────────

function WifiSection({ wifi }: { wifi: XiaomiWifi }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Wifi className="h-4 w-4 text-cyan-400" />
          WiFi Bands
        </CardTitle>
      </CardHeader>
      <CardContent>
        {wifi.bands.length === 0 ? (
          <p className="text-xs text-slate-500">No WiFi bands detected</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {wifi.bands.map((band, i) => (
              <div
                key={band.ifname ?? i}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    {band.ssid ?? "Hidden Network"}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-slate-700 text-slate-400 text-[10px]"
                  >
                    {band.ifname ?? `Band ${i + 1}`}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {band.channel && (
                    <span className="text-slate-400">
                      Ch {band.channel}
                    </span>
                  )}
                  {band.bandwidth && (
                    <span className="text-slate-400">
                      {band.bandwidth}
                    </span>
                  )}
                  <span className="text-slate-400">
                    <Users className="mr-0.5 inline h-3 w-3" />
                    {band.clients ?? 0} clients
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Firmware Section ────────────────────────────────────

function FirmwareSection({ firmware }: { firmware: XiaomiFirmware }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <HardDrive className="h-4 w-4 text-slate-400" />
          Firmware &amp; Hardware
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Firmware" value={firmware.rom_version} />
          <StatCard label="Hardware" value={firmware.hardware} />
          <StatCard label="Router Name" value={firmware.router_name} />
          <StatCard label="Locale" value={firmware.locale} />
        </div>
        {firmware.update_available && firmware.latest_version && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <p className="text-xs text-amber-400">
              A firmware update is available: <strong>{firmware.latest_version}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="truncate text-sm font-medium text-white">
        {value ?? "\u2014"}
      </p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

export default function XiaomiRouter() {
  const {
    data: status,
    loading: statusLoading,
    reload: reloadStatus,
  } = useData(fetchXiaomiStatus);
  const { data: wan, loading: wanLoading, reload: reloadWan } =
    useData(fetchXiaomiWanInfo);
  const {
    data: firmware,
    loading: firmwareLoading,
    reload: reloadFirmware,
  } = useData(fetchXiaomiFirmware);
  const { data: wifi, loading: wifiLoading, reload: reloadWifi } =
    useData(fetchXiaomiWifi);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      reloadStatus(),
      reloadWan(),
      reloadFirmware(),
      reloadWifi(),
    ]);
    setRefreshing(false);
  };

  const loading = statusLoading || wanLoading || firmwareLoading || wifiLoading;

  if (loading && !status && !wan && !firmware && !wifi) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <StatusHeader firmware={firmware} status={status} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* System Stats */}
      {status?.reachable && <SystemStatsSection status={status} />}

      {/* WAN Info */}
      {wan?.reachable && <WanInfoSection wan={wan} />}

      {/* WiFi Bands */}
      {wifi?.reachable && <WifiSection wifi={wifi} />}

      {/* Firmware & Hardware */}
      {firmware?.reachable && <FirmwareSection firmware={firmware} />}

      {/* Unreachable state */}
      {status && !status.reachable && status.configured && (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10">
              <Router className="h-6 w-6 text-rose-400" />
            </div>
            <p className="text-sm text-slate-400">
              Cannot reach the Xiaomi router. Check the IP and password in
              Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
