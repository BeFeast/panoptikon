"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Battery, Box, ChevronDown, CircuitBoard, Container, Cpu, Download, ExternalLink, Gamepad2, HardDrive, HelpCircle, Laptop, Loader2, LayoutGrid, List, MemoryStick, Monitor, Network, Pencil, Pin, PinOff, Plus, Power, Printer, Radar, RotateCcw, Router, Search, Server, Smartphone, Tablet, Tv, VolumeX, Wifi, WifiOff } from "lucide-react";
import { getDeviceIcon } from "@/lib/device-icons";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchDevices, fetchDeviceEvents, fetchDeviceUptime, wakeDevice, triggerPortScan, fetchPortScan, updateDevice, resetDeviceCustom, fetchDeviceSysinfo, createAsset, fetchXiaomiWifiDevices, fetchXiaomiDevices, fetchXiaomiStatus, identifyDevices, resolveDevices, triggerNetworkScan } from "@/lib/api";
import type { DeviceEvent, UptimeStats, PortScanResult, DeviceCustomFields, CreateAssetRequest } from "@/lib/api";
import type { Device, DeviceSysinfo, DeviceWifiInfo, XiaomiWifiDevice, XiaomiDevice } from "@/lib/types";
import { formatPercent, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { getOsDisplay } from "@/lib/os-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StaggerContainer, StaggerItem } from "@/components/MotionStagger";
import { MotionCard } from "@/components/MotionCard";
import { DeviceTrafficChart } from "@/components/DeviceTrafficChart";
import { StatusSparkline } from "@/components/StatusSparkline";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

import { downloadExport } from "@/lib/export";

type Filter = "all" | "online" | "offline" | "unknown";
type ViewMode = "grid" | "table";
type SortField = "last_seen_at" | "ip" | "hostname";
type SortDir = "asc" | "desc";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [scanningNetwork, setScanningNetwork] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("devices-view-preference") as ViewMode) || "table";
    }
    return "table";
  });
  const [sortField, setSortField] = useState<SortField>("last_seen_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [wifiMap, setWifiMap] = useState<Record<string, DeviceWifiInfo>>({});
  const selectedUrlParamConsumed = useRef(false);

  const selectDeviceFromUrl = useCallback((loadedDevices: Device[]) => {
    if (selectedUrlParamConsumed.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get("selected") ?? params.get("id");
    if (!selectedId) return;
    const match = loadedDevices.find((d) => d.id === selectedId);
    if (match) {
      setSelectedDevice(match);
      selectedUrlParamConsumed.current = true;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const loadedDevices = await fetchDevices();
      setDevices(loadedDevices);
      selectDeviceFromUrl(loadedDevices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    }
  }, [selectDeviceFromUrl]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (devices?.length) selectDeviceFromUrl(devices);
  }, [devices, selectDeviceFromUrl]);

  // Fetch Xiaomi WiFi data for device list columns
  useEffect(() => {
    const loadWifi = async () => {
      try {
        // Check if Xiaomi is configured first
        const status = await fetchXiaomiStatus();
        if (!status.configured) return;

        // Fetch both APIs in parallel and merge client-side
        const [wifiDevices, allDevices] = await Promise.all([
          fetchXiaomiWifiDevices(),
          fetchXiaomiDevices(),
        ]);

        // Build device lookup by MAC for speed/online/parent info
        const deviceByMac: Record<string, XiaomiDevice> = {};
        for (const d of allDevices) {
          if (d.mac) deviceByMac[d.mac.toUpperCase()] = d;
        }

        const map: Record<string, DeviceWifiInfo> = {};

        // Merge WiFi signal data with device data
        for (const w of wifiDevices) {
          if (!w.mac) continue;
          const mac = w.mac.toUpperCase();
          const dev = deviceByMac[mac];
          map[mac] = {
            mac,
            signal_dbm: w.signal ?? null,
            band: w.band ?? null,
            connection_type: "wifi",
            mesh_node: dev?.parent_id ?? null,
            router_name: dev?.name ?? w.name ?? null,
            upload_bps: dev?.upload_speed ? parseFloat(dev.upload_speed) : null,
            download_bps: dev?.download_speed ? parseFloat(dev.download_speed) : null,
            is_online: dev?.online ?? true,
          };
        }

        // Add wired devices (in device list but not in wifi list)
        for (const d of allDevices) {
          if (!d.mac) continue;
          const mac = d.mac.toUpperCase();
          if (!map[mac]) {
            map[mac] = {
              mac,
              signal_dbm: null,
              band: null,
              connection_type: "wired",
              mesh_node: d.parent_id ?? null,
              router_name: d.name ?? null,
              upload_bps: d.upload_speed ? parseFloat(d.upload_speed) : null,
              download_bps: d.download_speed ? parseFloat(d.download_speed) : null,
              is_online: d.online,
            };
          }
        }

        setWifiMap(map);
      } catch {
        // WiFi data is optional — silently ignore
      }
    };
    loadWifi();
    const interval = setInterval(loadWifi, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Keep a ref to current devices so WS handler can look up names without stale closure
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // Refetch immediately when a device or agent state change arrives via WebSocket
  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_online", "agent_offline"],
    (msg) => {
      if (["device_online", "device_offline", "new_device"].includes(msg.event)) {
        const d = msg.data as { device_id?: string; mac?: string; ip?: string };
        const dev = devicesRef.current?.find((x) => x.id === d.device_id);
        const label = dev?.name || dev?.hostname || d.mac || "Unknown device";

        if (msg.event === "device_online") {
          toast.success(`${label} came online`, { description: d.ip });
        } else if (msg.event === "device_offline") {
          toast.error(`${label} went offline`);
        } else if (msg.event === "new_device") {
          toast.info(`New device discovered: ${d.mac}`, { description: d.ip });
        }
      }
      load();
    }
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
          (d.custom_name ?? "").toLowerCase().includes(q) ||
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
    return <ErrorState message={error} onRetry={load} />;
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
    <PageTransition>
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white">Devices</h1>
              <HelpTooltip text="All devices discovered on your network. Use Scan Now to discover new devices, Re-identify to fingerprint them, and Resolve Names to look up hostnames via DNS." />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {counts && (
                <>
                  <span><span className="font-mono text-slate-300">{counts.all}</span> total</span>
                  <span><span className="font-mono text-emerald-300">{counts.online}</span> online</span>
                  <span><span className="font-mono text-slate-300">{counts.offline}</span> offline</span>
                  <span><span className="font-mono text-amber-300">{counts.unknown}</span> new</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border border-blue-500/40 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25 hover:text-white"
                  onClick={() => setAddAssetOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Asset
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Manually register a device or service as a tracked asset
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border border-slate-700/75 bg-slate-800/60 text-slate-200 hover:bg-slate-800/90 hover:text-white"
                  disabled={identifying}
                  onClick={async () => {
                    setIdentifying(true);
                    try {
                      const result = await identifyDevices();
                      toast.success(`Checked ${result.devices_checked} devices`);
                      await load();
                    } catch {
                      toast.error("Device identification failed");
                    } finally {
                      setIdentifying(false);
                    }
                  }}
                >
                  {identifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Identifying…
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Re-identify
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Re-run device fingerprinting to detect device type, manufacturer, and OS
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 hover:text-white"
                  disabled={scanningNetwork}
                  onClick={async () => {
                    setScanningNetwork(true);
                    try {
                      const summary = await triggerNetworkScan();
                      const parts: string[] = [];
                      if (summary.new_devices > 0) parts.push(`${summary.new_devices} new`);
                      if (summary.updated_devices > 0) parts.push(`${summary.updated_devices} updated`);
                      if (summary.offline_devices > 0) parts.push(`${summary.offline_devices} offline`);
                      const desc = parts.length > 0 ? parts.join(", ") : "No changes";
                      toast.success("Network scan complete", { description: `${summary.total_scanned} scanned — ${desc}` });
                      await load();
                    } catch {
                      toast.error("Network scan failed");
                    } finally {
                      setScanningNetwork(false);
                    }
                  }}
                >
                  {scanningNetwork ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <Radar className="mr-2 h-4 w-4" />
                      Scan Now
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Trigger an immediate network scan to discover new devices
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="border border-slate-700/75 bg-slate-800/60 text-slate-200 hover:bg-slate-800/90 hover:text-white"
                  disabled={resolving}
                  onClick={async () => {
                    setResolving(true);
                    try {
                      const result = await resolveDevices();
                      if (result.resolved > 0) {
                        toast.success(`Resolved ${result.resolved} device${result.resolved === 1 ? "" : "s"}`);
                        await load();
                      } else {
                        toast.info("No new hostnames found");
                      }
                    } catch {
                      toast.error("Device resolution failed");
                    } finally {
                      setResolving(false);
                    }
                  }}
                >
                  {resolving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resolving…
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Resolve Names
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Look up hostnames via reverse DNS for all discovered devices
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "online", "offline", "unknown"] as Filter[]).map((f) => (
              <Button
                key={f}
                variant="secondary"
                size="sm"
                onClick={() => setFilter(f)}
                className={`h-8 rounded-full border px-3 text-xs ${
                  filter === f
                    ? "border-slate-600 bg-slate-700/90 text-white hover:bg-slate-700"
                    : "border-slate-700/70 bg-slate-800/55 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                {f === "all" && "All"}
                {f === "online" && "Online"}
                {f === "offline" && "Offline"}
                {f === "unknown" && "Unknown"}
                {counts && (
                  <span className="ml-1.5 rounded-full bg-slate-900/55 px-1.5 py-0.5 text-[10px] leading-none opacity-80">
                    {counts[f]}
                  </span>
                )}
              </Button>
            ))}
          </div>

          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative w-full sm:min-w-[20rem] lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search name, IP, MAC, vendor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 border-slate-700 bg-slate-900 pl-9 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:ring-slate-500"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-9 gap-1.5 border border-slate-700/75 bg-slate-800/60 text-slate-200 hover:bg-slate-800/90 hover:text-white">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await downloadExport("/api/v1/devices/export?format=csv", "panoptikon-devices.csv");
                        toast.success("Devices exported as CSV");
                      } catch { toast.error("Export failed"); }
                    }}
                  >
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        await downloadExport("/api/v1/devices/export?format=json", "panoptikon-devices.json");
                        toast.success("Devices exported as JSON");
                      } catch { toast.error("Export failed"); }
                    }}
                  >
                    Export JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View toggle */}
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="secondary"
                  size="icon"
                  className={`h-9 w-9 border ${
                    view === "grid"
                      ? "border-slate-600 bg-slate-700/90 text-white hover:bg-slate-700"
                      : "border-slate-700/70 bg-slate-800/55 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                  onClick={() => toggleView("grid")}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className={`h-9 w-9 border ${
                    view === "table"
                      ? "border-slate-600 bg-slate-700/90 text-white hover:bg-slate-700"
                      : "border-slate-700/70 bg-slate-800/55 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                  onClick={() => toggleView("table")}
                  title="Table view"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="mx-1 h-6 self-center bg-slate-700/50" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/topology">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 border border-slate-700/70 bg-slate-800/55 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                        title="Network topology"
                      >
                        <Network className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="border-slate-700 bg-slate-800 text-slate-200">
                    View network topology map
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Device list */}
      {sorted === null ? (
        view === "grid" ? (
        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-full min-h-[15.5rem] border-slate-700/50 bg-slate-900/55">
              <CardContent className="flex h-full flex-col p-5">
                {/* Header row — icon + name + badges */}
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <div className="flex min-h-6 items-center gap-2">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-5 w-[55%]" />
                    </div>
                    <Skeleton className="mt-1.5 h-3.5 w-[35%]" />
                  </div>
                  <div className="flex min-h-6 min-w-[3.5rem] flex-col items-end gap-1">
                    <Skeleton className="h-4 w-10 rounded" />
                  </div>
                </div>
                {/* Divider */}
                <div className="my-4 border-t border-slate-800/80" />
                {/* IP + MAC */}
                <div className="space-y-2">
                  <div className="flex min-h-5 items-center gap-2">
                    <Skeleton className="h-2 w-7" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="flex min-h-5 items-center gap-2">
                    <Skeleton className="h-2 w-7" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                {/* Footer */}
                <div className="mt-auto pt-4">
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        ) : (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/55 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.95)]">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="w-10 text-slate-400">Type</TableHead>
                <TableHead className="w-12 text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400">IP Address</TableHead>
                <TableHead className="text-slate-400">Hostname</TableHead>
                <TableHead className="text-slate-400">MAC</TableHead>
                <TableHead className="text-slate-400">Vendor</TableHead>
                <TableHead className="text-slate-400">Agent</TableHead>
                <TableHead className="text-slate-400">Last Seen</TableHead>
                <TableHead className="w-16 text-slate-400" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
                  <TableCell><Skeleton className="h-8 w-8 rounded-lg" /></TableCell>
                  <TableCell><Skeleton className="h-2.5 w-2.5 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-16" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )
      ) : sorted.length === 0 ? (
        filter === "all" && !search.trim() ? (
          <EmptyState
            icon={Monitor}
            title="No devices found"
            description="Run a network scan to discover devices on your network. Make sure your router is configured in Settings."
            actionLabel="Scan Network"
            onAction={async () => {
              setScanningNetwork(true);
              try {
                const summary = await triggerNetworkScan();
                const parts: string[] = [];
                if (summary.new_devices > 0) parts.push(`${summary.new_devices} new`);
                if (summary.updated_devices > 0) parts.push(`${summary.updated_devices} updated`);
                if (summary.offline_devices > 0) parts.push(`${summary.offline_devices} offline`);
                const desc = parts.length > 0 ? parts.join(", ") : "No changes";
                toast.success("Network scan complete", { description: `${summary.total_scanned} scanned — ${desc}` });
                await load();
              } catch {
                toast.error("Network scan failed");
              } finally {
                setScanningNetwork(false);
              }
            }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No devices match your filters"
            description="Try adjusting your search or filter criteria."
          />
        )
      ) : view === "grid" ? (
        <StaggerContainer className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((device) => (
            <StaggerItem key={device.id}>
              <MotionCard className="h-full">
                <DeviceCard
                  device={device}
                  onClick={() => setSelectedDevice(device)}
                />
              </MotionCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <DevicesTable
          devices={sorted}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={setSelectedDevice}
          wifiMap={wifiMap}
        />
      )}

      {/* Add Asset dialog */}
      <AddAssetDialog
        open={addAssetOpen}
        onOpenChange={setAddAssetOpen}
        onCreated={load}
      />

      {/* Slide-in detail panel */}
      <Sheet
        open={selectedDevice !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDevice(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-hidden border-slate-800 bg-slate-950 sm:max-w-md"
        >
          {selectedDevice && <DeviceDetail device={selectedDevice} onUpdate={load} />}
        </SheetContent>
      </Sheet>
    </div>
    </PageTransition>
  );
}

// ─── Device Card ────────────────────────────────────────

function getDevicePrimaryTitle(device: Device): { title: string; isUnnamed: boolean } {
  const customName = device.custom_name?.trim();
  const hostname = device.hostname?.trim();
  const discoveredName = device.name?.trim();

  if (customName) return { title: customName, isUnnamed: false };
  if (hostname) return { title: hostname, isUnnamed: false };
  if (discoveredName) return { title: discoveredName, isUnnamed: false };

  // Use IP as primary title for unnamed devices — more informative than "Unknown Device"
  const primaryIp = (device.ips ?? [])[0];
  if (primaryIp) return { title: primaryIp, isUnnamed: true };

  return { title: "Unknown Device", isUnnamed: true };
}

function DeviceCard({
  device,
  onClick,
}: {
  device: Device;
  onClick: () => void;
}) {
  const [waking, setWaking] = useState(false);
  const ips = device.ips ?? [];
  const primaryIp = ips[0] ?? "—";
  const { title: displayName, isUnnamed } = getDevicePrimaryTitle(device);
  const effectiveType = device.custom_type ?? device.device_type;
  const { icon: DevIcon } = getDeviceIcon(device.custom_vendor ?? device.vendor, device.hostname, device.mdns_services, effectiveType);
  const vendorDisplay = device.custom_vendor ?? device.vendor ?? null;
  const canWake = !device.is_online && device.mac && !device.is_randomized_mac;
  // Only show metrics bars when agent is actively connected AND has real data
  const hasAgentMetrics =
    device.agent != null &&
    device.agent.is_online === true &&
    (device.agent.cpu_percent != null || device.agent.memory_percent != null);

  const handleWake = async (e: React.MouseEvent) => {
    e.stopPropagation();
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

  const osDisplay = device.custom_os ?? device.os_family;
  const modelDisplay = device.custom_model ?? device.device_model;
  const os = osDisplay ? getOsDisplay(osDisplay) : null;

  return (
    <Card
      data-device-row
      className="h-full min-h-[15.5rem] cursor-pointer border-slate-700/50 bg-slate-900/55 transition-[border-color,background-color,box-shadow] hover:border-slate-600/70 hover:bg-slate-900/72 hover:shadow-[0_14px_32px_-22px_rgba(15,23,42,0.95)]"
      onClick={onClick}
    >
      <CardContent className="flex h-full flex-col p-5">
        {/* ── Header: icon + identity + status badges ── */}
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              device.is_online
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-slate-700/80 bg-slate-800/85"
            }`}
          >
            <DevIcon
              className={`h-5 w-5 ${device.is_online ? "text-emerald-300" : "text-slate-500"}`}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  device.is_online ? "bg-emerald-400/90" : "bg-slate-600"
                }`}
              />
              <span
                className={`min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight ${
                  isUnnamed ? "text-slate-300" : "text-white"
                }`}
                title={displayName}
              >
                {displayName}
              </span>
              {device.is_critical && <Pin className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
            </div>

            <p className="truncate text-xs text-slate-500" title={vendorDisplay ?? undefined}>
              {vendorDisplay ?? "Unknown vendor"}
            </p>

            {(os || modelDisplay) && (
              <div className="flex min-h-[1.25rem] flex-wrap items-center gap-1.5 pt-0.5">
                {os && (
                  <Badge variant="outline" className={`text-[10px] ${os.colorClass}`}>
                    {os.label}
                    {device.os_version ? ` ${device.os_version}` : ""}
                  </Badge>
                )}
                {modelDisplay && (
                  <span className="truncate text-[10px] text-slate-500" title={modelDisplay}>
                    {modelDisplay}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge
              variant="outline"
              className={`border text-[10px] ${
                device.is_online
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700/80 bg-slate-800/70 text-slate-400"
              }`}
            >
              {device.is_online ? "Online" : "Offline"}
            </Badge>
            {device.agent?.is_online && (
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-300">
                Agent
              </Badge>
            )}
            {!device.is_known && (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                New
              </Badge>
            )}
          </div>
        </div>

        {/* ── Core network metadata ── */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-800/75 bg-slate-900/55 p-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">IP</p>
            <p className="mt-1 truncate font-mono text-[13px] tabular-nums text-slate-200" title={primaryIp}>
              {primaryIp}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">MAC</p>
            <p className="mt-1 truncate font-mono text-xs tabular-nums text-slate-500" title={device.mac ?? undefined}>
              {device.mac ?? "—"}
            </p>
          </div>
        </div>

        {/* ── Agent metrics ── */}
        {hasAgentMetrics && (
          <div className="mt-4 space-y-2.5 rounded-xl border border-slate-800/70 bg-slate-900/45 p-3">
            {device.agent!.cpu_percent != null && (
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">CPU</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800/90">
                  <div
                    className="h-full rounded-full bg-sky-500/65 transition-all"
                    style={{ width: `${Math.min(device.agent!.cpu_percent, 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">
                  {formatPercent(device.agent!.cpu_percent)}
                </span>
              </div>
            )}
            {device.agent!.memory_percent != null && (
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">RAM</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800/90">
                  <div
                    className="h-full rounded-full bg-violet-500/65 transition-all"
                    style={{ width: `${Math.min(device.agent!.memory_percent, 100)}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">
                  {formatPercent(device.agent!.memory_percent)}
                </span>
              </div>
            )}
          </div>
        )}

        {device.status_timeline && device.status_timeline.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-800/70 bg-slate-900/45 px-3 py-2">
            <StatusSparkline timeline={device.status_timeline} width={170} height={10} />
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-800/80 pt-4">
          <p className={`text-[11px] ${device.is_online ? "text-emerald-300/80" : "text-slate-500"}`}>
            {device.is_online ? "Online now" : `Last seen ${timeAgo(device.last_seen_at)}`}
          </p>
          {canWake && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11px] text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              disabled={waking}
              onClick={handleWake}
            >
              <Power className="h-3 w-3" />
              {waking ? "Sending…" : "Wake"}
            </Button>
          )}
        </div>
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
  wifiMap,
}: {
  devices: Device[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onSelect: (device: Device) => void;
  wifiMap: Record<string, DeviceWifiInfo>;
}) {
  const hasWifi = Object.keys(wifiMap).length > 0;
  const [wakingId, setWakingId] = useState<string | null>(null);

  const handleWake = async (e: React.MouseEvent, device: Device) => {
    e.stopPropagation();
    setWakingId(device.id);
    try {
      await wakeDevice(device.id);
      toast.success("Magic packet sent! Device should wake up shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send magic packet");
    } finally {
      setWakingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/55 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.95)]">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="w-10 text-slate-400">Type</TableHead>
            <TableHead className="w-12 text-slate-400">Status</TableHead>
            <TableHead
              className="cursor-pointer select-none text-slate-400 hover:text-white"
              onClick={() => onSort("ip")}
            >
              IP Address
              <SortIcon field="ip" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead
              className="cursor-pointer select-none text-slate-400 hover:text-white"
              onClick={() => onSort("hostname")}
            >
              Hostname
              <SortIcon field="hostname" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead className="text-slate-400">MAC</TableHead>
            <TableHead className="text-slate-400">Vendor</TableHead>
            <TableHead className="text-slate-400">Agent</TableHead>
            {hasWifi && (
              <>
                <TableHead className="text-slate-400">Signal</TableHead>
                <TableHead className="text-slate-400">Band</TableHead>
                <TableHead className="text-slate-400">Mesh Node</TableHead>
              </>
            )}
            <TableHead className="text-slate-400">24h Status</TableHead>
            <TableHead
              className="cursor-pointer select-none text-slate-400 hover:text-white"
              onClick={() => onSort("last_seen_at")}
            >
              Last Seen
              <SortIcon field="last_seen_at" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead className="w-16 text-slate-400" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device, index) => {
            const primaryIp = (device.ips ?? [])[0] ?? "—";
            const { icon: RowIcon } = getDeviceIcon(device.vendor, device.hostname, device.mdns_services, device.device_type);
            const vendorDisplay = device.vendor ?? "—";
            const canWake = !device.is_online && device.mac && !device.is_randomized_mac;
            return (
              <motion.tr
                key={device.id}
                data-device-row
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.18,
                  ease: "easeOut",
                  delay: Math.min(index * 0.01, 0.12),
                }}
                className="cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-800/60 data-[state=selected]:bg-muted"
                onClick={() => onSelect(device)}
              >
                <TableCell>
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800"
                  >
                    <RowIcon
                      className={`h-4 w-4 ${
                        device.is_online ? "text-emerald-300" : "text-slate-500"
                      }`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      device.is_online
                        ? "bg-emerald-400/90"
                        : "bg-slate-500"
                    }`}
                  />
                </TableCell>
                <TableCell className="tabular-nums font-mono text-sm text-slate-300">
                  {primaryIp}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm text-slate-300">
                      {device.hostname ?? "—"}
                    </span>
                    {device.agent?.is_online && (
                      <span className="shrink-0 rounded border border-slate-700/80 bg-slate-800/80 px-1.5 py-0.5 text-xs text-slate-300">
                        Agent
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums font-mono text-xs text-slate-500">
                  {device.mac}
                </TableCell>
                <TableCell className="max-w-[160px] text-xs text-slate-400">
                  <span className="block truncate" title={vendorDisplay}>{vendorDisplay}</span>
                </TableCell>
                <TableCell className="text-xs text-slate-400">
                  {device.agent && device.agent.cpu_percent != null && device.agent.memory_percent != null
                    ? `${formatPercent(device.agent.cpu_percent)} / ${formatPercent(device.agent.memory_percent)}`
                    : "—"}
                </TableCell>
                {hasWifi && (() => {
                  const wifi = wifiMap[device.mac?.toUpperCase()];
                  return (
                    <>
                      <TableCell className="text-xs">
                        {wifi?.signal_dbm != null ? (
                          <span className={
                            wifi.signal_dbm > -50 ? "text-emerald-400" :
                            wifi.signal_dbm > -70 ? "text-yellow-400" :
                            "text-rose-400"
                          }>
                            {wifi.signal_dbm} dBm
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {wifi?.band ? (
                          <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-400">
                            {wifi.band}
                          </Badge>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {wifi?.mesh_node ?? "—"}
                      </TableCell>
                    </>
                  );
                })()}
                <TableCell>
                  {device.status_timeline && device.status_timeline.length > 0 ? (
                    <StatusSparkline timeline={device.status_timeline} width={72} height={10} />
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {timeAgo(device.last_seen_at)}
                </TableCell>
                <TableCell>
                  {canWake && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-slate-400 hover:text-white"
                      disabled={wakingId === device.id}
                      onClick={(e) => handleWake(e, device)}
                      title="Send Wake-on-LAN magic packet"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {wakingId === device.id ? "Sending…" : "Wake"}
                    </Button>
                  )}
                </TableCell>
              </motion.tr>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Device Detail (Sheet) ──────────────────────────────

function DeviceDetail({ device, onUpdate }: { device: Device; onUpdate: () => void }) {
  const ips = device.ips ?? [];
  const primaryIp = ips[0] ?? "—";
  const { title: displayName, isUnnamed } = getDevicePrimaryTitle(device);
  const [waking, setWaking] = useState(false);
  const [sysinfo, setSysinfo] = useState<DeviceSysinfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeviceSysinfo(device.id).then((data) => {
      if (!cancelled) setSysinfo(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [device.id]);
  const effectiveType = device.custom_type ?? device.device_type;
  const { icon: DetailIcon, label: deviceTypeLabel } = getDeviceIcon(
    device.custom_vendor ?? device.vendor,
    device.hostname,
    device.mdns_services,
    effectiveType
  );
  const vendorDisplay = device.custom_vendor ?? device.vendor ?? null;

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
      <SheetHeader className="shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 ${
              device.is_online ? "ring-1 ring-emerald-500/20" : ""
            }`}
          >
            <DetailIcon
              className={`h-5 w-5 ${
                device.is_online ? "text-emerald-400" : "text-slate-500"
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-white">{displayName}</SheetTitle>
              {isUnnamed && (
                <Badge variant="outline" className="border-slate-600 text-[10px] text-slate-400">Unknown</Badge>
              )}
              {device.custom_name && (
                <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 text-[10px]">custom</Badge>
              )}
              {device.agent?.is_online && (
                <span className="shrink-0 rounded border border-blue-500/30 bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">
                  Agent
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {device.custom_name && device.hostname && (
                <span className="truncate text-xs text-slate-500" title={device.hostname}>{device.hostname}</span>
              )}
              {vendorDisplay && (
                <span className="truncate text-xs text-slate-400" title={vendorDisplay}>{vendorDisplay}</span>
              )}
              <span className="shrink-0 text-xs text-slate-500">{deviceTypeLabel}</span>
            </div>
          </div>
        </div>
        <SheetDescription>
          {device.is_online ? (
            <span className="text-emerald-400">Online</span>
          ) : (
            <span className="text-slate-500">
              Offline — last seen {timeAgo(device.last_seen_at)}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
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
          <p className="text-center text-[11px] text-slate-600">
            Requires Wake-on-LAN enabled in BIOS
          </p>
        </div>
      )}

      {/* Critical/Pinned toggle + Asset Detail link */}
      <div className="mt-3 flex gap-2">
        <Button
          variant={device.is_critical ? "default" : "outline"}
          size="sm"
          className={`gap-2 ${
            device.is_critical
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "border-slate-700 text-slate-300 hover:text-white"
          }`}
          onClick={async () => {
            try {
              await updateDevice(device.id, { is_critical: !device.is_critical });
              toast.success(device.is_critical ? "Removed from critical devices" : "Marked as critical for health tracking");
              onUpdate();
            } catch {
              toast.error("Failed to update critical status");
            }
          }}
        >
          {device.is_critical ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {device.is_critical ? "Unpin" : "Pin Critical"}
        </Button>
        <Link href={`/assets?id=${device.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-2 border-slate-700 text-slate-300 hover:text-white">
            <ExternalLink className="h-4 w-4" />
            Asset Detail
          </Button>
        </Link>
      </div>

      <Separator className="my-4 bg-slate-800" />

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-4 w-full bg-slate-800">
          <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
          <TabsTrigger value="edit" className="flex-1">Edit</TabsTrigger>
          <TabsTrigger value="system" className="flex-1">System</TabsTrigger>
          <TabsTrigger value="ports" className="flex-1">Ports</TabsTrigger>
          <TabsTrigger value="events" className="flex-1">Events</TabsTrigger>
          <TabsTrigger value="traffic" className="flex-1">Traffic</TabsTrigger>
          <TabsTrigger value="wifi" className="flex-1">WiFi</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <DeviceInfoTab device={device} ips={ips} primaryIp={primaryIp} sysinfo={sysinfo} />
        </TabsContent>

        <TabsContent value="edit">
          <DeviceEditForm device={device} onUpdate={onUpdate} />
        </TabsContent>

        <TabsContent value="system">
          <DeviceSystemTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="ports">
          <DevicePortsTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="events">
          <DeviceEventsTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="traffic">
          <DeviceTrafficChart deviceId={device.id} />
        </TabsContent>

        <TabsContent value="wifi">
          <DeviceWifiTab mac={device.mac} />
        </TabsContent>
      </Tabs>
      </div>
    </>
  );
}

// ─── Device Info Tab ────────────────────────────────────

function CustomBadge() {
  return (
    <Badge variant="outline" className="ml-1 border-cyan-500/50 text-cyan-400 text-[9px] px-1 py-0">
      custom
    </Badge>
  );
}

function DetectedBadge() {
  return (
    <Badge variant="outline" className="ml-1 border-teal-500/50 text-teal-400 text-[9px] px-1 py-0">
      detected
    </Badge>
  );
}

function DeviceInfoTab({
  device,
  ips,
  primaryIp,
  sysinfo,
}: {
  device: Device;
  ips: string[];
  primaryIp: string;
  sysinfo: DeviceSysinfo | null;
}) {
  const effectiveOs = device.custom_os ?? device.os_family;
  const effectiveType = device.custom_type ?? device.device_type;
  const effectiveVendor = device.custom_vendor ?? device.device_brand;
  const effectiveModel = device.custom_model ?? device.device_model;

  // Build the most specific OS display string available.
  // Prefer sysinfo os_name (e.g. "Ubuntu 24.04") over broad os_family ("Linux").
  const osDisplayString = (() => {
    if (device.custom_os) {
      return device.os_version ? `${device.custom_os} ${device.os_version}` : device.custom_os;
    }
    // Sysinfo os_name has the distribution detail (e.g., "Ubuntu 24.04", "Debian 12")
    if (sysinfo?.os_name) {
      const parts = [sysinfo.os_name, sysinfo.os_version].filter(Boolean);
      return parts.join(" ");
    }
    if (effectiveOs) {
      return device.os_version ? `${effectiveOs} ${device.os_version}` : effectiveOs;
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <InfoRow label="IP Address" value={primaryIp} mono />
      <div className="flex items-baseline justify-between gap-4">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
          MAC Address
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono tabular-nums text-sm text-slate-300">
          <span className="truncate">{device.mac}</span>
          {device.is_randomized_mac && (
            <span className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-medium text-amber-400">
              Random
            </span>
          )}
        </span>
      </div>
      {device.vendor && <InfoRow label="Vendor" value={device.vendor} />}
      {device.hostname && <InfoRow label="Hostname" value={device.hostname} />}
      <InfoRow label="First Seen" value={timeAgo(device.first_seen_at)} />
      <InfoRow label="Last Seen" value={timeAgo(device.last_seen_at)} />
      <InfoRow label="Status" value={device.is_known ? "Known" : "Unacknowledged"} />
      <InfoRow label="Health Role" value={device.is_critical === true ? "Pinned (critical)" : device.is_critical === false ? "Excluded" : "Auto-detect"} />

      {/* Device identity — merged auto-detected + custom */}
      {(osDisplayString || effectiveType || effectiveVendor || effectiveModel) && (
        <>
          <Separator className="bg-slate-800" />
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Device Identity
          </p>
          {osDisplayString && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">OS</span>
              <span className="flex min-w-0 items-center gap-1 text-sm text-slate-300">
                <span className="truncate" title={osDisplayString}>{osDisplayString}</span>
                {device.custom_os ? <CustomBadge /> : (device.os_family || sysinfo?.os_name) ? <DetectedBadge /> : null}
              </span>
            </div>
          )}
          {effectiveType && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">Type</span>
              <span className="flex min-w-0 items-center gap-1 text-sm text-slate-300">
                <span className="truncate" title={effectiveType}>{effectiveType}</span>
                {device.custom_type ? <CustomBadge /> : device.device_type ? <DetectedBadge /> : null}
              </span>
            </div>
          )}
          {effectiveVendor && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">Brand</span>
              <span className="flex min-w-0 items-center gap-1 text-sm text-slate-300">
                <span className="truncate" title={effectiveVendor}>{effectiveVendor}</span>
                {device.custom_vendor ? <CustomBadge /> : (device.device_brand || device.vendor) ? <DetectedBadge /> : null}
              </span>
            </div>
          )}
          {effectiveModel && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">Model</span>
              <span className="flex min-w-0 items-center gap-1 text-sm text-slate-300">
                <span className="truncate" title={effectiveModel}>{effectiveModel}</span>
                {device.custom_model ? <CustomBadge /> : device.device_model ? <DetectedBadge /> : null}
              </span>
            </div>
          )}
          {device.enrichment_source && !device.custom_os && !device.custom_type && (
            <p className="text-[10px] text-slate-600">
              Identified via {device.enrichment_source}
              {device.enrichment_corrected ? " (user-corrected)" : ""}
            </p>
          )}
        </>
      )}

      {/* Muted status */}
      {device.muted_until && new Date(device.muted_until) > new Date() && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <VolumeX className="h-4 w-4 text-amber-400" />
          <span className="text-sm text-amber-400">
            Muted until {new Date(device.muted_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {/* All IPs */}
      {ips.length > 1 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            All IP Addresses
          </p>
          <div className="mt-1 space-y-0.5">
            {ips.map((ip) => (
              <p key={ip} className="tabular-nums font-mono text-sm text-slate-300">
                {ip}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* mDNS Services */}
      {device.mdns_services && (
        <>
          <Separator className="bg-slate-800" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
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
          <Separator className="bg-slate-800" />
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Agent Telemetry
          </p>
          <div className="flex items-center gap-2">
            {device.agent.is_online ? (
              <Wifi className="h-4 w-4 text-emerald-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-rose-400" />
            )}
            <span className="text-sm text-slate-300">
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

      {/* Asset Inventory */}
      {(device.location || device.owner || device.tags || device.cpu_manual ||
        device.ram_manual || device.disk_manual || device.serial_number ||
        device.purchase_date || device.warranty_expiry) && (
        <>
          <Separator className="bg-slate-800" />
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Asset Inventory
          </p>
          {device.location && <InfoRow label="Location" value={device.location} />}
          {device.owner && <InfoRow label="Owner" value={device.owner} />}
          {device.tags && (
            <div className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">Tags</span>
              <div className="flex flex-wrap justify-end gap-1">
                {device.tags.split(",").map((tag) => (
                  <Badge key={tag.trim()} variant="outline" className="border-slate-600 text-slate-400 text-[10px]">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {device.cpu_manual && <InfoRow label="CPU" value={device.cpu_manual} />}
          {device.ram_manual && <InfoRow label="RAM" value={device.ram_manual} />}
          {device.disk_manual && <InfoRow label="Disk" value={device.disk_manual} />}
          {device.serial_number && <InfoRow label="Serial" value={device.serial_number} />}
          {device.purchase_date && <InfoRow label="Purchased" value={device.purchase_date} />}
          {device.warranty_expiry && <InfoRow label="Warranty" value={device.warranty_expiry} />}
        </>
      )}

      {/* Notes */}
      {device.notes && (
        <>
          <Separator className="bg-slate-800" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Notes
            </p>
            <p className="mt-1 text-sm text-slate-300">{device.notes}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Device System Tab (neofetch-style) ─────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function DeviceSystemTab({ deviceId }: { deviceId: string }) {
  const [sysinfo, setSysinfo] = useState<DeviceSysinfo | null | undefined>(undefined);
  const [showSerial, setShowSerial] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDeviceSysinfo(deviceId).then((data) => {
      if (!cancelled) setSysinfo(data);
    }).catch(() => {
      if (!cancelled) setSysinfo(null);
    });
    return () => { cancelled = true; };
  }, [deviceId]);

  if (sysinfo === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-full bg-slate-800" />
      </div>
    );
  }

  if (!sysinfo) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Cpu className="mb-2 h-8 w-8 text-slate-600" />
        <p className="text-sm text-slate-500">No system info available</p>
        <p className="mt-1 text-xs text-slate-600">
          Install an agent on this device to collect hardware inventory
        </p>
      </div>
    );
  }

  // Build neofetch-style rows
  const rows: [string, string][] = [];
  if (sysinfo.hostname) rows.push(["Host", sysinfo.hostname]);
  if (sysinfo.os_name) {
    const osStr = [sysinfo.os_name, sysinfo.os_version].filter(Boolean).join(" ");
    rows.push(["OS", osStr]);
  }
  if (sysinfo.os_build) rows.push(["Kernel", sysinfo.os_build]);
  if (sysinfo.hardware_model) rows.push(["Model", sysinfo.hardware_model]);
  if (sysinfo.cpu_name) {
    const cpuStr = sysinfo.cpu_cores
      ? `${sysinfo.cpu_name} (${sysinfo.cpu_cores} cores)`
      : sysinfo.cpu_name;
    rows.push(["CPU", cpuStr]);
  }
  if (sysinfo.cpu_speed) rows.push(["CPU Speed", sysinfo.cpu_speed]);
  if (sysinfo.ram_total) rows.push(["Memory", sysinfo.ram_total]);
  if (sysinfo.gpu_name) rows.push(["GPU", sysinfo.gpu_name]);
  if (sysinfo.disk_name || sysinfo.disk_size) {
    const diskStr = [sysinfo.disk_name, sysinfo.disk_size].filter(Boolean).join(" — ");
    rows.push(["Disk", diskStr]);
  }
  if (sysinfo.uptime_seconds != null) rows.push(["Uptime", formatUptime(sysinfo.uptime_seconds)]);

  const title = sysinfo.hostname ?? "device";

  return (
    <div className="space-y-4">
      {/* Neofetch-style terminal card */}
      <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 font-mono text-[13px]">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-slate-800 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
          <span className="ml-2 text-xs text-slate-500">{title}</span>
        </div>
        {/* Content */}
        <div className="p-4">
          <p className="text-cyan-400">
            {title}
            <span className="text-slate-500">@</span>
            <span className="text-cyan-400">panoptikon</span>
          </p>
          <p className="text-slate-700">{"─".repeat(Math.min(40, title.length + 12))}</p>
          {rows.map(([label, value]) => (
            <p key={label} className="leading-relaxed">
              <span className="text-cyan-400">{label}</span>
              <span className="text-slate-500">: </span>
              <span className="text-slate-300">{value}</span>
            </p>
          ))}
          {/* Color palette row */}
          <div className="mt-3 flex gap-0">
            {["bg-slate-900", "bg-red-500", "bg-green-500", "bg-yellow-500", "bg-blue-500", "bg-purple-500", "bg-cyan-500", "bg-slate-300"].map((c) => (
              <span key={c} className={`inline-block h-3 w-3 ${c}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Serial number — hidden by default */}
      {sysinfo.serial_number && (
        <div className="space-y-1">
          <button
            onClick={() => setShowSerial(!showSerial)}
            className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-400"
          >
            {showSerial ? "Hide" : "Show"} serial number
          </button>
          {showSerial && (
            <p className="font-mono text-sm text-slate-400">{sysinfo.serial_number}</p>
          )}
        </div>
      )}

      {/* Last reported */}
      <p className="text-[10px] text-slate-600">
        Last reported {timeAgo(sysinfo.reported_at)}
      </p>
    </div>
  );
}

// ─── Device State Timeline ──────────────────────────────

interface TimelineSegment {
  start: number;
  end: number;
  online: boolean;
}

function DeviceStateTimeline({ events }: { events: DeviceEvent[] }) {
  const rows = useMemo(() => {
    const now = new Date();

    // Build 7 calendar days (oldest first, today last)
    const dayBounds: { start: Date; end: Date }[] = [];
    for (let d = 6; d >= 0; d--) {
      const s = new Date(now);
      s.setDate(s.getDate() - d);
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      dayBounds.push({ start: s, end: d === 0 ? now : e });
    }

    const windowStart = dayBounds[0].start;

    // Sort events chronologically
    const sorted = [...events].sort(
      (a, b) =>
        new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );

    // Determine initial state at window start
    let initialOnline = false;
    for (const ev of sorted) {
      if (new Date(ev.occurred_at).getTime() <= windowStart.getTime()) {
        initialOnline = ev.event_type === "online";
      }
    }

    // Filter to events within window
    const windowEvents = sorted.filter((ev) => {
      const t = new Date(ev.occurred_at);
      return t > windowStart && t <= now;
    });

    // Build full-window segments
    const segments: TimelineSegment[] = [];
    let state = initialOnline;
    let segStart = windowStart.getTime();

    for (const ev of windowEvents) {
      const t = new Date(ev.occurred_at).getTime();
      if (t > segStart) {
        segments.push({ start: segStart, end: t, online: state });
      }
      state = ev.event_type === "online";
      segStart = t;
    }
    if (segStart < now.getTime()) {
      segments.push({ start: segStart, end: now.getTime(), online: state });
    }

    // Clip segments to each day
    return dayBounds.map(({ start, end }) => {
      const ds = start.getTime();
      const de = end.getTime();
      const dur = de - ds;

      const daySegs = segments
        .map((seg) => {
          const os = Math.max(seg.start, ds);
          const oe = Math.min(seg.end, de);
          if (os >= oe) return null;
          return {
            online: seg.online,
            pct: ((oe - os) / dur) * 100,
            from: new Date(os).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            to: new Date(oe).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        })
        .filter(Boolean) as {
        online: boolean;
        pct: number;
        from: string;
        to: string;
      }[];

      const isToday = now.toDateString() === start.toDateString();
      const label = isToday
        ? "Today"
        : start.toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

      return { label, segments: daySegs, isToday };
    });
  }, [events]);

  if (events.length === 0) return null;

  return (
    <div className="rounded-md border border-slate-800 bg-slate-800/50 p-4 space-y-3">
      <div className="text-sm font-medium text-slate-300">
        7-Day Availability
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span
              className={`w-24 text-xs truncate ${row.isToday ? "text-slate-200 font-medium" : "text-slate-500"}`}
            >
              {row.label}
            </span>
            <div className="flex-1 flex h-4 rounded-sm overflow-hidden bg-slate-700/50">
              {row.segments.map((seg, i) => (
                <div
                  key={i}
                  className={
                    seg.online ? "bg-emerald-500/70" : "bg-slate-600"
                  }
                  style={{
                    width: `${seg.pct}%`,
                    minWidth: seg.pct > 0 ? "1px" : 0,
                  }}
                  title={`${seg.online ? "Online" : "Offline"}: ${seg.from} – ${seg.to}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 pt-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
          Online
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-600" />
          Offline
        </span>
      </div>
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
          fetchDeviceEvents(deviceId, 200),
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
    return <p className="text-sm text-rose-400">{error}</p>;
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
        <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-800 px-4 py-3">
          <div className="text-sm text-slate-400">7-day uptime</div>
          <div className="ml-auto text-lg font-semibold text-white">
            {uptime.uptime_percent.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Visual timeline */}
      <DeviceStateTimeline events={events} />

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No state change events recorded yet.
        </p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-slate-800/60"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  event.event_type === "online"
                    ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                    : "bg-slate-500"
                }`}
              />
              <span className="text-sm text-slate-300 capitalize">
                {event.event_type === "online" ? "Came online" : "Went offline"}
              </span>
              <span className="ml-auto text-xs text-slate-500">
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
        // ignore fetch errors
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
          } else if (code === 500) {
            setError("Scan failed — nmap error.");
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
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {scanResult && (
        <>
          <p className="text-xs text-slate-500">
            Last scanned: {timeAgo(scanResult.scanned_at)}
          </p>

          {scanResult.ports.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No open ports found.
            </p>
          ) : (
            <div className="rounded-md border border-slate-800 bg-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Port</TableHead>
                    <TableHead className="text-slate-400">Proto</TableHead>
                    <TableHead className="text-slate-400">State</TableHead>
                    <TableHead className="text-slate-400">Service</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.ports.map((port) => (
                    <TableRow
                      key={`${port.port}/${port.protocol}`}
                      className="border-slate-800"
                    >
                      <TableCell className="tabular-nums font-mono text-sm text-slate-300">
                        {port.port}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {port.protocol}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-[10px]">
                          {port.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-300">
                        {port.service}
                        {port.version && (
                          <span className="ml-1 text-xs text-slate-500">{port.version}</span>
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
        <p className="py-6 text-center text-sm text-slate-500">
          No port scan results yet. Click &quot;Scan Ports&quot; to start.
        </p>
      )}
    </div>
  );
}

// ─── Device Edit Form ───────────────────────────────────

const DEVICE_TYPE_OPTIONS = [
  "", "server", "workstation", "desktop", "laptop", "vm", "container", "nas",
  "router", "access_point", "switch", "phone", "tablet", "printer", "iot", "ups", "tv", "gaming", "other",
];

const OS_OPTIONS = [
  "", "iOS", "Android", "Windows", "macOS", "Linux", "Other",
];

function DeviceEditForm({ device, onUpdate }: { device: Device; onUpdate: () => void }) {
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [customName, setCustomName] = useState(device.custom_name ?? "");
  const [customType, setCustomType] = useState(device.custom_type ?? "");
  const [customOs, setCustomOs] = useState(device.custom_os ?? "");
  const [customVendor, setCustomVendor] = useState(device.custom_vendor ?? "");
  const [customModel, setCustomModel] = useState(device.custom_model ?? "");
  const [notes, setNotes] = useState(device.notes ?? "");
  const [iconOverride, setIconOverride] = useState(device.icon_override ?? "");
  const [location, setLocation] = useState(device.location ?? "");
  const [owner, setOwner] = useState(device.owner ?? "");
  const [editTags, setEditTags] = useState(device.tags ?? "");
  const [cpuManual, setCpuManual] = useState(device.cpu_manual ?? "");
  const [ramManual, setRamManual] = useState(device.ram_manual ?? "");
  const [diskManual, setDiskManual] = useState(device.disk_manual ?? "");
  const [purchaseDate, setPurchaseDate] = useState(device.purchase_date ?? "");
  const [serialNumber, setSerialNumber] = useState(device.serial_number ?? "");
  const [warrantyExpiry, setWarrantyExpiry] = useState(device.warranty_expiry ?? "");

  const hasCustomFields = !!(device.custom_name || device.custom_type || device.custom_os ||
    device.custom_vendor || device.custom_model || device.notes || device.icon_override ||
    device.location || device.owner || device.tags || device.cpu_manual || device.ram_manual ||
    device.disk_manual || device.purchase_date || device.serial_number || device.warranty_expiry);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: DeviceCustomFields = {};
      if (customName) body.custom_name = customName;
      if (customType) body.custom_type = customType;
      if (customOs) body.custom_os = customOs;
      if (customVendor) body.custom_vendor = customVendor;
      if (customModel) body.custom_model = customModel;
      if (notes) body.notes = notes;
      if (iconOverride) body.icon_override = iconOverride;
      if (location) body.location = location;
      if (owner) body.owner = owner;
      if (editTags) body.tags = editTags;
      if (cpuManual) body.cpu_manual = cpuManual;
      if (ramManual) body.ram_manual = ramManual;
      if (diskManual) body.disk_manual = diskManual;
      if (purchaseDate) body.purchase_date = purchaseDate;
      if (serialNumber) body.serial_number = serialNumber;
      if (warrantyExpiry) body.warranty_expiry = warrantyExpiry;
      await updateDevice(device.id, body);
      toast.success("Device updated");
      onUpdate();
    } catch {
      toast.error("Failed to update device");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDeviceCustom(device.id);
      toast.success("Custom fields reset to auto-detected values");
      setCustomName(""); setCustomType(""); setCustomOs(""); setCustomVendor("");
      setCustomModel(""); setNotes(""); setIconOverride(""); setLocation("");
      setOwner(""); setEditTags(""); setCpuManual(""); setRamManual("");
      setDiskManual(""); setPurchaseDate(""); setSerialNumber(""); setWarrantyExpiry("");
      onUpdate();
    } catch {
      toast.error("Failed to reset custom fields");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col -mb-6">
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-slate-400" />
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Edit Device
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-500">Custom Name</label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={device.hostname ?? device.name ?? "e.g. Oleg's iPhone"}
              className="h-8 text-sm"
            />
            {device.hostname && (
              <p className="mt-0.5 text-[10px] text-slate-600">Auto-detected: {device.hostname}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-slate-500">Device Type</label>
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="flex h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-600"
            >
              <option value="">{device.device_type ? `Auto: ${device.device_type}` : "Select type…"}</option>
              {DEVICE_TYPE_OPTIONS.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-500">OS</label>
            <select
              value={customOs}
              onChange={(e) => setCustomOs(e.target.value)}
              className="flex h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-600"
            >
              <option value="">{device.os_family ? `Auto: ${device.os_family}` : "Select OS…"}</option>
              {OS_OPTIONS.filter(Boolean).map((os) => (
                <option key={os} value={os}>{os}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-500">Vendor / Manufacturer</label>
            <Input
              value={customVendor}
              onChange={(e) => setCustomVendor(e.target.value)}
              placeholder={device.vendor ?? device.device_brand ?? "e.g. Apple, Samsung"}
              className="h-8 text-sm"
            />
            {device.vendor && (
              <p className="mt-0.5 text-[10px] text-slate-600">Auto-detected: {device.vendor}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-slate-500">Model</label>
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder={device.device_model ?? "e.g. iPhone 15 Pro, QNAP TS-253"}
              className="h-8 text-sm"
            />
            {device.device_model && (
              <p className="mt-0.5 text-[10px] text-slate-600">Auto-detected: {device.device_model}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-slate-500">Icon Override</label>
            <select
              value={iconOverride}
              onChange={(e) => setIconOverride(e.target.value)}
              className="flex h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-600"
            >
              <option value="">Auto (based on type)</option>
              {DEVICE_TYPE_OPTIONS.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Separator className="bg-slate-800" />
          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Asset Inventory</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Server Room" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Owner</label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. IT Dept" className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500">Tags (comma-separated)</label>
            <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="e.g. production, critical" className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500">CPU</label>
              <Input value={cpuManual} onChange={(e) => setCpuManual(e.target.value)} placeholder="e.g. i5-12400" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">RAM</label>
              <Input value={ramManual} onChange={(e) => setRamManual(e.target.value)} placeholder="e.g. 16 GB" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Disk</label>
              <Input value={diskManual} onChange={(e) => setDiskManual(e.target.value)} placeholder="e.g. 512 GB" className="h-8 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500">Purchase Date</label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Serial #</label>
              <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="SN123" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Warranty</label>
              <Input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-500">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Freeform notes about this device…"
              rows={3}
              className="flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Sticky footer for Save / Reset actions */}
      <div className="sticky bottom-0 -mx-6 border-t border-slate-800 bg-slate-950 px-6 py-3 space-y-2">
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 gap-1" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        {hasCustomFields && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1 text-xs text-slate-500 hover:text-rose-400"
            disabled={resetting}
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
            {resetting ? "Resetting…" : "Reset to Auto-Detected"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Asset Type Options with Icons ──────────────────────

const ASSET_TYPE_OPTIONS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "server", label: "Server", icon: Server },
  { value: "workstation", label: "Workstation", icon: Monitor },
  { value: "vm", label: "VM", icon: Box },
  { value: "container", label: "Container", icon: Container },
  { value: "nas", label: "NAS", icon: HardDrive },
  { value: "router", label: "Router", icon: Router },
  { value: "switch", label: "Switch", icon: Network },
  { value: "iot", label: "IoT", icon: CircuitBoard },
  { value: "phone", label: "Phone", icon: Smartphone },
  { value: "printer", label: "Printer", icon: Printer },
  { value: "ups", label: "UPS", icon: Battery },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "laptop", label: "Laptop", icon: Laptop },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "tv", label: "TV", icon: Tv },
  { value: "gaming", label: "Gaming", icon: Gamepad2 },
  { value: "other", label: "Other", icon: HelpCircle },
];

// ─── Add Asset Dialog ───────────────────────────────────

function AddAssetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [ip, setIp] = useState("");
  const [mac, setMac] = useState("");
  const [location, setLocation] = useState("");
  const [model, setModel] = useState("");
  const [vendor, setVendor] = useState("");
  const [cpuManual, setCpuManual] = useState("");
  const [ramManual, setRamManual] = useState("");
  const [diskManual, setDiskManual] = useState("");
  const [os, setOs] = useState("");
  const [osVersion, setOsVersion] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");

  const resetForm = () => {
    setName(""); setAssetType(""); setIp(""); setMac(""); setLocation("");
    setModel(""); setVendor(""); setCpuManual(""); setRamManual(""); setDiskManual("");
    setOs(""); setOsVersion(""); setOwner(""); setTags(""); setNotes("");
    setPurchaseDate(""); setSerialNumber(""); setWarrantyExpiry("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body: CreateAssetRequest = {
        is_manual: true,
        custom_name: name.trim(),
      };
      if (assetType) body.custom_type = assetType;
      if (ip.trim()) body.ip = ip.trim();
      if (mac.trim()) body.mac = mac.trim();
      if (location.trim()) body.location = location.trim();
      if (model.trim()) body.custom_model = model.trim();
      if (vendor.trim()) body.custom_vendor = vendor.trim();
      if (cpuManual.trim()) body.cpu_manual = cpuManual.trim();
      if (ramManual.trim()) body.ram_manual = ramManual.trim();
      if (diskManual.trim()) body.disk_manual = diskManual.trim();
      if (os.trim()) body.custom_os = os.trim();
      if (owner.trim()) body.owner = owner.trim();
      if (tags.trim()) body.tags = tags.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (purchaseDate) body.purchase_date = purchaseDate;
      if (serialNumber.trim()) body.serial_number = serialNumber.trim();
      if (warrantyExpiry) body.warranty_expiry = warrantyExpiry;

      await createAsset(body);
      toast.success("Asset created");
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-800 bg-slate-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add Asset</DialogTitle>
          <DialogDescription>
            Manually register a device that can&apos;t be auto-discovered (switches, printers, IoT, UPS, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Name (required) */}
          <div>
            <label className="text-[11px] font-medium text-slate-400">
              Name <span className="text-rose-400">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Switch, Main Printer"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          {/* Type selector with icons */}
          <div>
            <label className="text-[11px] font-medium text-slate-400">Type</label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {ASSET_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = assetType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAssetType(isSelected ? "" : opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network info */}
          <div>
            <p className="text-[11px] font-medium text-slate-400">Network</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">IP Address</label>
                <Input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="e.g. 10.10.0.1"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">MAC Address</label>
                <Input
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Hardware */}
          <div>
            <p className="text-[11px] font-medium text-slate-400">Hardware</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">Vendor / Manufacturer</label>
                <Input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Cisco, HP, APC"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Model</label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. SG350-28, LaserJet Pro"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">CPU</label>
                <Input
                  value={cpuManual}
                  onChange={(e) => setCpuManual(e.target.value)}
                  placeholder="e.g. Intel i5-12400"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">RAM</label>
                <Input
                  value={ramManual}
                  onChange={(e) => setRamManual(e.target.value)}
                  placeholder="e.g. 16 GB DDR4"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-slate-500">Disk</label>
                <Input
                  value={diskManual}
                  onChange={(e) => setDiskManual(e.target.value)}
                  placeholder="e.g. 512 GB NVMe SSD"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Software */}
          <div>
            <p className="text-[11px] font-medium text-slate-400">Software</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">OS</label>
                <select
                  value={os}
                  onChange={(e) => setOs(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-600"
                >
                  <option value="">Select OS…</option>
                  {OS_OPTIONS.filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">OS Version</label>
                <Input
                  value={osVersion}
                  onChange={(e) => setOsVersion(e.target.value)}
                  placeholder="e.g. 22.04, 15.2"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Location & ownership */}
          <div>
            <p className="text-[11px] font-medium text-slate-400">Location &amp; Ownership</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Server Room, Office 2F"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Owner</label>
                <Input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="e.g. IT Department"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-slate-500">Tags (comma-separated)</label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. production, critical, floor-2"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Asset management */}
          <div>
            <p className="text-[11px] font-medium text-slate-400">Asset Management</p>
            <div className="mt-1.5 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-slate-500">Purchase Date</label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Serial Number</label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. SN123456"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Warranty Expiry</label>
                <Input
                  type="date"
                  value={warrantyExpiry}
                  onChange={(e) => setWarrantyExpiry(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-slate-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this asset…"
              rows={2}
              className="mt-1.5 flex w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !name.trim()} onClick={handleSubmit}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Asset
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Device WiFi Tab ────────────────────────────────────

function SignalBadge({ dbm }: { dbm: number }) {
  let color = "bg-red-500/20 text-red-400 border-red-500/30";
  if (dbm > -50) color = "bg-green-500/20 text-green-400 border-green-500/30";
  else if (dbm > -70) color = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return (
    <Badge variant="outline" className={`font-mono text-xs ${color}`}>
      {dbm} dBm
    </Badge>
  );
}

function DeviceWifiTab({ mac }: { mac: string }) {
  const [wifiInfo, setWifiInfo] = useState<DeviceWifiInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchXiaomiStatus();
        if (!status.configured) { if (!cancelled) setWifiInfo(null); return; }

        const [wifiDevices, allDevices] = await Promise.all([
          fetchXiaomiWifiDevices(),
          fetchXiaomiDevices(),
        ]);

        const normalizedMac = mac.toUpperCase();

        // Look for WiFi info
        const wifiDev = wifiDevices.find((w) => w.mac?.toUpperCase() === normalizedMac);
        const devInfo = allDevices.find((d) => d.mac?.toUpperCase() === normalizedMac);

        if (!wifiDev && !devInfo) {
          if (!cancelled) setWifiInfo(null);
          return;
        }

        const info: DeviceWifiInfo = {
          mac: normalizedMac,
          signal_dbm: wifiDev?.signal ?? null,
          band: wifiDev?.band ?? null,
          connection_type: wifiDev ? "wifi" : "wired",
          mesh_node: devInfo?.parent_id ?? null,
          router_name: devInfo?.name ?? wifiDev?.name ?? null,
          upload_bps: devInfo?.upload_speed ? parseFloat(devInfo.upload_speed) : null,
          download_bps: devInfo?.download_speed ? parseFloat(devInfo.download_speed) : null,
          is_online: devInfo?.online ?? true,
        };

        if (!cancelled) setWifiInfo(info);
      } catch {
        if (!cancelled) setWifiInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mac]);

  if (wifiInfo === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-full bg-slate-800" />
      </div>
    );
  }

  if (!wifiInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Wifi className="mb-2 h-8 w-8 text-slate-600" />
        <p className="text-sm text-slate-500">No WiFi data available</p>
        <p className="mt-1 text-xs text-slate-600">
          Configure Xiaomi MiWiFi integration in Settings to see WiFi details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-cyan-400" />
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          WiFi Connection
        </p>
      </div>

      <div className="space-y-3">
        {/* Connection Type */}
        <InfoRow label="Connection" value={wifiInfo.connection_type === "wifi" ? "Wireless" : "Wired"} />

        {/* Signal Strength */}
        {wifiInfo.signal_dbm != null && (
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
              Signal
            </span>
            <SignalBadge dbm={wifiInfo.signal_dbm} />
          </div>
        )}

        {/* Band */}
        {wifiInfo.band && (
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
              Band
            </span>
            <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
              {wifiInfo.band}
            </Badge>
          </div>
        )}

        {/* Mesh Node */}
        {wifiInfo.mesh_node && (
          <InfoRow label="Mesh Node" value={wifiInfo.mesh_node} />
        )}

        {/* Router Name */}
        {wifiInfo.router_name && (
          <InfoRow label="Router Name" value={wifiInfo.router_name} />
        )}

        {/* Upload/Download Speed */}
        {(wifiInfo.upload_bps != null || wifiInfo.download_bps != null) && (
          <>
            <Separator className="bg-slate-800" />
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-slate-500" />
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Current Speed
              </p>
            </div>
            {wifiInfo.download_bps != null && (
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Download
                </span>
                <span className="font-mono text-sm text-green-400">
                  {formatSpeed(wifiInfo.download_bps)}
                </span>
              </div>
            )}
            {wifiInfo.upload_bps != null && (
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Upload
                </span>
                <span className="font-mono text-sm text-blue-400">
                  {formatSpeed(wifiInfo.upload_bps)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Format bytes/s to a human-readable speed string. */
function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

// ─── InfoRow Helper ─────────────────────────────────────

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
      <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-sm text-slate-300 ${mono ? "font-mono tabular-nums" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
