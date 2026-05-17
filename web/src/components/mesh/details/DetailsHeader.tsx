"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/mesh/Icon";

export interface DetailsHeaderProps {
  /** Primary title — appears as the H1 of the surface. */
  title: ReactNode;
  /** Small uppercase pre-title shown above the H1 (e.g. "Device"). */
  eyebrow?: ReactNode;
  /**
   * Optional iconic mark rendered to the left of the title block — mirrors the
   * 64×64 framed glyph from the source `DeviceDetail` / `AgentDetail` shells.
   */
  icon?: IconName;
  /** Optional accent colour for the icon glyph (defaults to mesh accent). */
  iconColor?: string;
  /**
   * Meta row beneath the title — typically a mono key/value strip
   * (`10.0.1.12 · a4:bb:6d:42:18:90 · DSM 7.2.1`).
   */
  meta?: ReactNode;
  /** Secondary actions slot (right side of the header). */
  actions?: ReactNode;
  /** Close handler — when provided we render the trailing close glyph. */
  onClose?: () => void;
  className?: string;
}

/**
 * DetailsHeader — sticky identity bar at the top of a detail drawer.
 *
 * Faithful port of the identity card from `panopticon/project/details.jsx`
 * (`DeviceDetail` / `AgentDetail` shells). Pure presentational; consumers
 * compose actions via the `actions` slot and wire the close affordance via
 * `onClose` so it lives inside drawer or dialog scopes equally well.
 */
export function DetailsHeader({
  title,
  eyebrow,
  icon,
  iconColor = "#38bdf8",
  meta,
  actions,
  onClose,
  className,
}: DetailsHeaderProps) {
  return (
    <header
      data-component="mesh-details-header"
      className={className}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "18px 20px",
        background: "hsl(var(--card))",
        borderBottom: "1px solid hsl(var(--border))",
        backdropFilter: "saturate(140%) blur(6px)",
      }}
    >
      {icon ? (
        <div
          data-slot="mesh-details-header-icon"
          style={{
            width: 56,
            height: 56,
            background: "#0e2148",
            border: "1px solid rgba(96,144,212,0.40)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={26} stroke={1.4} color={iconColor} />
        </div>
      ) : null}

      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          <div
            data-slot="mesh-details-header-eyebrow"
            style={{
              font: "600 10px var(--font-sans, system-ui, sans-serif)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "#5d7799",
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            font: "600 20px var(--font-sans, system-ui, sans-serif)",
            color: "#e9f0fc",
            margin: 0,
            lineHeight: 1.15,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {title}
        </h1>
        {meta ? (
          <div
            data-slot="mesh-details-header-meta"
            style={{
              marginTop: 6,
              font: "500 12px var(--font-mono, monospace)",
              color: "#98aecf",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {meta}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div
          data-slot="mesh-details-header-actions"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      ) : null}

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-slot="mesh-details-header-close"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm, 6px)",
            background: "transparent",
            border: "1px solid transparent",
            color: "#98aecf",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </header>
  );
}
