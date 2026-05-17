import type { ReactNode } from "react";
import { PlugZap, type LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  /** Bold headline answering "why is this empty?". */
  title: string;
  /** 1–2 sentence explanation shown below the title in dim text. */
  message: string;
  /** Optional inline command / snippet shown in faint mono under the action row. */
  hint?: ReactNode;
  /** Optional CTA node (primary + optional secondary button(s)). */
  action?: ReactNode;
  /**
   * Optional icon override for the decorative target — by default the source
   * blueprint mark (dashed circle + center dot over a faint grid) is rendered.
   * Pass a Lucide icon to replace the entire decorative element with a single
   * accent glyph (used by tighter inline variants).
   */
  icon?: LucideIcon;
  /** Render the tight `inline` variant — no decorative mark, smaller padding. */
  inline?: boolean;
  className?: string;
}

/**
 * EmptyState — central, "explain the why" empty surface.
 *
 * Faithful port of `StateEmpty` from `panopticon/project/states.jsx`. The
 * decorative blueprint mark (faint grid + dashed circle + accent dot) reads
 * as a target / scope, reinforcing that the page is waiting for first data
 * rather than being broken.
 *
 * @example
 * <EmptyState
 *   title="No agents connected yet"
 *   message="Agents stream live metrics back to Panoptikon. Install one on any host to get started."
 *   hint={<code>curl -sSL https://core.lan/install.sh | sh</code>}
 *   action={
 *     <>
 *       <Button>Generate agent token</Button>
 *       <Button variant="outline">Installation docs</Button>
 *     </>
 *   }
 * />
 */
export function EmptyState({
  title,
  message,
  hint,
  action,
  icon: IconOverride,
  inline = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-component="mesh-empty-state"
      data-variant={inline ? "inline" : "default"}
      className={className}
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "var(--radius)",
        padding: inline ? 20 : 36,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      {IconOverride ? (
        <IconOverride
          aria-hidden="true"
          size={inline ? 22 : 28}
          color="#38bdf8"
          strokeWidth={1.5}
        />
      ) : inline ? (
        <PlugZap
          aria-hidden="true"
          size={22}
          color="#38bdf8"
          strokeWidth={1.5}
        />
      ) : (
        <EmptyBlueprint />
      )}
      <div>
        <h3
          style={{
            font: "600 16px var(--font-sans, system-ui, sans-serif)",
            color: "#e9f0fc",
            margin: 0,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            font: "400 12.5px var(--font-sans, system-ui, sans-serif)",
            color: "#98aecf",
            margin: "6px 0 0",
            maxWidth: 340,
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
      </div>
      {action ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {action}
        </div>
      ) : null}
      {hint ? (
        <div
          style={{
            font: "400 10.5px var(--font-mono, monospace)",
            color: "#3a5278",
            marginTop: 6,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Decorative target/blueprint mark used as the default EmptyState illustration.
 * Renders a faint 12px grid pattern with a dashed accent circle and a solid
 * accent dot in the center, matching the source SVG verbatim.
 */
function EmptyBlueprint() {
  return (
    <svg
      width="120"
      height="80"
      viewBox="0 0 120 80"
      aria-hidden="true"
      focusable="false"
      data-component="mesh-empty-blueprint"
    >
      <defs>
        <pattern
          id="mesh-empty-grid"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M12 0 L0 0 0 12"
            fill="none"
            stroke="rgba(96,144,212,0.20)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="120" height="80" fill="url(#mesh-empty-grid)" />
      <circle
        cx="60"
        cy="40"
        r="14"
        fill="#091633"
        stroke="#38bdf8"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      <circle cx="60" cy="40" r="3" fill="#38bdf8" />
    </svg>
  );
}
