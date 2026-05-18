"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/mesh/Icon";

export interface DetailsHeaderProps {
  /** Icon glyph rendered in the 56×56 accent tile. */
  icon?: IconName;
  iconColor?: string;
  /** Identity title (h1). */
  title: ReactNode;
  /** Optional status pill / chip cluster shown next to the title. */
  pills?: ReactNode;
  /** Mono meta strip below the title (IP · MAC · vlan etc). */
  meta?: ReactNode;
  /** Right-aligned action buttons. */
  actions?: ReactNode;
}

/**
 * DetailsHeader — identity header for the shared mesh DetailsDrawer.
 *
 * Faithful port of the device/agent detail header from `details.jsx`. Padding,
 * icon tile, h1, pill row, mono meta strip and action cluster are arranged the
 * same way so consumers can drop in shadcn buttons / status pills without any
 * extra wrapping.
 */
export function DetailsHeader({
  icon = "plug",
  iconColor = "var(--mesh-accent, #38bdf8)",
  title,
  pills,
  meta,
  actions,
}: DetailsHeaderProps) {
  return (
    <div
      data-component="mesh-details-header"
      className="flex items-start gap-4 border-b border-mesh-border bg-mesh-surface-1/70 p-4 pr-10"
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center mesh-card-2"
        style={{ color: iconColor }}
      >
        <Icon name={icon} size={24} stroke={1.4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 truncate text-base font-semibold text-mesh-text">{title}</h2>
          {pills}
        </div>
        {meta ? (
          <div className="mt-1.5 font-mono text-[11.5px] leading-snug text-mesh-text-dim">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
