"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Globe,
  Cpu,
  MemoryStick,
  Wifi,
  Server,
  AlertCircle,
  Thermometer,
  Clock,
  Download,
  Upload,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  fetchXiaomiStatus,
  fetchXiaomiWanInfo,
  fetchXiaomiNewStatus,
  fetchXiaomiWifiDevices,
  fetchXiaomiWifiDetailAll,
  fetchXiaomiInitInfo,
  fetchXiaomiRomUpdate,
} from "@/lib/api";
import type {
  XiaomiStatus,
  XiaomiWanInfo,
  XiaomiNewStatus,
  XiaomiWifiDevice,
  XiaomiWifiBand,
  XiaomiInitInfo,
  XiaomiRomUpdate,
} from "@/lib/types";

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

// ── Helpers ───────────────────────────────────────────────

function cpuColor(load: number): string {
  if (load >= 80) return "text-red-400";
  if (load >= 50) return "text-amber-400";
  return "text-emerald-400";
}

function memColor(usage: number): string {
  if (usage >= 80) return "text-red-400";
  if (usage >= 60) return "text-amber-400";
  return "text-emerald-400";
}

function tempColor(temp: number): string {
  if (temp >= 80) return "text-red-400";
  if (temp >= 60) return "text-amber-400";
  return "text-emerald-400";
}

function progressColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Section: WAN Info ─────────────────────────────────────

function WanInfoSection({
  wanInfo,
  loading,
}: {
  wanInfo: XiaomiWanInfo | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Globe className="h-4 w-4 text-blue-400" />
            WAN Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!wanInfo) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Globe className="h-4 w-4 text-blue-400" />
            WAN Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Unable to load WAN info</p>
        </CardContent>
      </Card>
    );
  }

  const ipv6Status =
    wanInfo.ipv6 && typeof wanInfo.ipv6 === "object"
      ? "Enabled"
      : wanInfo.ipv6
        ? String(wanInfo.ipv6)
        : "Disabled";

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Globe className="h-4 w-4 text-blue-400" />
          WAN Info
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">WAN IP</dt>
          <dd className="font-mono text-white">{wanInfo.ip ?? "\u2014"}</dd>

          <dt className="text-slate-500">Gateway</dt>
          <dd className="font-mono text-white">{wanInfo.gateway ?? "\u2014"}</dd>

          <dt className="text-slate-500">DNS</dt>
          <dd className="font-mono text-white">{wanInfo.dns ?? "\u2014"}</dd>

          <dt className="text-slate-500">WAN Type</dt>
          <dd className="text-white">
            <Badge
              variant="outline"
              className="border-slate-700 text-slate-300"
            >
              {wanInfo.wan_type ?? "Unknown"}
            </Badge>
          </dd>

          <dt className="text-slate-500">Subnet Mask</dt>
          <dd className="font-mono text-white">{wanInfo.mask ?? "\u2014"}</dd>

          <dt className="text-slate-500">IPv6</dt>
          <dd className="text-white">
            <Badge
              variant="outline"
              className={
                ipv6Status === "Enabled" || ipv6Status !== "Disabled"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-700 text-slate-400"
              }
            >
              {ipv6Status}
            </Badge>
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Section: System Stats ─────────────────────────────────

function SystemStatsSection({
  status,
  loading,
}: {
  status: XiaomiStatus | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Server className="h-4 w-4 text-violet-400" />
            System Stats
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!status || !status.reachable) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Server className="h-4 w-4 text-violet-400" />
            System Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            {!status?.configured
              ? "Xiaomi router not configured"
              : "Unable to reach router"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const cpuLoad = status.cpu_load ?? 0;
  const cpuPct = Math.round(cpuLoad * 100);
  const memUsage = status.mem_usage ?? 0;
  const memPct = Math.round(memUsage * 100);
  const temp = status.temperature ?? 0;

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Server className="h-4 w-4 text-violet-400" />
          System Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* CPU */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium text-slate-300">CPU</span>
            </div>
            <span className={`text-lg font-bold ${cpuColor(cpuPct)}`}>
              {cpuPct}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${progressColor(cpuPct)}`}
              style={{ width: `${cpuPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {status.cpu_cores ?? "?"}-core @ {status.cpu_freq ?? "?"}
          </p>
        </div>

        {/* Memory */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-slate-300">Memory</span>
            </div>
            <span className={`text-lg font-bold ${memColor(memPct)}`}>
              {memPct}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${progressColor(memPct)}`}
              style={{ width: `${memPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {status.mem_total ?? "?"} {status.mem_type ?? ""}
          </p>
        </div>

        {/* Temperature */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-slate-300">Temperature</span>
            </div>
            <span className={`text-lg font-bold ${tempColor(temp)}`}>
              {temp > 0 ? `${temp}\u00b0C` : "\u2014"}
            </span>
          </div>
        </div>

        {/* WAN Throughput */}
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-300">WAN Throughput</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-white">
                {status.wan_download
                  ? `${(parseInt(status.wan_download, 10) / 1024).toFixed(1)} KB/s`
                  : "\u2014"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-white">
                {status.wan_upload
                  ? `${(parseInt(status.wan_upload, 10) / 1024).toFixed(1)} KB/s`
                  : "\u2014"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section: WiFi Bands Summary ───────────────────────────

function WifiBandsSection({
  bands,
  wifiDevices,
  loading,
}: {
  bands: XiaomiWifiBand[] | null;
  wifiDevices: XiaomiWifiDevice[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Wifi className="h-4 w-4 text-green-400" />
            WiFi Bands
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!bands || bands.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Wifi className="h-4 w-4 text-green-400" />
            WiFi Bands
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No WiFi band data available</p>
        </CardContent>
      </Card>
    );
  }

  // Count clients per band from wifiDevices
  const clientsByBand = new Map<string, number>();
  if (wifiDevices) {
    for (const device of wifiDevices) {
      const band = device.band ?? "unknown";
      clientsByBand.set(band, (clientsByBand.get(band) ?? 0) + 1);
    }
  }

  // Classify band from ifname: wl0 = 2.4GHz, wl1 = 5GHz (typical Xiaomi convention)
  function guessBandLabel(band: XiaomiWifiBand): string {
    const ifname = band.ifname ?? "";
    const ch = parseInt(band.channel ?? "0", 10);
    if (ifname.includes("wl0") || ifname.includes("2g") || (ch >= 1 && ch <= 14))
      return "2.4 GHz";
    if (ifname.includes("wl1") || ifname.includes("5g") || ch >= 36)
      return "5 GHz";
    if (ifname.includes("wl2") || ifname.includes("6g") || ch >= 1)
      return "6 GHz";
    return ifname || "Unknown";
  }

  function clientsForBand(band: XiaomiWifiBand): number {
    const label = guessBandLabel(band);
    // Match on common patterns from wifiDevices band field
    let count = 0;
    if (wifiDevices) {
      for (const d of wifiDevices) {
        const dBand = d.band ?? "";
        if (
          (label === "2.4 GHz" && dBand.includes("2.4")) ||
          (label === "5 GHz" && dBand.includes("5")) ||
          (label === "6 GHz" && dBand.includes("6"))
        ) {
          count++;
        }
      }
    }
    return count;
  }

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Wifi className="h-4 w-4 text-green-400" />
          WiFi Bands
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {bands.map((band, idx) => {
          const bandLabel = guessBandLabel(band);
          const clients = clientsForBand(band);
          const isEnabled = band.status === "1" || band.status === "on";

          return (
            <div
              key={idx}
              className="rounded-lg border border-slate-800 bg-slate-950 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {bandLabel}
                </span>
                <Badge
                  variant="outline"
                  className={
                    isEnabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 text-slate-500"
                  }
                >
                  {isEnabled ? "Active" : "Disabled"}
                </Badge>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">SSID</dt>
                  <dd className="font-mono text-white">{band.ssid ?? "\u2014"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Channel</dt>
                  <dd className="text-white">{band.channel ?? "\u2014"}</dd>
                </div>
                {band.bandwidth && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Bandwidth</dt>
                    <dd className="text-white">{band.bandwidth}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Clients</dt>
                  <dd className="text-white">{clients}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Section: Firmware & Updates ───────────────────────────

function FirmwareSection({
  initInfo,
  newStatus,
  romUpdate,
  loading,
}: {
  initInfo: XiaomiInitInfo | null;
  newStatus: XiaomiNewStatus | null;
  romUpdate: XiaomiRomUpdate | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Server className="h-4 w-4 text-amber-400" />
            Firmware & Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const version =
    initInfo?.rom_version ?? newStatus?.version ?? "\u2014";
  const hardware = initInfo?.hardware ?? newStatus?.platform ?? "\u2014";

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Server className="h-4 w-4 text-amber-400" />
          Firmware & Updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Firmware</dt>
          <dd className="font-mono text-white">{version}</dd>

          <dt className="text-slate-500">Hardware</dt>
          <dd className="text-white">{hardware}</dd>

          {initInfo?.router_name && (
            <>
              <dt className="text-slate-500">Router Name</dt>
              <dd className="text-white">{initInfo.router_name}</dd>
            </>
          )}

          {initInfo?.language && (
            <>
              <dt className="text-slate-500">Locale</dt>
              <dd className="text-white">
                {initInfo.language}
                {initInfo.countrycode ? ` (${initInfo.countrycode})` : ""}
              </dd>
            </>
          )}

          <dt className="text-slate-500">Update</dt>
          <dd>
            {romUpdate ? (
              romUpdate.update_available ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                >
                  Update available
                  {romUpdate.latest_version
                    ? `: ${romUpdate.latest_version}`
                    : ""}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                >
                  Up to date
                </Badge>
              )
            ) : (
              <span className="text-slate-500">Unable to check</span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────

export default function XiaomiRouter() {
  const statusResult = useData(fetchXiaomiStatus);
  const wanResult = useData(fetchXiaomiWanInfo);
  const newStatusResult = useData(fetchXiaomiNewStatus);
  const wifiDevicesResult = useData(fetchXiaomiWifiDevices);
  const wifiBandsResult = useData(fetchXiaomiWifiDetailAll);
  const initInfoResult = useData(fetchXiaomiInitInfo);
  const romUpdateResult = useData(fetchXiaomiRomUpdate);

  const allLoading =
    statusResult.loading &&
    wanResult.loading &&
    wifiBandsResult.loading &&
    initInfoResult.loading;

  const handleRefresh = () => {
    statusResult.reload();
    wanResult.reload();
    newStatusResult.reload();
    wifiDevicesResult.reload();
    wifiBandsResult.reload();
    initInfoResult.reload();
    romUpdateResult.reload();
    toast.success("Refreshing Xiaomi router data...");
  };

  const status = statusResult.data;

  // If not configured at all, show a placeholder
  if (!statusResult.loading && status && !status.configured) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
              <Router className="h-8 w-8 text-slate-500" />
            </div>
            <h1 className="text-xl font-semibold text-white">
              Xiaomi Router Not Configured
            </h1>
            <p className="text-center text-sm text-slate-500">
              Enable Xiaomi MiWiFi integration in Settings to connect your
              router.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
            <Router className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Xiaomi Router</h1>
            <p className="text-xs text-slate-500">
              {initInfoResult.data?.hardware ?? newStatusResult.data?.platform ?? "MiWiFi"}{" "}
              {(initInfoResult.data?.rom_version ?? newStatusResult.data?.version) && (
                <span className="text-slate-600">
                  &middot; v{initInfoResult.data?.rom_version ?? newStatusResult.data?.version}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!statusResult.loading && status && (
            <>
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
                  className="border-red-500/30 bg-red-500/10 text-red-400"
                >
                  &#9679; Unreachable
                </Badge>
              )}
              {status.devices_online != null && (
                <Badge
                  variant="outline"
                  className="border-slate-700 text-slate-300"
                >
                  {status.devices_online} device{status.devices_online !== 1 ? "s" : ""} online
                </Badge>
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WanInfoSection wanInfo={wanResult.data} loading={wanResult.loading} />
        <SystemStatsSection
          status={statusResult.data}
          loading={statusResult.loading}
        />
      </div>

      <WifiBandsSection
        bands={wifiBandsResult.data}
        wifiDevices={wifiDevicesResult.data}
        loading={wifiBandsResult.loading || wifiDevicesResult.loading}
      />

      <FirmwareSection
        initInfo={initInfoResult.data}
        newStatus={newStatusResult.data}
        romUpdate={romUpdateResult.data}
        loading={initInfoResult.loading || romUpdateResult.loading}
      />
    </div>
  );
}
