export interface MiniBarsProps {
  /** Numeric series — each value renders as one bar. */
  data: number[];
  width?: number;
  height?: number;
  /** Bar fill colour. Accepts any CSS color string. */
  color?: string;
  className?: string;
}

/**
 * MiniBars — minimal inline bar chart (~80x22 by default).
 *
 * Faithful port of `MiniBars` from `atoms.jsx`. Used in dense tables and KPI
 * tiles when discrete buckets are more informative than a continuous line.
 *
 * @example
 * <MiniBars data={[2, 4, 3, 7, 5]} color="hsl(var(--ring))" />
 */
export function MiniBars({
  data,
  width = 80,
  height = 22,
  color = "hsl(var(--ring))",
  className,
}: MiniBarsProps) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const bw = width / data.length;
  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {data.map((v, i) => {
        const h = (v / max) * (height - 2);
        return (
          <rect
            key={i}
            x={i * bw + 0.5}
            y={height - h}
            width={Math.max(bw - 1, 1)}
            height={h}
            fill={color}
            opacity={0.5 + (v / max) * 0.5}
            rx="0.5"
          />
        );
      })}
    </svg>
  );
}
