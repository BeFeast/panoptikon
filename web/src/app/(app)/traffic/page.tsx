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
import { Activity, ChevronDown, Download, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchTrafficHistory, fetchTopDevices, fetchNetflowStatus } from "@/lib/api";
import { formatBps } from "@/lib/format";
import type { TrafficHistoryPoint, TopDevice, NetflowStatus } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function downloadExport(url: string, filename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Traffic</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
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
        <div className="flex items-center gap-2 rounded-lg border border-[#2a2a3a] bg-[#16161f] px-4 py-2.5">
          <Radio className={`h-4 w-4 ${netflow.enabled ? "text-green-400" : "text-gray-500"}`} />
          <span className="text-sm text-gray-400">
            NetFlow collector:{" "}
            {netflow.enabled ? (
              <span className="text-green-400">
                active on port {netflow.port}
                <span className="ml-2 text-gray-500">
                  ({netflow.flows_received.toLocaleString()} flows received)
                </span>
              </span>
            ) : (
              <span className="text-gray-500">disabled</span>
            )}
          </span>
        </div>
      )}

      {/* Traffic History Chart */}
      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-medium text-gray-400">
            Traffic — Last 60 minutes
          </h2>
        </div>

        {history.length > 0 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
                <XAxis
                  dataKey="minute"
                  tickFormatter={formatTime}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="#2a2a3a"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatBps(v)}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="#2a2a3a"
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#16161f",
                    border: "1px solid #2a2a3a",
                    borderRadius: "6px",
                    color: "#fff",
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
                  wrapperStyle={{ fontSize: "12px", color: "#9ca3af" }}
                />
                <Area
                  type="monotone"
                  dataKey="rx_bps"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorRx)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx_bps"
                  stroke="#22c55e"
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
            <p className="text-sm text-gray-500">
              {loading ? "Loading traffic data…" : "No traffic data available yet."}
            </p>
          </div>
        )}
      </div>

      {/* Top Devices by Bandwidth */}
      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f]">
        <div className="border-b border-[#2a2a3a] px-4 py-3">
          <h2 className="text-sm font-medium text-gray-400">
            Top Devices by Bandwidth
          </h2>
        </div>
        {topDevices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {loading ? "Loading…" : "No active devices."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a3a] hover:bg-transparent">
                <TableHead className="text-gray-500">Device</TableHead>
                <TableHead className="text-gray-500">IP</TableHead>
                <TableHead className="text-right text-gray-500">
                  Download
                </TableHead>
                <TableHead className="text-right text-gray-500">
                  Upload
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topDevices.map((d) => (
                <TableRow key={d.id} className="border-[#2a2a3a]">
                  <TableCell className="text-white">
                    {d.name ?? d.hostname ?? d.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">
                    {d.ip ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-blue-400">
                    {formatBps(d.rx_bps)}
                  </TableCell>
                  <TableCell className="text-right text-green-400">
                    {formatBps(d.tx_bps)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
