"use client";

/**
 * SettingsWorkspaceHeader — shared header shell for `/settings/*` sub-routes.
 *
 * Faithful port of the `settings.jsx` header pattern from the mesh design
 * source. Provides eyebrow + breadcrumb back-link + title + sub-line +
 * optional right-side slot for save status / action chips.
 *
 * Mesh tokens only; CI design-token guard forbids raw Tailwind color
 * literals in this tree.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export interface SettingsWorkspaceHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Optional content rendered on the right side (e.g. save status pill). */
  right?: ReactNode;
  /** Override the default back-link target. */
  backHref?: string;
  backLabel?: string;
}

export function SettingsWorkspaceHeader({
  title,
  description,
  eyebrow = "Settings",
  right,
  backHref = "/settings",
  backLabel = "All settings",
}: SettingsWorkspaceHeaderProps) {
  return (
    <header
      className="flex flex-col gap-3 border-b border-mesh-border pb-4 md:flex-row md:items-end md:justify-between"
      data-testid="settings-workspace-header"
    >
      <div className="min-w-0 space-y-1.5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-mesh-text-mute transition-colors hover:text-mesh-accent"
          data-testid="settings-back-link"
        >
          <ArrowLeft className="h-3 w-3" />
          {backLabel}
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mesh-text-mute">
            {eyebrow}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-mesh-text-dim">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
