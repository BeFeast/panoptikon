"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Globe,
  AlertCircle,
  Cpu,
  Clock,
  MemoryStick,
  Wifi,
  Thermometer,
  Download,
  Upload,
  Users,
  RefreshCw,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  fetchXiaomiStatus,
  fetchXiaomiWanInfo,
  fetchXiaomiWifi,
  fetchXiaomiFirmware,
} from "@/lib/api";
import type {
  XiaomiStatus,
  XiaomiWanInfo,
  XiaomiWifiInfo,
  XiaomiFirmware,
} from "@/lib/types";

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

// ── Helpers ─────────────────────────────────────────────

function formatUptime(seconds: string | null): string {
  if (!seconds) return "Unknown";
  const s = parseInt(seconds, 10);
  if (isNaN(s)) return seconds;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatSpeed(bytesPerSec: string | null | undefined): string {
  if (!bytesPerSec) return "0 B/s";
  const n = parseInt(bytesPerSec, 10);
  if (isNaN(n)) return bytesPerSec;
  if (n > 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB/s`;
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB/s`;
  if (n > 1_000) return `${(n / 1_000).toFixed(1)} KB/s`;
  return `${n} B/s`;
}

function cpuColor(load: number): string {
  if (load > 80) return "text-rose-400";
  if (load > 50) return "text-amber-400";
  return "text-emerald-400";
}

function memColor(usage: number): string {
  if (usage > 0.85) return "text-rose-400";
  if (usage > 0.6) return "text-amber-400";
  return "text-emerald-400";
}

function tempColor(temp: number): string {
  if (temp > 80) return "text-rose-400";
  if (temp > 60) return "text-amber-400";
  return "text-emerald-400";
}

function progressColor(value: number): string {
  if (value > 80) return "[&>div]:bg-rose-500";
  if (value > 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

// ── Status Header ───────────────────────────────────────

function XiaomiStatusHeader({ status, firmware }: { status: XiaomiStatus; firmware: XiaomiFirmware | null }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
          <Router className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {firmware?.router_name || "Xiaomi Router"}
          </h1>
          <p className="text-xs text-slate-500">
            {firmware?.hardware ?? "Xiaomi MiWiFi"}{" "}
            {firmware?.rom_version && (
              <span className="text-slate-600">· v{firmware.rom_version}</span>
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
          <Badge variant="outline" className="border-slate-800 text-slate-400">
            Uptime: {formatUptime(status.uptime)}
          </Badge>
        )}
        {status.device_count?.online != null && (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            <Users className="mr-1 h-3 w-3" />
            {status.device_count.online} devices online
          </Badge>
        )}
        {firmware?.update_available && (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
            Update available
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── System Stats Panel ──────────────────────────────────

function SystemStatsPanel({ status }: { status: XiaomiStatus }) {
  const cpuLoad = status.cpu?.load ?? 0;
  const memUsage = status.mem?.usage ?? 0;
  const memPercent = Math.round(memUsage * 100);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* CPU */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Cpu className="h-4 w-4" />
            CPU
          </div>
          <div className="mt-2">
            <span className={`text-2xl font-bold ${cpuColor(cpuLoad)}`}>
              {cpuLoad}%
            </span>
            <span className="ml-2 text-xs text-slate-500">
              {status.cpu?.cores ?? "?"} cores @ {status.cpu?.frequency ?? "?"}
            </span>
          </div>
          <Progress
            value={cpuLoad}
            max={100}
            className={`mt-2 h-2 bg-slate-800 ${progressColor(cpuLoad)}`}
          />
        </CardContent>
      </Card>

      {/* Memory */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <MemoryStick className="h-4 w-4" />
            Memory
          </div>
          <div className="mt-2">
            <span className={`text-2xl font-bold ${memColor(memUsage)}`}>
              {memPercent}%
            </span>
            <span className="ml-2 text-xs text-slate-500">
              of {status.mem?.total ?? "?"} {status.mem?.mem_type ?? ""} @ {status.mem?.frequency ?? "?"}
            </span>
          </div>
          <Progress
            value={memPercent}
            max={100}
            className={`mt-2 h-2 bg-slate-800 ${progressColor(memPercent)}`}
          />
        </CardContent>
      </Card>

      {/* Temperature */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Thermometer className="h-4 w-4" />
            Temperature
          </div>
          <div className="mt-2">
            {status.temperature != null ? (
              <>
                <span className={`text-2xl font-bold ${tempColor(status.temperature)}`}>
                  {status.temperature}°C
                </span>
              </>
            ) : (
              <span className="text-2xl font-bold text-slate-500">N/A</span>
            )}
          </div>
          {status.temperature != null && (
            <Progress
              value={status.temperature}
              max={100}
              className={`mt-2 h-2 bg-slate-800 ${progressColor(status.temperature)}`}
            />
          )}
        </CardContent>
      </Card>

      {/* Uptime */}
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock className="h-4 w-4" />
            Uptime
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-blue-400">
              {formatUptime(status.uptime)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── WAN Info Panel ──────────────────────────────────────

function WanInfoPanel({ wan }: { wan: XiaomiWanInfo }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Globe className="h-4 w-4 text-blue-400" />
          WAN Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* IPv4 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">IPv4</h3>
            <div className="space-y-2">
              <InfoRow label="WAN Type" value={wan.wan_type ?? "Unknown"} />
              <InfoRow label="IP Address" value={wan.ip ?? "—"} />
              <InfoRow label="Subnet Mask" value={wan.mask ?? "—"} />
              <InfoRow label="Gateway" value={wan.gateway ?? "—"} />
              <InfoRow
                label="DNS Servers"
                value={wan.dns_servers.length > 0 ? wan.dns_servers.join(", ") : "—"}
              />
            </div>
          </div>

          {/* IPv6 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">IPv6</h3>
            <div className="space-y-2">
              <InfoRow
                label="Status"
                value={wan.ipv6_ip ? "Enabled" : "Disabled"}
                valueClassName={wan.ipv6_ip ? "text-emerald-400" : "text-slate-500"}
              />
              {wan.ipv6_ip && (
                <>
                  <InfoRow label="IP Address" value={wan.ipv6_ip} />
                  <InfoRow label="Gateway" value={wan.ipv6_gateway ?? "—"} />
                  <InfoRow label="Prefix" value={wan.ipv6_prefix ?? "—"} />
                  <InfoRow
                    label="DNS Servers"
                    value={wan.ipv6_dns.length > 0 ? wan.ipv6_dns.join(", ") : "—"}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${valueClassName ?? "text-white"}`}>{value}</span>
    </div>
  );
}

// ── WiFi Bands Panel ────────────────────────────────────

function WifiBandsPanel({ wifi }: { wifi: XiaomiWifiInfo }) {
  if (wifi.bands.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Wifi className="h-4 w-4" />
          No WiFi bands detected
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Wifi className="h-4 w-4 text-purple-400" />
          WiFi Bands
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {wifi.bands.map((band) => (
            <div key={band.name} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{band.name}</span>
                {band.status === "1" ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-slate-700 text-slate-500">
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-2">
                <InfoRow label="SSID" value={band.ssid ?? "—"} />
                <InfoRow label="Channel" value={band.channel ?? "Auto"} />
                <InfoRow label="Bandwidth" value={band.bandwidth ?? "—"} />
                <InfoRow label="Encryption" value={band.encryption ?? "—"} />
                {band.band_steering != null && (
                  <InfoRow
                    label="Band Steering"
                    value={band.band_steering === "1" ? "Enabled" : "Disabled"}
                    valueClassName={band.band_steering === "1" ? "text-emerald-400" : "text-slate-500"}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Firmware Panel ──────────────────────────────────────

function FirmwarePanel({ firmware }: { firmware: XiaomiFirmware }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Info className="h-4 w-4 text-cyan-400" />
          Firmware & Hardware
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <InfoRow label="Router Name" value={firmware.router_name ?? "—"} />
          <InfoRow label="Firmware Version" value={firmware.rom_version ?? "—"} />
          <InfoRow label="Hardware" value={firmware.hardware ?? "—"} />
          <InfoRow label="Language" value={firmware.language ?? "—"} />
          <InfoRow
            label="Update Available"
            value={firmware.update_available ? "Yes" : "No"}
            valueClassName={firmware.update_available ? "text-amber-400" : "text-emerald-400"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── WAN Traffic Panel ───────────────────────────────────

function WanTrafficPanel({ status }: { status: XiaomiStatus }) {
  if (!status.wan_traffic) return null;

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Globe className="h-4 w-4 text-blue-400" />
          WAN Traffic
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <Download className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="text-xs text-slate-400">Download</div>
              <div className="text-lg font-bold text-white">
                {formatSpeed(status.wan_traffic.download_speed)}
              </div>
              <div className="text-xs text-slate-500">
                Max: {formatSpeed(status.wan_traffic.max_download_speed)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
            <Upload className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-xs text-slate-400">Upload</div>
              <div className="text-lg font-bold text-white">
                {formatSpeed(status.wan_traffic.upload_speed)}
              </div>
              <div className="text-xs text-slate-500">
                Max: {formatSpeed(status.wan_traffic.max_upload_speed)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────

export default function XiaomiRouter() {
  const statusData = useData(useCallback(() => fetchXiaomiStatus(), []));
  const [tab, setTab] = useState("system");

  // Lazy-load tab data
  const wanData = useData(useCallback(() => fetchXiaomiWanInfo(), []));
  const wifiData = useData(useCallback(() => fetchXiaomiWifi(), []));
  const firmwareData = useData(useCallback(() => fetchXiaomiFirmware(), []));

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(() => statusData.reload(), 30_000);
    return () => clearInterval(interval);
  }, [statusData.reload]);

  if (statusData.loading && !statusData.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!statusData.data?.configured) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Xiaomi router is not configured. Enable it in Settings &gt; Integrations.
      </div>
    );
  }

  if (!statusData.data.reachable) {
    return (
      <div className="space-y-4">
        <XiaomiStatusHeader status={statusData.data} firmware={firmwareData.data} />
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Cannot reach Xiaomi router. Check the URL and password in Settings.
        </div>
      </div>
    );
  }

  const status = statusData.data;

  return (
    <div className="space-y-6">
      <XiaomiStatusHeader status={status} firmware={firmwareData.data} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList className="border-slate-800 bg-slate-950">
            <TabsTrigger
              value="system"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Cpu className="mr-1.5 h-3.5 w-3.5" />
              System
            </TabsTrigger>
            <TabsTrigger
              value="wan"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Globe className="mr-1.5 h-3.5 w-3.5" />
              WAN
            </TabsTrigger>
            <TabsTrigger
              value="wifi"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Wifi className="mr-1.5 h-3.5 w-3.5" />
              WiFi
            </TabsTrigger>
            <TabsTrigger
              value="firmware"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Info className="mr-1.5 h-3.5 w-3.5" />
              Firmware
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={() => {
              statusData.reload();
              wanData.reload();
              wifiData.reload();
              firmwareData.reload();
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <TabsContent value="system" className="space-y-4">
          <SystemStatsPanel status={status} />
          <WanTrafficPanel status={status} />
        </TabsContent>

        <TabsContent value="wan">
          {wanData.loading && !wanData.data ? (
            <Skeleton className="h-64 w-full" />
          ) : wanData.error && !wanData.data ? (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {wanData.error}
            </div>
          ) : wanData.data ? (
            <WanInfoPanel wan={wanData.data} />
          ) : null}
        </TabsContent>

        <TabsContent value="wifi">
          {wifiData.loading && !wifiData.data ? (
            <Skeleton className="h-64 w-full" />
          ) : wifiData.error && !wifiData.data ? (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {wifiData.error}
            </div>
          ) : wifiData.data ? (
            <WifiBandsPanel wifi={wifiData.data} />
          ) : null}
        </TabsContent>

        <TabsContent value="firmware">
          {firmwareData.loading && !firmwareData.data ? (
            <Skeleton className="h-64 w-full" />
          ) : firmwareData.error && !firmwareData.data ? (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {firmwareData.error}
            </div>
          ) : firmwareData.data ? (
            <FirmwarePanel firmware={firmwareData.data} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
