"use client";

import type { ReactNode } from "react";

export interface DetailsFieldProps {
  /** Field label (rendered as the muted key column). */
  label: ReactNode;
  /** Field value (rendered mono in the value column). */
  value: ReactNode;
  /** Optional override colour for the value (e.g. status-aware tinting). */
  valueColor?: string;
  /** Optional inline icon shown before the value. */
  icon?: ReactNode;
  /** Compact one-line variant (default) vs stacked block variant. */
  variant?: "row" | "stack";
}

/**
 * DetailsField — single key/value pair inside DetailsSection.
 *
 * Faithful port of the metadata grid rows from `details.jsx`. Two-column
 * layout (label | value) by default, with an optional stacked variant for
 * narrower drawers.
 */
export function DetailsField({
  label,
  value,
  valueColor,
  icon,
  variant = "row",
}: DetailsFieldProps) {
  if (variant === "stack") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-mesh-text-mute">
          {label}
        </span>
        <span
          className="font-mono text-[12px] text-mesh-text"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {icon != null ? <span className="mr-1.5 inline-flex align-middle">{icon}</span> : null}
          {value}
        </span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-3 text-[12px]">
      <span className="font-mono text-mesh-text-mute">{label}</span>
      <span
        className="min-w-0 break-words font-mono text-mesh-text"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {icon != null ? <span className="mr-1.5 inline-flex align-middle">{icon}</span> : null}
        {value}
      </span>
    </div>
  );
}
