import type { ReactNode } from "react";

export interface KPIProps {
  /** Uppercase micro-label shown above the value. */
  label: string;
  /** Primary value — accepts strings/numbers so callers can pre-format. */
  value: ReactNode;
  /** Optional unit suffix rendered in muted mono next to the value. */
  unit?: ReactNode;
  /**
   * Optional trend chip — pass a pre-formatted string starting with `+` or
   * `-` to drive the colour (matches the source `KPI` semantics).
   */
  trend?: string;
  /** Optional inline visualisation (Spark / MiniBars) below the value. */
  spark?: ReactNode;
  /** Override the value colour (e.g. tint for alerts). */
  accent?: string;
  className?: string;
}

/**
 * KPI — single-metric card with label, value, unit, trend chip and sparkline.
 *
 * Faithful port of `KPI` from the design handoff (`atoms.jsx`). The card chrome
 * uses mesh tokens (`--card`, `--border`) so it reads correctly inside the
 * existing mesh shell without any extra wrapper.
 *
 * @example
 * <KPI
 *   label="Bandwidth"
 *   value="420"
 *   unit="Mbps"
 *   trend="+12%"
 *   spark={<Spark data={series} />}
 * />
 */
export function KPI({
  label,
  value,
  unit,
  trend,
  spark,
  accent,
  className,
}: KPIProps) {
  const trendPositive = trend?.startsWith("+");
  const trendColor = trend
    ? trendPositive
      ? "hsl(var(--status-online))"
      : "hsl(var(--status-offline))"
    : undefined;

  return (
    <div
      className={className}
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "var(--radius)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
      data-component="mesh-kpi"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            lineHeight: 1.3,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          {label}
        </span>
        {trend ? (
          <span
            data-trend={trendPositive ? "up" : "down"}
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              fontSize: 10,
              lineHeight: 1,
              color: trendColor,
            }}
          >
            {trend}
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          minWidth: 0,
        }}
      >
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 24,
            fontWeight: 600,
            color: accent ?? "hsl(var(--foreground))",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit ? (
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {spark ? <div style={{ marginTop: 2 }}>{spark}</div> : null}
    </div>
  );
}
