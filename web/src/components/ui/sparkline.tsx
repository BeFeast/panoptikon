import * as React from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
  strokeClass?: string;
  width?: number;
  height?: number;
}

/**
 * Tiny inline SVG trend line for stat cards.
 * Renders a polyline from the given data points — no charting library needed.
 */
export function Sparkline({
  data,
  className,
  strokeClass = "stroke-slate-400",
  width = 64,
  height = 24,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const d = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d={d}
        className={cn("fill-none stroke-[1.5]", strokeClass)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
