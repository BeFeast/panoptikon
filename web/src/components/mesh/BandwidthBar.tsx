export interface BandwidthBarProps {
  /** Receive rate in same unit as `max`. */
  rx: number;
  /** Transmit rate in same unit as `max`. */
  tx: number;
  /** Full-scale value (e.g. link capacity). */
  max?: number;
  /** Total pixel width of the chart. */
  width?: number;
  className?: string;
}

/**
 * BandwidthBar — two-row RX/TX utilisation bar.
 *
 * Faithful port of `BandwidthBar` from `atoms.jsx`. Top row is RX (sky/info),
 * bottom is TX (violet). Both scale to the same `max` so the visual reading
 * is comparable.
 *
 * @example
 * <BandwidthBar rx={420} tx={180} max={1000} />
 */
export function BandwidthBar({
  rx,
  tx,
  max = 1000,
  width = 100,
  className,
}: BandwidthBarProps) {
  const clamp = (n: number) => Math.max(0, Math.min(n, max));
  const rxW = (clamp(rx) / max) * width;
  const txW = (clamp(tx) / max) * width;
  const trackStyle: React.CSSProperties = {
    position: "relative",
    height: 4,
    background: "hsl(var(--muted))",
    borderRadius: 2,
    overflow: "hidden",
  };
  return (
    <div
      className={className}
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      role="group"
      aria-label="bandwidth"
    >
      <div data-channel="rx" style={trackStyle}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: rxW,
            background: "hsl(var(--status-info))",
            borderRadius: 2,
          }}
        />
      </div>
      <div data-channel="tx" style={trackStyle}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: txW,
            background: "#a78bfa",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
