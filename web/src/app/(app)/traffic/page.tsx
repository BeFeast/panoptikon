"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, ChevronDown, Download, Radio, X } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { fetchTrafficHistory, fetchTopDevices, fetchNetflowStatus } from "@/lib/api";
import { formatBps } from "@/lib/format";
import type { TrafficHistoryPoint, TopDevice, NetflowStatus } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { downloadExport } from "@/lib/export";
import { DeviceTrafficChart } from "@/components/DeviceTrafficChart";

/** Format an ISO minute string to HH:mm for the X axis. */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function TrafficPage() {
  const [history, setHistory] = useState<TrafficHistoryPoint[]>([]);
  const [topDevices, setTopDevices] = useState<TopDevice[]>([]);
  const [netflow, setNetflow] = useState<NetflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<TopDevice | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, d, nf] = await Promise.all([
        fetchTrafficHistory(60),
        fetchTopDevices(10),
        fetchNetflowStatus(),
      ]);
      setHistory(h);
      setTopDevices(d);
      setNetflow(nf);
    } catch {
      // Silently ignore errors — data will remain stale until next refresh.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Page header — eyebrow + display headline + Export action */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="t-micro">Operations</div>
            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <h1 className="t-display" style={{ margin: 0 }}>
                Traffic
              </h1>
              <HelpTooltip text="Network bandwidth usage over time. Requires NetFlow/sFlow export from your router to be configured in Settings." />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="btn">
                <Download className="h-3 w-3" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3" style={{ color: "var(--text-mute)" }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await downloadExport(
                      "/api/v1/traffic/export?format=csv&minutes=1440",
                      "panoptikon-traffic.csv"
                    );
                    toast.success("Traffic exported as CSV");
                  } catch {
                    toast.error("Export failed");
                  }
                }}
              >
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await downloadExport(
                      "/api/v1/traffic/export?format=json&minutes=1440",
                      "panoptikon-traffic.json"
                    );
                    toast.success("Traffic exported as JSON");
                  } catch {
                    toast.error("Export failed");
                  }
                }}
              >
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* NetFlow Collector Status */}
        {netflow && (
          <Card className="flex items-center gap-2 px-4 py-2.5">
            <Radio
              className="h-4 w-4"
              style={{ color: netflow.enabled ? "#4ade80" : "var(--text-mute)" }}
            />
            <span className="t-small" style={{ color: "var(--text-dim)" }}>
              NetFlow collector:{" "}
              {netflow.enabled ? (
                <span style={{ color: "#4ade80" }}>
                  active on port {netflow.port}
                  <span className="ml-2" style={{ color: "var(--text-mute)" }}>
                    ({netflow.flows_received.toLocaleString()} flows received)
                  </span>
                </span>
              ) : (
                <span style={{ color: "var(--text-mute)" }}>disabled</span>
              )}
            </span>
          </Card>
        )}

        {/* Traffic History Chart */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-mesh-primary" />
            <h2 className="t-h3">Traffic — Last 60 minutes</h2>
          </div>

          {loading && history.length === 0 ? (
            <Skeleton className="h-[200px] w-full rounded-xl" />
          ) : history.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(96,144,212,0.20)" />
                  <XAxis
                    dataKey="minute"
                    tickFormatter={formatTime}
                    tick={{ fill: "#5d7799", fontSize: 11 }}
                    stroke="rgba(96,144,212,0.20)"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatBps(v)}
                    tick={{ fill: "#5d7799", fontSize: 11 }}
                    stroke="rgba(96,144,212,0.20)"
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#091633",
                      border: "1px solid rgba(96,144,212,0.20)",
                      borderRadius: "6px",
                      color: "#e9f0fc",
                      fontSize: "12px",
                    }}
                    labelFormatter={formatTime}
                    formatter={(value: number, name: string) => [
                      formatBps(value),
                      name === "rx_bps" ? "Inbound" : "Outbound",
                    ]}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === "rx_bps" ? "Inbound" : "Outbound"
                    }
                    wrapperStyle={{ fontSize: "12px", color: "#98aecf" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rx_bps"
                    stroke="#38bdf8"
                    fillOpacity={1}
                    fill="url(#colorRx)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="tx_bps"
                    stroke="#4ade80"
                    fillOpacity={1}
                    fill="url(#colorTx)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center">
              <div className="text-center">
                <Activity className="mx-auto mb-2 h-8 w-8 text-mesh-text-mute" />
                <p className="t-small" style={{ color: "var(--text-dim)" }}>
                  No traffic data
                </p>
                <p className="t-micro" style={{ marginTop: 4 }}>
                  Enable NetFlow/sFlow export in Settings to see bandwidth data.
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Per-device Historical Bandwidth */}
        {selectedDevice && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="t-h3">
                {selectedDevice.name ?? selectedDevice.hostname ?? selectedDevice.ip} — Historical Bandwidth
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedDevice(null)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <DeviceTrafficChart deviceId={selectedDevice.id} height={220} />
          </div>
        )}

        {/* Top Devices by Bandwidth */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(96,144,212,0.20)" }}>
            <h2 className="t-h3">
              Top Devices by Bandwidth
              <span className="t-micro" style={{ marginLeft: 8 }}>
                Click a row to view history
              </span>
            </h2>
          </div>
          {loading && topDevices.length === 0 ? (
            <Table wrapperClassName="rounded-none border-x-0 border-b-0">
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="t-micro">Device</TableHead>
                  <TableHead className="t-micro">IP</TableHead>
                  <TableHead className="text-right t-micro">Download</TableHead>
                  <TableHead className="text-right t-micro">Upload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-mesh-border-strong">
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table wrapperClassName="rounded-none border-x-0 border-b-0">
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="t-micro">Device</TableHead>
                  <TableHead className="t-micro">IP</TableHead>
                  <TableHead className="text-right t-micro">Download</TableHead>
                  <TableHead className="text-right t-micro">Upload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDevices.length === 0 ? (
                  <TableEmptyRow
                    colSpan={4}
                    title="No traffic data"
                    description="No active devices with bandwidth usage. Make sure NetFlow or sFlow is configured in Settings."
                    action={
                      <a href="/settings/router" className="btn btn-primary">
                        Traffic Settings
                      </a>
                    }
                  />
                ) : (
                topDevices.map((d) => (
                  <TableRow
                    key={d.id}
                    className={`border-mesh-border cursor-pointer ${
                      selectedDevice?.id === d.id
                        ? "bg-mesh-surface-1"
                        : "hover:bg-mesh-surface-2/55"
                    }`}
                    onClick={() =>
                      setSelectedDevice(
                        selectedDevice?.id === d.id ? null : d
                      )
                    }
                  >
                    <TableCell className="text-mesh-text">
                      {d.name ?? d.hostname ?? d.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="mono tabular text-xs text-mesh-text-dim">
                      {d.ip ?? "—"}
                    </TableCell>
                    <TableCell className="mono tabular text-right text-mesh-primary">
                      {formatBps(d.rx_bps)}
                    </TableCell>
                    <TableCell className="mono tabular text-right" style={{ color: "#4ade80" }}>
                      {formatBps(d.tx_bps)}
                    </TableCell>
                  </TableRow>
                ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}
