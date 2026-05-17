export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SevDotProps {
  severity?: Severity;
  size?: number;
  className?: string;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: "hsl(var(--status-offline))",
  high: "hsl(var(--status-offline))",
  medium: "hsl(var(--status-warning))",
  low: "hsl(var(--status-info))",
  info: "hsl(var(--muted-foreground))",
};

/**
 * SevDot — severity indicator dot for alert rows / counts.
 *
 * Faithful port of the severity-dot pattern used in `atoms.jsx` (StatusDot
 * specialised for alert lists). Colour ladder follows the mesh palette:
 * critical/high -> rose, medium -> amber, low -> sky, info -> muted.
 *
 * @example
 * <SevDot severity="critical" />
 */
export function SevDot({
  severity = "info",
  size = 8,
  className,
}: SevDotProps) {
  const color = SEV_COLOR[severity] ?? SEV_COLOR.info;
  return (
    <span
      data-severity={severity}
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow:
          severity === "critical"
            ? "0 0 0 2px rgba(244, 63, 94, 0.18)"
            : "none",
      }}
      aria-hidden="true"
    />
  );
}
