import type { ReactNode } from "react";

export interface DetailsFieldProps {
  /** Field key — rendered in dim mute text on the left. */
  label: ReactNode;
  /** Field value — rendered in primary text on the right. */
  value: ReactNode;
  /** Render the value in mono font (defaults to `true`). */
  mono?: boolean;
  /** Optional inline status colour override for the value text. */
  valueColor?: string;
  /** Stack label above value instead of side-by-side (default `false`). */
  vertical?: boolean;
  className?: string;
}

/**
 * DetailsField — single key/value pair used inside detail drawers.
 *
 * Faithful port of the metadata pairs from `panopticon/project/details.jsx`
 * (`endpoint · wss://core.lan/agent`, `session · 8a4f-3c92`, etc.). Compose
 * many of these inside a `DetailsSection` to build a metadata grid.
 */
export function DetailsField({
  label,
  value,
  mono = true,
  valueColor,
  vertical = false,
  className,
}: DetailsFieldProps) {
  return (
    <div
      data-component="mesh-details-field"
      data-orientation={vertical ? "vertical" : "horizontal"}
      className={className}
      style={
        vertical
          ? { display: "flex", flexDirection: "column", gap: 2 }
          : {
              display: "grid",
              gridTemplateColumns: "minmax(80px, 0.4fr) 1fr",
              gap: 10,
              alignItems: "baseline",
              font: "400 12px var(--font-sans, system-ui, sans-serif)",
            }
      }
    >
      <span
        data-slot="mesh-details-field-label"
        style={{
          color: "#5d7799",
          font: vertical
            ? "600 10px var(--font-sans, system-ui, sans-serif)"
            : "400 12px var(--font-sans, system-ui, sans-serif)",
          letterSpacing: vertical ? "0.08em" : undefined,
          textTransform: vertical ? "uppercase" : undefined,
        }}
      >
        {label}
      </span>
      <span
        data-slot="mesh-details-field-value"
        style={{
          color: valueColor ?? "#e9f0fc",
          font: mono
            ? "400 12px var(--font-mono, monospace)"
            : "400 12px var(--font-sans, system-ui, sans-serif)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}
