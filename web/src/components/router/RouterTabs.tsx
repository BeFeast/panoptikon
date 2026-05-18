"use client";

/**
 * RouterTabs — literal TSX port of
 *   /tmp/panopticon-design/panopticon/project/router-header.jsx → `RouterTabs`
 *
 * Adaptations vs the source:
 *   - JSX → TSX (type annotations only).
 *   - Mock MikroTik-only tab list is now a prop so pfSense / Xiaomi pages
 *     can supply their own tab set without forking the recipe.
 *   - Click handler accepts a callback (the design source had no behaviour,
 *     since it was a static artboard).
 *
 * Token substitutions:
 *   var(--accent-cyan)    → kept (already aliased in tokens.css to #38bdf8)
 *   var(--status-warning) → kept (already aliased to #fbbf24)
 *   var(--border)         → rgba(96,144,212,0.20)
 */

import type { CSSProperties } from "react";

export type RouterTab = {
  id: string;
  label: string;
  /** Optional small amber count badge next to the label (e.g. "2"). */
  badge?: string | number;
};

export type RouterTabsProps = {
  tabs: RouterTab[];
  active: string;
  onChange?: (id: string) => void;
};

const BAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
  flexWrap: "wrap",
};

export function RouterTabs({ tabs, active, onChange }: RouterTabsProps) {
  return (
    <div style={BAR_STYLE} role="tablist" data-testid="router-tabs">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`router-tab-${t.id}`}
            onClick={() => onChange?.(t.id)}
            style={{
              padding: "8px 14px",
              font: `${isActive ? 600 : 500} 12.5px var(--font-sans)`,
              color: isActive ? "var(--text)" : "var(--text-mute)",
              borderBottom: isActive
                ? "2px solid var(--accent-cyan)"
                : "2px solid transparent",
              marginBottom: -1,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "transparent",
              border: "none",
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
            }}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== null && t.badge !== "" && (
              <span
                style={{
                  padding: "1px 5px",
                  background: "rgba(245,158,11,0.18)",
                  color: "#fbbf24",
                  borderRadius: 3,
                  font: "500 9.5px var(--font-mono)",
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
