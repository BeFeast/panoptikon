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
    variant === "success" ? "text-emerald-500/70" : "text-slate-600";
  const titleColor =
    variant === "success" ? "text-emerald-400" : "text-slate-400";

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className={`mb-4 h-12 w-12 ${iconColor}`} />
      <p className={`text-lg font-medium ${titleColor}`}>{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>
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
