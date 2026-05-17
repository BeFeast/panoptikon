"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reusable empty-state placeholder shown when a section has no data.
 * Displays an icon, a heading, a helpful hint, and an optional CTA button.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  variant = "default",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Label for the optional CTA button */
  actionLabel?: string;
  /** Click handler for the CTA button */
  onAction?: () => void;
  /** If provided, renders the CTA as a link */
  actionHref?: string;
  /** Visual variant: "default" is neutral, "success" uses green tones */
  variant?: "default" | "success";
}) {
  const iconColor =
    variant === "success" ? "text-emerald-400/80" : "text-cyan-300/70";
  const titleColor =
    variant === "success" ? "text-emerald-300" : "text-slate-200";

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-mesh-border-strong bg-mesh-surface-1 px-5 py-12 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-mesh-border-strong bg-mesh-surface-1">
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <p className={`text-sm font-semibold uppercase tracking-[0.16em] ${titleColor}`}>{title}</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      {actionLabel && (actionHref || onAction) && (
        actionHref ? (
          <a href={actionHref}>
            <Button className="mt-5" size="sm">
              {actionLabel}
            </Button>
          </a>
        ) : (
          <Button className="mt-5" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}
