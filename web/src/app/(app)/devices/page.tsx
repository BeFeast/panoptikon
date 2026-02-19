"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, HardDrive, MemoryStick, Search, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchDevices } from "@/lib/api";
import type { Device } from "@/lib/types";
import { formatPercent, timeAgo } from "@/lib/format";

type Filter = "all" | "online" | "offline" | "unknown";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setDevices(await fetchDevices());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load devices");
      }
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    if (!devices) return null;

    let list = devices;

    // Filter by status
    switch (filter) {
      case "online":
        list = list.filter((d) => d.is_online);
        break;
      case "offline":
        list = list.filter((d) => !d.is_online && d.is_known);
        break;
      case "unknown":
        list = list.filter((d) => !d.is_known);
        break;
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          (d.name ?? "").toLowerCase().includes(q) ||
          (d.hostname ?? "").toLowerCase().includes(q) ||
          (d.mac ?? "").toLowerCase().includes(q) ||
          (d.ips ?? []).some((ip) => ip.ip.includes(q))
      );
    }

    return list;
  }, [devices, filter, search]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const counts = devices
    ? {
        all: devices.length,
        online: devices.filter((d) => d.is_online).length,
        offline: devices.filter((d) => !d.is_online && d.is_known).length,
        unknown: devices.filter((d) => !d.is_known).length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Devices</h1>
        <Button>Scan Now</Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {(["all", "online", "offline", "unknown"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" && "All"}
            {f === "online" && "Online"}
            {f === "offline" && "Offline"}
            {f === "unknown" && "Unknown"}
            {counts && (
              <span className="ml-1.5 text-xs opacity-70">
                {counts[f]}
              </span>
            )}
          </Button>
        ))}

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder="Search name, IP, MAC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Device grid */}
      {filtered === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-[#2a2a3a] bg-[#16161f]">
              <CardContent className="p-5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-3 h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-36" />
                <Skeleton className="mt-2 h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-gray-500">
          No devices match your filters.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onClick={() => setSelectedDevice(device)}
            />
          ))}
        </div>
      )}

      {/* Slide-in detail panel */}
      <Sheet
        open={selectedDevice !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full border-[#2a2a3a] bg-[#0d0d14] sm:max-w-md"
        >
          {selectedDevice && <DeviceDetail device={selectedDevice} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Device Card ────────────────────────────────────────

function DeviceCard({
  device,
  onClick,
}: {
  device: Device;
  onClick: () => void;
}) {
  const ips = device.ips ?? [];
  const primaryIp = ips.find((ip) => ip.is_current)?.ip ?? ips[0]?.ip ?? "—";
  const displayName = device.name ?? device.hostname ?? "Unknown Device";

  return (
    <Card
      className="cursor-pointer border-[#2a2a3a] bg-[#16161f] transition-colors hover:border-blue-500/50"
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Name row */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              device.is_online ? "bg-green-500 status-pulse" : "bg-gray-500"
            }`}
          />
          <span className="truncate font-medium text-white">{displayName}</span>
          {!device.is_known && (
            <Badge variant="outline" className="ml-auto shrink-0 border-amber-500/50 text-amber-400 text-[10px]">
              NEW
            </Badge>
          )}
        </div>

        {/* Technical info */}
        <div className="mt-3 space-y-1">
          <p className="font-mono text-sm text-gray-400">{primaryIp}</p>
          <p className="font-mono text-xs text-gray-600">{device.mac}</p>
          {device.vendor && (
            <p className="text-xs text-gray-500">{device.vendor}</p>
          )}
        </div>

        {/* Agent badges or last seen */}
        {device.agent && device.agent.is_online ? (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Cpu className="h-3 w-3" />
              {device.agent.cpu_percent != null ? formatPercent(device.agent.cpu_percent) : "—"}
            </Badge>
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <MemoryStick className="h-3 w-3" />
              {device.agent.memory_percent != null ? formatPercent(device.agent.memory_percent) : "—"}
            </Badge>
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-600">
            Last seen {timeAgo(device.last_seen_at)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Device Detail (Sheet) ──────────────────────────────

function DeviceDetail({ device }: { device: Device }) {
  const ips = device.ips ?? [];
  const primaryIp = ips.find((ip) => ip.is_current)?.ip ?? ips[0]?.ip ?? "—";
  const displayName = device.name ?? device.hostname ?? "Unknown Device";

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              device.is_online ? "bg-green-500 status-pulse" : "bg-gray-500"
            }`}
          />
          <SheetTitle className="text-white">{displayName}</SheetTitle>
        </div>
        <SheetDescription>
          {device.is_online ? (
            <span className="text-green-400">Online</span>
          ) : (
            <span className="text-gray-500">
              Offline — last seen {timeAgo(device.last_seen_at)}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <Separator className="my-4 bg-[#2a2a3a]" />

      {/* Info grid */}
      <div className="space-y-4">
        <InfoRow label="IP Address" value={primaryIp} mono />
        <InfoRow label="MAC Address" value={device.mac} mono />
        {device.vendor && <InfoRow label="Vendor" value={device.vendor} />}
        {device.hostname && <InfoRow label="Hostname" value={device.hostname} />}
        <InfoRow label="First Seen" value={timeAgo(device.first_seen_at)} />
        <InfoRow label="Last Seen" value={timeAgo(device.last_seen_at)} />
        <InfoRow label="Status" value={device.is_known ? "Known" : "Unacknowledged"} />

        {/* All IPs */}
        {ips.length > 1 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              All IP Addresses
            </p>
            <div className="mt-1 space-y-0.5">
              {ips.map((ip) => (
                <p key={ip.ip} className="font-mono text-sm text-gray-300">
                  {ip.ip}
                  {ip.subnet && (
                    <span className="ml-2 text-xs text-gray-600">{ip.subnet}</span>
                  )}
                  {!ip.is_current && (
                    <span className="ml-2 text-xs text-gray-600">(old)</span>
                  )}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Agent info */}
        {device.agent && (
          <>
            <Separator className="bg-[#2a2a3a]" />
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Agent Telemetry
            </p>
            <div className="flex items-center gap-2">
              {device.agent.is_online ? (
                <Wifi className="h-4 w-4 text-green-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )}
              <span className="text-sm text-gray-300">
                {device.agent.is_online ? "Connected" : "Disconnected"}
              </span>
            </div>
            {device.agent.cpu_percent != null && (
              <InfoRow label="CPU Usage" value={formatPercent(device.agent.cpu_percent)} />
            )}
            {device.agent.memory_percent != null && (
              <InfoRow label="Memory Usage" value={formatPercent(device.agent.memory_percent)} />
            )}
          </>
        )}

        {/* Notes */}
        {device.notes && (
          <>
            <Separator className="bg-[#2a2a3a]" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </p>
              <p className="mt-1 text-sm text-gray-300">{device.notes}</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span
        className={`text-sm text-gray-300 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
