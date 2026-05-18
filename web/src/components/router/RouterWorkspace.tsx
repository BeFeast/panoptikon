"use client";

/**
 * RouterWorkspace — workspace shell + status surfaces.
 *
 * After the literal port of router-page.jsx + router-header.jsx, the actual
 * header chrome (icon tile + title + status pill + meta row + actions) lives
 * in `./RouterHeader`. This file re-exports a backwards-compatible
 * `RouterWorkspaceHeader` that delegates to the new component so callers
 * (MikrotikRouter, PfSenseStatusHeader, XiaomiRouter) don't have to be
 * rewritten in lockstep.
 *
 * The vendor switcher chrome is preserved per task brief: the design's
 * single "Router" sidebar item maps to Panoptikon's three vendor backends
 * via `/router/{mikrotik,pfsense,xiaomi}` routes. <RouterSelector /> renders
 * those as toggle buttons inside the workspace.
 */

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  AlertCircle,
  Router as RouterLucide,
  Settings,
  Shield,
  Network,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouterSelector } from "@/components/RouterSelector";
import {
  RouterHeader,
  type RouterHeaderAction,
  type RouterHeaderMeta,
} from "@/components/router/RouterHeader";

// ── Workspace shell ─────────────────────────────────────────────

type RouterVendor = "mikrotik" | "pfsense" | "xiaomi";

type RouterWorkspaceProps = {
  active: RouterVendor;
  children: ReactNode;
};

export function RouterWorkspace({ active, children }: RouterWorkspaceProps) {
  return (
    <div className="min-w-0 space-y-3" data-testid="router-workspace">
      <div className="card" style={{ padding: 10 }}>
        <RouterSelector active={active} />
      </div>
      {children}
    </div>
  );
}

// ── Header — backwards-compatible adapter onto RouterHeader ──────

type RouterHeaderTone = "accent" | "primary" | "amber";

const TONE_TO_COLOR: Record<RouterHeaderTone, string> = {
  accent: "var(--accent-cyan)",
  primary: "#2563eb",
  amber: "#fbbf24",
};

/** Vendor → default lucide icon mapping, used when caller does not override. */
const TONE_TO_ICON: Record<RouterHeaderTone, LucideIcon> = {
  accent: RouterLucide,
  primary: Shield,
  amber: Network,
};

export type RouterWorkspaceHeaderProps = {
  /** Eyebrow text above the title — preserved for compat; rendered as the
   *  first item in the design's mono meta row. */
  eyebrow: string;
  /** Main router display name — e.g. "MikroTik Router". */
  title: string;
  /** Vendor mark / icon glyph rendered inside the 64×64 design tile. */
  icon: ReactNode;
  /** Visual tone of the icon tile and accent. */
  tone?: RouterHeaderTone;
  /** Subtitle line under the title — appended to the design's meta row. */
  subtitle?: ReactNode;
  /** Connection state. */
  connected: boolean;
  /** Optional pill label override. */
  statusLabel?: string;
  /** Optional metadata chips rendered after the eyebrow / subtitle. */
  meta?: Array<{ label: string; value: ReactNode; mono?: boolean }>;
  /** Optional action buttons rendered far right. */
  actions?: ReactNode;
};

/**
 * Backwards-compatible adapter. Accepts the legacy prop shape but renders
 * the literal-port `RouterHeader` (the design's 64×64 icon tile + h1.t-h1
 * title + mono meta row in the `.card` recipe).
 *
 * The `eyebrow` / `subtitle` / legacy `meta` items are concatenated into the
 * design's single mono meta row, separated by `·` faint dividers.
 *
 * The `icon` ReactNode is rendered inside the 64×64 tile; if a LucideIcon
 * was passed via the new API, it is used directly. The `tone` controls the
 * tile foreground colour.
 */
export function RouterWorkspaceHeader({
  eyebrow,
  title,
  icon,
  tone = "accent",
  subtitle,
  connected,
  statusLabel,
  meta,
  actions,
}: RouterWorkspaceHeaderProps) {
  const iconColor = TONE_TO_COLOR[tone];
  const FallbackIcon = TONE_TO_ICON[tone];

  // Coerce legacy meta into the new shape: `label · value` strings.
  const flatMeta: RouterHeaderMeta[] = [];
  if (eyebrow) {
    flatMeta.push({ label: eyebrow.toUpperCase(), color: iconColor });
  }
  if (subtitle) {
    flatMeta.push({
      label:
        typeof subtitle === "string"
          ? subtitle
          : reactNodeToText(subtitle),
    });
  }
  if (meta && meta.length > 0) {
    for (const m of meta) {
      flatMeta.push({
        label: `${m.label} ${reactNodeToText(m.value)}`,
      });
    }
  }

  return (
    <div data-testid="router-header">
      <RouterHeader
        title={title}
        connected={connected}
        statusLabel={statusLabel?.toUpperCase()}
        icon={FallbackIcon}
        iconColor={iconColor}
        meta={flatMeta}
      />
      {/* If caller passed legacy `actions` as ReactNode, render a secondary
          row beneath. New callers should pass RouterHeaderAction[] directly
          via the RouterHeader component instead. */}
      {actions && (
        <div
          className="card"
          style={{
            padding: "8px 18px",
            marginTop: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {actions}
        </div>
      )}
      {/* Icon is preserved in the prop shape for backwards compat but the
          design's 64×64 tile is filled by the LucideIcon mapped from `tone`.
          Callers passing a custom ReactNode icon (rare) lose visual weight
          here — they should migrate to <RouterHeader icon={...} /> directly. */}
      <span style={{ display: "none" }}>{icon}</span>
    </div>
  );
}

function reactNodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeToText).join(" ");
  }
  // For ReactElement / Fragment etc. we can't safely stringify without
  // rendering. Return empty so the meta slot is silently dropped rather
  // than emitting `[object Object]`.
  return "";
}

// ── Loading / state surfaces (kept as before) ────────────────────

export function RouterWorkspaceLoading() {
  return (
    <div className="space-y-3" data-testid="router-workspace-loading">
      <div className="card" style={{ padding: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

type RouterWorkspaceStateProps = {
  title: string;
  description: string;
  settingsHref: string;
  settingsLabel: string;
  tone?: "amber" | "rose";
  detail?: string | null;
};

export function RouterWorkspaceState({
  title,
  description,
  settingsHref,
  settingsLabel,
  tone = "amber",
  detail,
}: RouterWorkspaceStateProps) {
  const toneClass =
    tone === "rose"
      ? "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]"
      : "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]";

  return (
    <Card className="shadow-none" data-testid="router-empty-state">
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0 space-y-3">
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${toneClass}`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {tone === "rose" ? "Connection degraded" : "Action required"}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-mesh-text-dim">
              {description}
            </p>
            {detail && (
              <p className="mt-2 font-mono text-xs text-mesh-text-mute">
                {detail}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          asChild
          className="w-full border-mesh-border text-mesh-text hover:bg-mesh-surface-2 sm:w-auto"
        >
          <Link href={settingsHref}>
            <Settings className="mr-2 h-4 w-4" />
            {settingsLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// Re-export the new RouterHeader primitive for new callers.
export {
  RouterHeader,
  type RouterHeaderAction,
  type RouterHeaderMeta,
} from "@/components/router/RouterHeader";

// Fragment kept available for callers building inline header metadata.
export { Fragment as _RouterFragment };
