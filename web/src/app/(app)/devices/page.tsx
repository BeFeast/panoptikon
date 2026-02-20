"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Cpu, Loader2, LayoutGrid, List, MemoryStick, Power, Radar, Search, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchDevices, fetchDeviceEvents, fetchDeviceUptime, wakeDevice, triggerPortScan, fetchPortScan } from "@/lib/api";
import type { DeviceEvent, UptimeStats, PortScanResult } from "@/lib/api";
import type { Device } from "@/lib/types";
import { formatPercent, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | "online" | "offline" | "unknown";
type ViewMode = "grid" | "table";
type SortField = "last_seen_at" | "ip" | "hostname";
type SortDir = "asc" | "desc";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("devices-view-preference") as ViewMode) || "grid";
    }
    return "grid";
  });
  const [sortField, setSortField] = useState<SortField>("last_seen_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    try {
      setDevices(await fetchDevices());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  // Refetch immediately when a device or agent state change arrives via WebSocket
  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_online", "agent_offline"],
    load
  );

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
          (d.vendor ?? "").toLowerCase().includes(q) ||
          (d.ips ?? []).some((ip) => ip.includes(q)) ||
          (d.mdns_services ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [devices, filter, search]);

  const toggleView = useCallback((newView: ViewMode) => {
    setView(newView);
    localStorage.setItem("devices-view-preference", newView);
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDir(field === "last_seen_at" ? "desc" : "asc");
      return field;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "ip": {
          const aIp = (a.ips ?? [])[0] ?? "";
          const bIp = (b.ips ?? [])[0] ?? "";
          // Numeric IP comparison
          const aParts = aIp.split(".").map(Number);
          const bParts = bIp.split(".").map(Number);
          for (let i = 0; i < 4; i++) {
            cmp = (aParts[i] ?? 0) - (bParts[i] ?? 0);
            if (cmp !== 0) break;
          }
          break;
        }
        case "hostname": {
          const aH = (a.hostname ?? "").toLowerCase();
          const bH = (b.hostname ?? "").toLowerCase();
          cmp = aH.localeCompare(bH);
          break;
        }
        case "last_seen_at":
        default: {
          cmp = new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime();
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortField, sortDir]);

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
            placeholder="Search name, IP, MAC, vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View toggle */}
        <div className="flex shrink-0 gap-1">
          <Button
            variant={view === "grid" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9"
            onClick={() => toggleView("grid")}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "table" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9"
            onClick={() => toggleView("table")}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Device list */}
      {sorted === null ? (
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
      ) : sorted.length === 0 ? (
        <p className="py-10 text-center text-gray-500">
          No devices match your filters.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {sorted.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onClick={() => setSelectedDevice(device)}
            />
          ))}
        </div>
      ) : (
        <DevicesTable
          devices={sorted}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={setSelectedDevice}
        />
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
  const primaryIp = ips[0] ?? "—";
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

        {/* mDNS service badges */}
        {device.mdns_services && (
          <div className="mt-2 flex flex-wrap gap-1">
            {device.mdns_services.split(",").map((svc) => (
              <Badge
                key={svc}
                variant="outline"
                className="border-purple-500/50 text-purple-400 text-[10px]"
              >
                {svc.trim()}
              </Badge>
            ))}
          </div>
        )}

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

// ─── Devices Table ─────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return null;
  return sortDir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

function DevicesTable({
  devices,
  sortField,
  sortDir,
  onSort,
  onSelect,
}: {
  devices: Device[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (device: Device) => void;
}) {
  return (
    <div className="rounded-md border border-[#2a2a3a] bg-[#16161f]">
      <Table>
        <TableHeader>
          <TableRow className="border-[#2a2a3a] hover:bg-transparent">
            <TableHead className="w-12 text-gray-400">Status</TableHead>
            <TableHead
              className="cursor-pointer select-none text-gray-400 hover:text-white"
              onClick={() => onSort("ip")}
            >
              IP Address
              <SortIcon field="ip" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none text-gray-400 hover:text-white"
              onClick={() => onSort("hostname")}
            >
              Hostname
              <SortIcon field="hostname" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-gray-400">MAC</TableHead>
            <TableHead className="text-gray-400">Vendor</TableHead>
            <TableHead className="text-gray-400">Agent</TableHead>
            <TableHead
              className="cursor-pointer select-none text-gray-400 hover:text-white"
              onClick={() => onSort("last_seen_at")}
            >
              Last Seen
              <SortIcon field="last_seen_at" sortField={sortField} sortDir={sortDir} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device) => {
            const primaryIp = (device.ips ?? [])[0] ?? "—";
            const agentText =
              device.agent && device.agent.cpu_percent != null && device.agent.memory_percent != null
                ? `${formatPercent(device.agent.cpu_percent)} / ${formatPercent(device.agent.memory_percent)}`
                : "—";

            return (
              <TableRow
                key={device.id}
                className="cursor-pointer border-[#2a2a3a] hover:bg-[#1e1e2e]"
                onClick={() => onSelect(device)}
              >
                <TableCell>
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      device.is_online ? "bg-green-500 status-pulse" : "bg-gray-500"
                    }`}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm text-gray-300">
                  {primaryIp}
                </TableCell>
                <TableCell className="text-sm text-gray-300">
                  {device.hostname ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-500">
                  {device.mac}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {device.vendor ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {agentText}
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {timeAgo(device.last_seen_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Device Detail (Sheet) ──────────────────────────────

function DeviceDetail({ device }: { device: Device }) {
  const ips = device.ips ?? [];
  const primaryIp = ips[0] ?? "—";
  const displayName = device.name ?? device.hostname ?? "Unknown Device";
  const [waking, setWaking] = useState(false);

  const handleWake = async () => {
    setWaking(true);
    try {
      await wakeDevice(device.id);
      toast.success("Magic packet sent! Device should wake up shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send magic packet");
    } finally {
      setWaking(false);
    }
  };

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

      {/* Wake-on-LAN button — only active when device is offline */}
      {!device.is_online && (
        <div className="mt-4 space-y-1">
          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            disabled={waking}
            onClick={handleWake}
          >
            <Power className="h-4 w-4" />
            {waking ? "Sending…" : "Wake"}
          </Button>
          <p className="text-center text-[11px] text-gray-600">
            Requires Wake-on-LAN enabled in BIOS
          </p>
        </div>
      )}

      <Separator className="my-4 bg-[#2a2a3a]" />

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-4 w-full bg-[#1e1e2e]">
          <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
          <TabsTrigger value="ports" className="flex-1">Ports</TabsTrigger>
          <TabsTrigger value="events" className="flex-1">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <DeviceInfoTab device={device} ips={ips} primaryIp={primaryIp} />
        </TabsContent>

        <TabsContent value="ports">
          <DevicePortsTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="events">
          <DeviceEventsTab deviceId={device.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Device Info Tab ────────────────────────────────────

function DeviceInfoTab({
  device,
  ips,
  primaryIp,
}: {
  device: Device;
  ips: string[];
  primaryIp: string;
}) {
  return (
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
              <p key={ip} className="font-mono text-sm text-gray-300">
                {ip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* mDNS Services */}
      {device.mdns_services && (
        <>
          <Separator className="bg-[#2a2a3a]" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              mDNS Services
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {device.mdns_services.split(",").map((svc) => (
                <Badge
                  key={svc}
                  variant="outline"
                  className="border-purple-500/50 text-purple-400 text-[11px]"
                >
                  {svc.trim()}
                </Badge>
              ))}
            </div>
          </div>
        </>
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
  );
}

// ─── Device Events Tab ──────────────────────────────────

function DeviceEventsTab({ deviceId }: { deviceId: string }) {
  const [events, setEvents] = useState<DeviceEvent[] | null>(null);
  const [uptime, setUptime] = useState<UptimeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [evts, upt] = await Promise.all([
          fetchDeviceEvents(deviceId, 50),
          fetchDeviceUptime(deviceId, 7),
        ]);
        if (!cancelled) {
          setEvents(evts);
          setUptime(upt);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load events");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [deviceId]);

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (events === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Uptime badge */}
      {uptime && (
        <div className="flex items-center gap-3 rounded-md border border-[#2a2a3a] bg-[#1e1e2e] px-4 py-3">
          <div className="text-sm text-gray-400">7-day uptime</div>
          <div className="ml-auto text-lg font-semibold text-white">
            {uptime.uptime_percent.toFixed(1)}%
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No state change events recorded yet.
        </p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-[#1e1e2e]"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  event.event_type === "online" ? "bg-green-500" : "bg-gray-500"
                }`}
              />
              <span className="text-sm text-gray-300 capitalize">
                {event.event_type === "online" ? "Came online" : "Went offline"}
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {timeAgo(event.occurred_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Device Ports Tab ───────────────────────────────────

function DevicePortsTab({ deviceId }: { deviceId: string }) {
  const [scanResult, setScanResult] = useState<PortScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load cached scan result on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchPortScan(deviceId);
        if (!cancelled) setScanResult(result);
      } catch {
        // 404 means no scan yet — that's fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [deviceId]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const result = await triggerPortScan(deviceId);
      setScanResult(result);
    } catch (err) {
      if (err instanceof Error) {
        // Try to parse the error body for a friendly message
        const match = err.message.match(/API error (\d+)/);
        if (match) {
          const code = parseInt(match[1]);
          if (code === 429) {
            setError("Rate limited — wait 60s between scans.");
          } else if (code === 503) {
            setError("VyOS not configured. Set it up in Settings.");
          } else if (code === 502) {
            setError("Scan failed — VyOS unreachable or nmap error.");
          } else {
            setError(err.message);
          }
        } else {
          setError(err.message);
        }
      } else {
        setError("Scan failed");
      }
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="secondary"
        size="sm"
        className="w-full gap-2"
        disabled={scanning}
        onClick={handleScan}
      >
        {scanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Radar className="h-4 w-4" />
        )}
        {scanning ? "Scanning…" : "Scan Ports"}
      </Button>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {scanResult && (
        <>
          <p className="text-xs text-gray-500">
            Last scanned: {timeAgo(scanResult.scanned_at)}
          </p>

          {scanResult.ports.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No open ports found.
            </p>
          ) : (
            <div className="rounded-md border border-[#2a2a3a] bg-[#1e1e2e]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#2a2a3a] hover:bg-transparent">
                    <TableHead className="text-gray-400">Port</TableHead>
                    <TableHead className="text-gray-400">Proto</TableHead>
                    <TableHead className="text-gray-400">State</TableHead>
                    <TableHead className="text-gray-400">Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.ports.map((port) => (
                    <TableRow
                      key={`${port.port}/${port.protocol}`}
                      className="border-[#2a2a3a]"
                    >
                      <TableCell className="font-mono text-sm text-gray-300">
                        {port.port}
                      </TableCell>
                      <TableCell className="text-xs text-gray-400">
                        {port.protocol}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                          {port.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-300">
                        {port.service}
                        {port.version && (
                          <span className="ml-1 text-xs text-gray-500">{port.version}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {!scanResult && !error && (
        <p className="py-6 text-center text-sm text-gray-500">
          No port scan results yet. Click &quot;Scan Ports&quot; to start.
        </p>
      )}
    </div>
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
