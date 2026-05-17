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
import { fetchDeviceTraffic } from "@/lib/api";
import { formatBps } from "@/lib/format";
import type { DeviceTrafficPoint } from "@/lib/types";

type TimeRange = "1h" | "24h" | "7d" | "30d";

const RANGE_LABELS: Record<TimeRange, string> = {
  "1h": "1 Hour",
  "24h": "24 Hours",
  "7d": "7 Days",
  "30d": "30 Days",
};

function formatTime(iso: string, range: TimeRange): string {
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

interface DeviceTrafficChartProps {
  deviceId: string;
  /** Chart height in pixels. Default: 200 */
  height?: number;
}

export function DeviceTrafficChart({
  deviceId,
  height = 200,
}: DeviceTrafficChartProps) {
  const [data, setData] = useState<DeviceTrafficPoint[]>([]);
  const [range, setRange] = useState<TimeRange>("1h");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const points = await fetchDeviceTraffic(deviceId, range);
      setData(points);
    } catch {
      // Keep stale data on error
    } finally {
      setLoading(false);
    }
  }, [deviceId, range]);

  useEffect(() => {
    setLoading(true);
    load();
    // Refresh every 30s for short ranges, less for longer
    const intervalMs = range === "1h" ? 30_000 : 60_000;
    const interval = setInterval(load, intervalMs);
    return () => clearInterval(interval);
  }, [load, range]);

  return (
    <div className="rounded-lg border border-mesh-border bg-mesh-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-mesh-primary" />
          <h3 className="text-sm font-medium text-mesh-text-dim">
            Bandwidth History
          </h3>
        </div>
        <div className="flex gap-1">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
            <Button
              key={r}
              variant={range === r ? "secondary" : "ghost"}
              size="sm"
              className={`h-7 px-2.5 text-xs ${
                range === r
                  ? "bg-mesh-border-strong text-white"
                  : "text-mesh-text-mute hover:text-mesh-text"
              }`}
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {loading && data.length === 0 ? (
        <Skeleton className="w-full rounded-xl" style={{ height }} />
      ) : data.length > 0 ? (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient
                  id="devColorRx"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="devColorTx"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tickFormatter={(v: string) => formatTime(v, range)}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => formatBps(v)}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                labelFormatter={(v: string) => formatTime(v, range)}
                formatter={(value: number, name: string) => [
                  formatBps(value),
                  name === "rx_bps" ? "Inbound (avg)" : "Outbound (avg)",
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
                fill="url(#devColorRx)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="tx_bps"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#devColorTx)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height }}
        >
          <p className="text-sm text-mesh-text-mute">
            No traffic data for this device.
          </p>
        </div>
      )}
    </div>
  );
}
