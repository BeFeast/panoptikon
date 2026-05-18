"use client";

/**
 * RouterHeader — literal TSX port of
 *   /tmp/panopticon-design/panopticon/project/router-header.jsx → `RouterHeader`
 *
 * Pinned verbatim copy of the JSX source lives at
 *   web/src/components/router/_design-source/router-header.jsx
 *
 * Adaptations vs the source (allowed by Source Code Port Protocol):
 *   - JSX → TSX (type annotations only, no structural changes)
 *   - `<Icon name="X" />` (design's icon registry) → lucide-react component
 *     with the same glyph & size & stroke
 *   - Token substitutions for shadcn-conflict variables, per task brief:
 *       var(--border)        → rgba(96,144,212,0.20)
 *       var(--primary)       → #2563eb
 *       var(--status-online) → #4ade80
 *       var(--status-offline)→ #fb7185
 *     All other `var(--X)` references stay as-is (resolved at the :root
 *     declarations in globals.css).
 *   - Static demo strings (model number, RouterOS version, uptime, mgmt IP)
 *     are replaced by props so per-vendor pages can wire real data.
 */

import { Fragment, type CSSProperties } from "react";
import {
  type LucideIcon,
  Router as RouterIcon,
  RefreshCcw,
  Server,
  TerminalSquare,
} from "lucide-react";
import { StatusDot } from "@/components/mesh/StatusDot";

export type RouterHeaderAction = {
  label: string;
  icon: LucideIcon;
  /** Primary CTA receives the .btn.btn-primary recipe. */
  primary?: boolean;
  onClick?: () => void;
  href?: string;
};

export type RouterHeaderMeta = {
  /** Visible label, e.g. "RouterOS 7.16" or "uptime 14d 6h 22m". */
  label: string;
  /** Optional tint colour for the value — defaults to var(--text-dim). */
  color?: string;
};

export type RouterHeaderProps = {
  /** Title shown next to the status pill (h1.t-h1). */
  title: string;
  /** Optional brand-coloured icon rendered inside the 64×64 square. */
  icon?: LucideIcon;
  /** Tile-icon tint — defaults to var(--accent-cyan), matching the design. */
  iconColor?: string;
  /** Connection state controls the green/rose pill on the right of title. */
  connected: boolean;
  /** Override pill label (defaults to "CONNECTED" / "OFFLINE"). */
  statusLabel?: string;
  /** Mono-font metadata row under the title. */
  meta?: RouterHeaderMeta[];
  /** Action buttons rendered on the far right (matches design's btn row). */
  actions?: RouterHeaderAction[];
};

const FAINT: CSSProperties = { color: "var(--text-faint)" };

export function RouterHeader({
  title,
  icon: Icon = RouterIcon,
  iconColor = "var(--accent-cyan)",
  connected,
  statusLabel,
  meta,
  actions,
}: RouterHeaderProps) {
  const pillLabel = statusLabel ?? (connected ? "CONNECTED" : "OFFLINE");
  const pillBg = connected ? "rgba(74,222,128,0.10)" : "rgba(251,113,133,0.10)";
  const pillBorder = connected
    ? "rgba(74,222,128,0.30)"
    : "rgba(251,113,133,0.30)";
  const pillColor = connected ? "#4ade80" : "#fb7185";

  return (
    <div
      className="card"
      data-testid="router-header"
      style={{
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          background: "var(--surface-2)",
          border: "var(--hairline) solid var(--border-strong)",
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: iconColor,
          flexShrink: 0,
        }}
      >
        <Icon size={28} strokeWidth={1.4} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <h1 className="t-h1" style={{ margin: 0 }}>
            {title}
          </h1>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 20,
              padding: "0 8px",
              borderRadius: "var(--radius-pill)",
              background: pillBg,
              border: `var(--hairline) solid ${pillBorder}`,
              color: pillColor,
              font: "600 10px var(--font-sans)",
              letterSpacing: "0.06em",
            }}
          >
            <StatusDot
              status={connected ? "online" : "offline"}
              pulse={connected}
              size={5}
            />
            {pillLabel}
          </span>
        </div>
        {meta && meta.length > 0 && (
          <div
            className="mono"
            style={{
              font: "500 12px var(--font-mono)",
              color: "var(--text-dim)",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            {meta.map((m, i) => (
              <Fragment key={`${m.label}-${i}`}>
                {i > 0 && <span style={FAINT}>·</span>}
                <span style={m.color ? { color: m.color } : undefined}>
                  {m.label}
                </span>
              </Fragment>
            ))}
            {/* Fragment is React.Fragment imported above; no extra DOM. */}
          </div>
        )}
      </div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", gap: 6 }}>
          {actions.map((a) => (
            <ActionButton key={a.label} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action }: { action: RouterHeaderAction }) {
  const Icon = action.icon;
  const className = action.primary ? "btn btn-primary" : "btn";
  if (action.href) {
    return (
      <a href={action.href} className={className}>
        <Icon size={12} />
        <span>{action.label}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={className}
    >
      <Icon size={12} />
      <span>{action.label}</span>
    </button>
  );
}

/** Default action set matching router-header.jsx (Reboot · Backup · Open terminal). */
export const DEFAULT_ROUTER_ACTIONS: RouterHeaderAction[] = [
  { label: "Reboot", icon: RefreshCcw },
  { label: "Backup", icon: Server },
  { label: "Open terminal", icon: TerminalSquare, primary: true },
];
