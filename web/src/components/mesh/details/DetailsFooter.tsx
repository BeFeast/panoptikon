"use client";

import type { ReactNode } from "react";

export interface DetailsFooterProps {
  /** Left-aligned status / hint text (e.g. "agent online · 38ms"). */
  hint?: ReactNode;
  /** Right-aligned action button cluster. */
  actions?: ReactNode;
}

/**
 * DetailsFooter — sticky footer for the DetailsDrawer body.
 *
 * Houses the action button cluster (Ping / SSH / Rescan / Edit etc) and an
 * optional left-aligned hint. Sticks to the bottom of the drawer regardless
 * of body content height.
 */
export function DetailsFooter({ hint, actions }: DetailsFooterProps) {
  return (
    <div
      data-component="mesh-details-footer"
      className="mt-auto flex items-center justify-between gap-3 border-t border-mesh-border bg-mesh-surface-1/70 px-4 py-3"
    >
      <div className="font-mono text-[11px] text-mesh-text-mute">{hint}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
