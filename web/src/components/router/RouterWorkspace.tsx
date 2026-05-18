"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouterSelector } from "@/components/RouterSelector";
import { StatusDot } from "@/components/mesh/StatusDot";

// ── Workspace shell ─────────────────────────────────────────────

type RouterVendor = "mikrotik" | "pfsense" | "xiaomi";

type RouterWorkspaceProps = {
  active: RouterVendor;
  children: ReactNode;
};

export function RouterWorkspace({ active, children }: RouterWorkspaceProps) {
  return (
    <div className="min-w-0 space-y-5" data-testid="router-workspace">
      <div className="mesh-card p-3">
        <RouterSelector active={active} />
      </div>
      {children}
    </div>
  );
}

// ── Header (ports `router-header.jsx`) ────────────────────────

type RouterHeaderTone = "accent" | "primary" | "amber";

const TONE_CLASS: Record<RouterHeaderTone, { ring: string; bg: string; text: string; eyebrow: string }> = {
  accent: {
    ring: "border-mesh-accent/20",
    bg: "bg-mesh-accent/10",
    text: "text-mesh-accent",
    eyebrow: "text-mesh-accent/80",
  },
  primary: {
    ring: "border-mesh-primary/20",
    bg: "bg-mesh-primary/10",
    text: "text-mesh-primary",
    eyebrow: "text-mesh-primary/80",
  },
  amber: {
    ring: "border-[#fbbf24]/30",
    bg: "bg-[#fbbf24]/10",
    text: "text-[#fbbf24]",
    eyebrow: "text-[#fbbf24]/90",
  },
};

export type RouterWorkspaceHeaderProps = {
  /** Eyebrow text above the title — e.g. "RouterOS workspace". */
  eyebrow: string;
  /** Main router display name — e.g. "MikroTik Router". */
  title: string;
  /** Vendor mark / icon glyph rendered inside the rounded badge tile. */
  icon: ReactNode;
  /** Visual tone of the icon tile and eyebrow text. */
  tone?: RouterHeaderTone;
  /** Subtitle line under the title — e.g. host / model. */
  subtitle?: ReactNode;
  /** Connection state. */
  connected: boolean;
  /** Optional human-readable label override for the status pill. */
  statusLabel?: string;
  /** Optional metadata chips rendered next to the status pill. */
  meta?: Array<{ label: string; value: ReactNode; mono?: boolean }>;
  /** Optional action buttons rendered far right. */
  actions?: ReactNode;
};

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
  const palette = TONE_CLASS[tone];
  const pillLabel = statusLabel ?? (connected ? "Connected" : "Unreachable");
  const pillClass = connected
    ? "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
    : "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]";

  return (
    <div
      data-testid="router-header"
      className="mesh-card p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md border ${palette.ring} ${palette.bg} ${palette.text}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p
              className={`text-[11px] font-medium uppercase tracking-wider ${palette.eyebrow}`}
            >
              {eyebrow}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
                {title}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pillClass}`}
              >
                <StatusDot
                  status={connected ? "online" : "offline"}
                  pulse={connected}
                  size={6}
                />
                {pillLabel}
              </span>
            </div>
            {subtitle && (
              <p className="mt-1 truncate text-xs text-mesh-text-mute">
                {subtitle}
              </p>
            )}
            {meta && meta.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-mesh-text-dim">
                {meta.map((m, i) => (
                  <span key={`${m.label}-${i}`} className="inline-flex items-center gap-1">
                    <span className="text-mesh-text-mute">{m.label}</span>
                    <span className={m.mono ? "font-mono text-mesh-text" : "text-mesh-text"}>
                      {m.value}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

// ── Loading / state surfaces ────────────────────────────────

export function RouterWorkspaceLoading() {
  return (
    <div className="space-y-5" data-testid="router-workspace-loading">
      <div className="mesh-card p-4">
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
    <Card
      className="shadow-none"
      data-testid="router-empty-state"
    >
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
              <p className="mt-2 font-mono text-xs text-mesh-text-mute">{detail}</p>
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
