"use client";

import type { ReactNode } from "react";

export interface DetailsSectionProps {
  /** Card title (h3-equivalent). */
  title?: ReactNode;
  /** Right-aligned meta strip (e.g. "5m buckets · 288 points"). */
  meta?: ReactNode;
  /** Optional trailing toolbar element shown after `meta`. */
  trailing?: ReactNode;
  /** Body content. */
  children: ReactNode;
  /** Visual variant — `card` (default) renders chrome, `bare` is flush. */
  variant?: "card" | "bare";
  /** Forwarded test id. */
  "data-testid"?: string;
}

/**
 * DetailsSection — labelled card surface used inside DetailsDrawer bodies.
 *
 * Faithful port of the recurring `card` block from `details.jsx` (system
 * metrics card, port list card, recent activity card, etc). Title row keeps
 * the h3 + mono meta alignment from the source so consumers don't have to
 * re-implement it.
 */
export function DetailsSection({
  title,
  meta,
  trailing,
  children,
  variant = "card",
  ...rest
}: DetailsSectionProps) {
  const testId = rest["data-testid"];
  return (
    <section
      data-component="mesh-details-section"
      data-testid={testId}
      className={
        variant === "card"
          ? "flex flex-col gap-2.5 rounded-md border border-mesh-border bg-mesh-surface-1 p-3.5"
          : "flex flex-col gap-2.5"
      }
    >
      {title != null || meta != null || trailing != null ? (
        <div className="flex items-baseline justify-between gap-3">
          {title != null ? (
            <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wider text-mesh-text-dim">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {meta != null ? (
              <span className="font-mono text-[11px] text-mesh-text-mute">{meta}</span>
            ) : null}
            {trailing}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 text-[12.5px] text-mesh-text">{children}</div>
    </section>
  );
}
