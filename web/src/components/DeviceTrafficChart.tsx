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
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDeviceTrafficHistory } from "@/lib/api";
import { formatBps } from "@/lib/format";
import type { DeviceTrafficPoint, TrafficRange } from "@/lib/types";

const RANGES: { label: string; value: TrafficRange }[] = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

function formatTimeLabel(iso: string, range: TrafficRange): string {
  try {
    const d = new Date(iso);
    if (range === "30d") {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    if (range === "7d") {
      return d.toLocaleDateString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function DeviceTrafficChart({ deviceId }: { deviceId: string }) {
  const [range, setRange] = useState<TrafficRange>("1h");
  const [data, setData] = useState<DeviceTrafficPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const points = await fetchDeviceTrafficHistory(deviceId, range);
      setData(points);
    } catch {
      // silently ignore — empty state shown
    } finally {
      setLoading(false);
    }
  }, [deviceId, range]);

  useEffect(() => {
    load();
    // Auto-refresh for 1h view
    if (range === "1h") {
      const interval = setInterval(load, 30_000);
      return () => clearInterval(interval);
    }
  }, [load, range]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-400">
            Bandwidth History
          </span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 px-2.5 text-xs ${
                range === r.value
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && data.length === 0 ? (
        <Skeleton className="h-[200px] w-full rounded-xl" />
      ) : data.length > 0 ? (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="dtcRx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dtcTx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tickFormatter={(v: string) => formatTimeLabel(v, range)}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                stroke="#1e293b"
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatBps(v)}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                stroke="#1e293b"
                width={65}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                labelFormatter={(v: string) => formatTimeLabel(v, range)}
                formatter={(value: number, name: string) => [
                  formatBps(value),
                  name === "avg_rx_bps" ? "Avg Inbound" : "Avg Outbound",
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === "avg_rx_bps" ? "Avg Inbound" : "Avg Outbound"
                }
                wrapperStyle={{ fontSize: "11px", color: "#9ca3af" }}
              />
              <Area
                type="monotone"
                dataKey="avg_rx_bps"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#dtcRx)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="avg_tx_bps"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#dtcTx)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center">
          <p className="text-sm text-slate-500">
            No traffic data for this device.
          </p>
        </div>
      )}
    </div>
  );
}
