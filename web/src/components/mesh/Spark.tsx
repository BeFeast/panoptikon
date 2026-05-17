import { useId } from "react";

export interface SparkProps {
  /** Series of numeric values to plot, left-to-right. */
  data: number[];
  width?: number;
  height?: number;
  /** Stroke colour for the line + gradient seed. Accepts any CSS color string. */
  color?: string;
  /** Whether to draw the soft gradient fill below the line. */
  fill?: boolean;
  className?: string;
}

/**
 * Spark — minimal inline sparkline SVG.
 *
 * Faithful port of `Spark` from the design handoff (`atoms.jsx`). Used inside
 * KPI tiles and dense table rows to give a quick directional read on a metric.
 *
 * @example
 * <Spark data={[3, 5, 4, 7, 9, 8]} color="hsl(var(--ring))" />
 */
export function Spark({
  data,
  width = 80,
  height = 22,
  color = "hsl(var(--ring))",
  fill = true,
  className,
}: SparkProps) {
  const gid = useId();
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points: Array<[number, number]> = data.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * (height - 4) - 2,
  ]);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const dFill = `${d} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      className={className ?? "spark"}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={dFill} fill={`url(#${gid})`} />}
      <path
        d={d}
        stroke={color}
        strokeWidth="1.4"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="1.8" fill={color} />
    </svg>
  );
}
