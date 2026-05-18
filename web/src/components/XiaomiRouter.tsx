"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Globe,
  Cpu,
  Clock,
  MemoryStick,
  Thermometer,
  Wifi,
  ArrowDown,
  ArrowUp,
  HardDrive,
  Download,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  fetchXiaomiStatus,
  fetchXiaomiWanInfo,
  fetchXiaomiWifiBands,
  fetchXiaomiWifiDevices,
  fetchXiaomiFirmware,
} from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type {
  XiaomiStatus,
  XiaomiWanInfo,
  XiaomiWifiBand,
  XiaomiWifiDevice,
  XiaomiFirmware,
} from "@/lib/types";
import {
  RouterWorkspaceHeader,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

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
  if (!bytesPerSec) return "0 B/s";
  const n = parseFloat(bytesPerSec);
  if (isNaN(n) || n === 0) return "0 B/s";
  return `${formatBytes(n)}/s`;
}

function progressColor(value: number): string {
  if (value >= 90) return "bg-[#fb7185]";
  if (value >= 70) return "bg-[#fbbf24]";
  return "bg-[#4ade80]";
}

function tempColor(temp: number): string {
  if (temp >= 80) return "text-[#fb7185]";
  if (temp >= 60) return "text-[#fbbf24]";
  return "text-[#4ade80]";
}

// ── System Stats Section ─────────────────────────────────

function SystemStats({ status }: { status: XiaomiStatus }) {
  const cpuLoad = status.cpu_load ? Math.round(status.cpu_load * 100) : 0;
  const memUsage = status.mem_usage ? Math.round(status.mem_usage * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-mesh-text">
          <Cpu className="h-4 w-4 text-[#fbbf24]" />
          System Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* CPU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-mesh-text-dim">
              CPU ({status.cpu_cores ?? "?"}-core @ {status.cpu_freq ?? "?"})
            </span>
            <span className="font-mono text-mesh-text">{cpuLoad}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-mesh-surface-1">
            <div
              className={`h-full rounded-full transition-all ${progressColor(cpuLoad)}`}
              style={{ width: `${cpuLoad}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-mesh-text-dim">
              RAM ({status.mem_total ?? "?"} {status.mem_type ?? ""})
            </span>
            <span className="font-mono text-mesh-text">{memUsage}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-mesh-surface-1">
            <div
              className={`h-full rounded-full transition-all ${progressColor(memUsage)}`}
              style={{ width: `${memUsage}%` }}
            />
          </div>
        </div>

        {/* Temperature + Uptime row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-mesh-surface-1 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
              <Thermometer className="h-3.5 w-3.5" />
              Temperature
            </div>
            <p
              className={`mt-1.5 text-lg font-semibold ${status.temperature != null ? tempColor(status.temperature) : "text-mesh-text-dim"}`}
            >
              {status.temperature != null ? `${status.temperature}\u00b0C` : "\u2014"}
            </p>
          </div>
          <div className="rounded-lg bg-mesh-surface-1 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
              <Clock className="h-3.5 w-3.5" />
              Uptime
            </div>
            <p className="mt-1.5 text-lg font-semibold text-mesh-text">
              {formatUptime(status.uptime)}
            </p>
          </div>
        </div>

        {/* Devices + Bandwidth row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-mesh-surface-1 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
              <Users className="h-3.5 w-3.5" />
              Devices Online
            </div>
            <p className="mt-1.5 text-lg font-semibold text-mesh-text">
              {status.devices_online ?? 0}
              <span className="ml-1 text-sm font-normal text-mesh-text-mute">
                / {status.devices_total ?? 0}
              </span>
            </p>
          </div>
          <div className="rounded-lg bg-mesh-surface-1 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
              WAN Speed
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-[#4ade80]">
                <ArrowDown className="h-3 w-3" />
                {formatSpeed(status.wan_download)}
              </span>
              <span className="flex items-center gap-1 text-mesh-primary">
                <ArrowUp className="h-3 w-3" />
                {formatSpeed(status.wan_upload)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── WAN Info Section ─────────────────────────────────────

function WanInfoSection({ wan }: { wan: XiaomiWanInfo }) {
  const dnsServers = wan.dns?.split(",").map((d) => d.trim()) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-mesh-text">
          <Globe className="h-4 w-4 text-mesh-primary" />
          WAN Info
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-mesh-text-mute">WAN IP</span>
            <p className="font-mono text-mesh-text">{wan.ip ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Gateway</span>
            <p className="font-mono text-mesh-text">{wan.gateway ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Subnet Mask</span>
            <p className="font-mono text-mesh-text">{wan.mask ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">WAN Type</span>
            <p className="text-mesh-text">
              <Badge
                variant="outline"
                className="border-mesh-border-strong text-mesh-text"
              >
                {wan.wan_type ?? "\u2014"}
              </Badge>
            </p>
          </div>
          <div>
            <span className="text-mesh-text-mute">DNS Servers</span>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {dnsServers.length > 0
                ? dnsServers.map((d) => (
                    <Badge
                      key={d}
                      variant="outline"
                      className="border-mesh-border-strong font-mono text-mesh-text"
                    >
                      {d}
                    </Badge>
                  ))
                : <span className="text-mesh-text-dim">{"\u2014"}</span>}
            </div>
          </div>
          <div>
            <span className="text-mesh-text-mute">IPv6 Status</span>
            <p className="text-mesh-text">
              <Badge
                variant="outline"
                className={
                  wan.ipv6_status === "enabled"
                    ? "border-[#4ade80] text-[#4ade80]"
                    : "border-mesh-border-strong text-mesh-text-dim"
                }
              >
                {wan.ipv6_status ?? "unknown"}
              </Badge>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── WiFi Bands Section ───────────────────────────────────

/**
 * Convert the server's compact band token (e.g. "2.4GHz") to a display
 * label with proper spacing.  Falls back to channel-based inference for
 * any older API response that lacks the `band` field, and to a positional
 * label as a last resort (#545).
 */
function toBandDisplayLabel(
  serverBand: string | undefined,
  channel: string | null,
  index: number,
): string {
  // Server-provided band (canonical, added in #545)
  if (serverBand) {
    if (serverBand === "2.4GHz") return "2.4 GHz";
    if (serverBand === "5GHz") return "5 GHz";
    if (serverBand === "6GHz") return "6 GHz";
    return serverBand; // future-proof pass-through
  }
  // Legacy fallback: channel-based (only reliable when channel ≠ 0)
  if (channel) {
    const n = parseInt(channel, 10);
    if (n > 14) return "5 GHz";
    if (n > 0) return "2.4 GHz";
  }
  // Positional fallback: MiWiFi emits bands in ascending-frequency order
  return index === 0 ? "2.4 GHz" : "5 GHz";
}

function WifiBandsSection({
  bands,
  wifiDevices,
}: {
  bands: XiaomiWifiBand[];
  wifiDevices: XiaomiWifiDevice[];
}) {
  // Deduplicate by (bandLabel, ssid) as a frontend safety net.
  // The backend already deduplicates (#545), but guard against any old API
  // response or unexpected duplicates reaching the UI.
  const dedupedBands = (() => {
    const seen = new Set<string>();
    return bands.filter((b, i) => {
      const label = toBandDisplayLabel(b.band, b.channel, i);
      const key = `${label}|${b.ssid ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  // Count connected clients per band
  const clientsByBand = wifiDevices.reduce<Record<string, number>>(
    (acc, d) => {
      const b = d.band ?? "unknown";
      acc[b] = (acc[b] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Mesh routers may not report per-band client info (all devices have band=null).
  // In that case, per-band counts are meaningless — show "—" instead of 0.
  const hasBandInfo =
    wifiDevices.length > 0 && wifiDevices.some((d) => d.band != null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-mesh-text">
          <Wifi className="h-4 w-4 text-[#a78bfa]" />
          WiFi Bands
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dedupedBands.length === 0 ? (
          <p className="text-sm text-mesh-text-mute">No WiFi bands detected.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dedupedBands.map((band, i) => {
              const bandLabel = toBandDisplayLabel(band.band, band.channel, i);
              const clientCount = Object.entries(clientsByBand).reduce(
                (sum, [key, count]) => {
                  if (
                    (bandLabel === "5 GHz" && key.includes("5g")) ||
                    (bandLabel === "2.4 GHz" && key.includes("2.4g")) ||
                    key.includes(bandLabel)
                  ) {
                    return sum + count;
                  }
                  return sum;
                },
                0
              );

              return (
                <div
                  key={`${bandLabel}|${band.ssid ?? i}`}
                  className="mesh-card-2 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Badge className="bg-[#a78bfa]/20 text-[#a78bfa]">
                      {bandLabel}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        band.status === "1"
                          ? "border-[#4ade80] text-[#4ade80]"
                          : "border-mesh-border-strong text-mesh-text-mute"
                      }
                    >
                      {band.status === "1" ? "Active" : "Off"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-mesh-text-mute">SSID</span>
                      <p className="truncate text-mesh-text">
                        {band.ssid ?? "\u2014"}
                      </p>
                    </div>
                    <div>
                      <span className="text-mesh-text-mute">Channel</span>
                      <p className="text-mesh-text">
                        {!band.channel || band.channel === "0"
                          ? "Auto"
                          : band.channel}
                      </p>
                    </div>
                    <div>
                      <span className="text-mesh-text-mute">Clients</span>
                      <p className="text-mesh-text">
                        {hasBandInfo ? clientCount : "\u2014"}
                      </p>
                    </div>
                    <div>
                      <span className="text-mesh-text-mute">Band Steering</span>
                      <p className="text-mesh-text">
                        <Badge
                          variant="outline"
                          className={
                            band.band_steering === "1"
                              ? "border-[#4ade80] text-[#4ade80]"
                              : "border-mesh-border-strong text-mesh-text-dim"
                          }
                        >
                          {band.band_steering === "1" ? "On" : "Off"}
                        </Badge>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Firmware Section ─────────────────────────────────────

function FirmwareSection({ firmware }: { firmware: XiaomiFirmware }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-mesh-text">
          <HardDrive className="h-4 w-4 text-mesh-accent" />
          Firmware & Updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-mesh-text-mute">Firmware Version</span>
            <p className="font-mono text-mesh-text">
              {firmware.rom_version ?? "\u2014"}
            </p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Hardware</span>
            <p className="text-mesh-text">{firmware.hardware ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Model</span>
            <p className="text-mesh-text">{firmware.model ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Router Name</span>
            <p className="text-mesh-text">{firmware.router_name ?? "\u2014"}</p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Locale</span>
            <p className="text-mesh-text">
              {firmware.language ?? firmware.country_code ?? "\u2014"}
            </p>
          </div>
          <div>
            <span className="text-mesh-text-mute">Update Available</span>
            <p>
              {firmware.update_available ? (
                <Badge className="bg-[#fbbf24]/20 text-[#fbbf24]">
                  <Download className="mr-1 h-3 w-3" />
                  {firmware.update_version ?? "Yes"}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-[#4ade80] text-[#4ade80]"
                >
                  Up to date
                </Badge>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────

export default function XiaomiRouter() {
  const [status, setStatus] = useState<XiaomiStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchXiaomiStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          configured: false,
          reachable: false,
          cpu_cores: null,
          cpu_freq: null,
          cpu_load: null,
          mem_usage: null,
          mem_total: null,
          mem_type: null,
          temperature: null,
          wan_download: null,
          wan_upload: null,
          devices_online: null,
          devices_total: null,
          uptime: null,
        })
      )
      .finally(() => setLoading(false));
  }, []);

  const wan = useData(useCallback(() => fetchXiaomiWanInfo(), []));
  const bands = useData(useCallback(() => fetchXiaomiWifiBands(), []));
  const wifiDevices = useData(useCallback(() => fetchXiaomiWifiDevices(), []));
  const firmware = useData(useCallback(() => fetchXiaomiFirmware(), []));

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
      <RouterWorkspaceState
        title={
          !status?.configured
            ? "Xiaomi router is not configured"
            : "Xiaomi router is unreachable"
        }
        description={
          !status?.configured
            ? "Enable the Xiaomi Mesh integration in Settings \u2192 Integrations \u2192 Xiaomi Mesh before viewing system stats, WAN, and WiFi bands."
            : "The integration is enabled, but the router did not respond. Check connection settings and credentials."
        }
        settingsHref="/settings/xiaomi-mesh"
        settingsLabel="Configure Xiaomi Mesh"
        tone={!status?.configured ? "amber" : "rose"}
      />
    );
  }

  const meta: { label: string; value: string; mono?: boolean }[] = [
    {
      label: "devices",
      value: `${status.devices_online ?? 0}/${status.devices_total ?? 0}`,
      mono: true,
    },
  ];
  if (status.cpu_cores)
    meta.push({ label: "cpu", value: `${status.cpu_cores}c`, mono: true });
  if (status.mem_total)
    meta.push({ label: "ram", value: status.mem_total, mono: true });

  return (
    <div className="space-y-6">
      {/* Header */}
      <RouterWorkspaceHeader
        eyebrow="mesh workspace"
        title="Xiaomi Router"
        tone="amber"
        icon={<Router className="h-5 w-5" />}
        subtitle={`${status.devices_online ?? 0} devices online`}
        connected={Boolean(status.reachable)}
        meta={meta}
      />

      {/* System Stats */}
      <SystemStats status={status} />

      {/* WAN Info */}
      {wan.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : wan.data ? (
        <WanInfoSection wan={wan.data} />
      ) : null}

      {/* WiFi Bands */}
      {bands.loading || wifiDevices.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : bands.data ? (
        <WifiBandsSection
          bands={bands.data}
          wifiDevices={wifiDevices.data ?? []}
        />
      ) : null}

      {/* Firmware */}
      {firmware.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : firmware.data?.reachable ? (
        <FirmwareSection firmware={firmware.data} />
      ) : null}
    </div>
  );
}
