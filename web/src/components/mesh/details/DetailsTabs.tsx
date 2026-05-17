"use client";

import type { ReactNode } from "react";

export interface DetailsTab {
  id: string;
  label: string;
  /** Optional badge count rendered next to the label (e.g. alerts). */
  badge?: ReactNode;
  badgeTone?: "info" | "warning" | "offline" | "online";
}

export interface DetailsTabsProps {
  tabs: DetailsTab[];
  active: string;
  onChange: (id: string) => void;
}

const BADGE_TONE: Record<NonNullable<DetailsTab["badgeTone"]>, string> = {
  info: "bg-mesh-primary-soft text-mesh-accent",
  warning: "bg-[#fbbf24]/20 text-[#fbbf24]",
  offline: "bg-[#fb7185]/20 text-[#fb7185]",
  online: "bg-[#4ade80]/20 text-[#4ade80]",
};

/**
 * DetailsTabs — underline tab strip used inside the details drawer.
 *
 * Faithful port of the tab nav in `details.jsx`. Active tab gets the cyan
 * accent underline, inactive tabs stay muted. Controlled component so the
 * caller owns the active state.
 */
export function DetailsTabs({ tabs, active, onChange }: DetailsTabsProps) {
  return (
    <div
      data-component="mesh-details-tabs"
      className="flex items-center gap-0 border-b border-mesh-border bg-mesh-surface-1/40 px-3"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`details-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={
              "relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors " +
              (isActive
                ? "border-mesh-accent font-semibold text-mesh-text"
                : "border-transparent font-medium text-mesh-text-mute hover:text-mesh-text-dim")
            }
          >
            {tab.label}
            {tab.badge != null ? (
              <span
                className={
                  "rounded px-1.5 py-[1px] font-mono text-[9.5px] " +
                  BADGE_TONE[tab.badgeTone ?? "info"]
                }
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
