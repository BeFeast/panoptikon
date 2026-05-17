export type StatusKind =
  | "online"
  | "offline"
  | "warning"
  | "info"
  | "inactive";

export interface StatusDotProps {
  status?: StatusKind;
  /** Add the glow-pulse halo animation (only meaningful for live indicators). */
  pulse?: boolean;
  /** Pixel diameter of the dot. */
  size?: number;
  className?: string;
}

const COLOR_MAP: Record<StatusKind, string> = {
  online: "hsl(var(--status-online))",
  offline: "hsl(var(--status-offline))",
  warning: "hsl(var(--status-warning))",
  info: "hsl(var(--status-info))",
  inactive: "hsl(var(--muted-foreground))",
};

/**
 * StatusDot — small coloured dot with optional pulse halo.
 *
 * Faithful port of `StatusDot` from `atoms.jsx`. The pulse animation reuses
 * the `glow-pulse` keyframes already defined in `globals.css`, so the timing
 * stays consistent with the rest of the mesh shell.
 *
 * @example
 * <StatusDot status="online" pulse />
 */
export function StatusDot({
  status = "online",
  pulse = false,
  size = 8,
  className,
}: StatusDotProps) {
  const color = COLOR_MAP[status] ?? COLOR_MAP.inactive;
  return (
    <span
      data-status={status}
      data-pulse={pulse ? "true" : "false"}
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        animation: pulse ? "glow-pulse 2.4s ease-in-out infinite" : "none",
      }}
      aria-hidden="true"
    />
  );
}
