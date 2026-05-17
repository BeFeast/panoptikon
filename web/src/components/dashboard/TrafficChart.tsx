"use client";
import { useId } from "react";
import type { TrafficHistoryPoint } from "@/lib/types";

export interface TrafficChartProps {
  /** Live traffic history from /api/v1/traffic/history (oldest → newest). */
  history: TrafficHistoryPoint[];
  /** Chart pixel height. Width fills the parent. */
  height?: number;
}

/**
 * TrafficChart — RX/TX stacked area chart (port of dashboard.jsx TrafficChart).
 *
 * Pure SVG, no recharts dependency. Renders two soft-gradient areas with
 * crisp stroke lines, a five-band horizontal grid, and a time axis derived
 * from the first/last sample minute. Falls back to a flat baseline if the
 * history is empty.
 */
export function TrafficChart({ history, height = 200 }: TrafficChartProps) {
  const W = 1000;
  const H = height;
  const N = history.length;
  const rxId = useId();
  const txId = useId();

  // Empty state — render just the grid + axis hints so layout stays stable.
  if (N === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        aria-label="WAN traffic history"
        role="img"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1="0"
            x2={W}
            y1={p * H}
            y2={p * H}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
            strokeDasharray={i === 4 ? "" : "2 4"}
            opacity="0.5"
          />
        ))}
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          waiting for traffic samples…
        </text>
      </svg>
    );
  }

  const rx = history.map((p) => Math.max(0, p.rx_bps));
  const tx = history.map((p) => Math.max(0, p.tx_bps));
  const max = Math.max(1, ...rx, ...tx) * 1.15;
  const sx = N > 1 ? W / (N - 1) : W;
  const toY = (v: number) => H - (v / max) * (H - 18) - 8;
  const linePath = (arr: number[]) =>
    arr
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"}${(i * sx).toFixed(1)},${toY(v).toFixed(1)}`,
      )
      .join(" ");
  const areaPath = (arr: number[]) =>
    `${linePath(arr)} L${W},${H} L0,${H} Z`;

  // Time axis labels — first, middle, last; format as HH:mm.
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };
  const labels =
    N === 1
      ? [fmt(history[0].minute)]
      : N === 2
        ? [fmt(history[0].minute), fmt(history[N - 1].minute)]
        : [
            fmt(history[0].minute),
            fmt(history[Math.floor(N / 2)].minute),
            fmt(history[N - 1].minute),
          ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-label="WAN traffic history"
      role="img"
    >
      <defs>
        <linearGradient id={rxId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--status-info))" stopOpacity="0.35" />
          <stop offset="1" stopColor="hsl(var(--status-info))" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={txId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1="0"
          x2={W}
          y1={p * H}
          y2={p * H}
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
          strokeDasharray={i === 4 ? "" : "2 4"}
          opacity="0.5"
        />
      ))}
      <path d={areaPath(rx)} fill={`url(#${rxId})`} />
      <path
        d={linePath(rx)}
        stroke="hsl(var(--status-info))"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <path d={areaPath(tx)} fill={`url(#${txId})`} />
      <path
        d={linePath(tx)}
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      {labels.map((t, i) => (
        <text
          key={i}
          x={labels.length === 1 ? W / 2 : (i / (labels.length - 1)) * W}
          y={H - 2}
          fill="hsl(var(--muted-foreground))"
          fontSize="10"
          fontFamily="var(--font-mono)"
          textAnchor={
            i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"
          }
        >
          {t}
        </text>
      ))}
    </svg>
  );
}
