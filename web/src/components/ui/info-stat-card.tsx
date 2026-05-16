import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface InfoStatCardProps {
  icon: React.ReactNode;
  iconColorClass: string;
  label: string;
  value: string;
  className?: string;
}

/**
 * Reusable card for displaying a single icon + label + value stat.
 * Purely informational — no hover, shadow or interactive affordance.
 *
 * Layout tokens:
 *  - Icon block: 40×40 (h-10 w-10), centered, rounded-lg
 *  - Label:      11px uppercase tracking-wider, slate-500
 *  - Value:      14px (text-sm) semibold white, truncated with title tooltip
 *  - Min height: 80px (min-h-[5rem]) for comfortable card rhythm
 *  - Gap:        16px (gap-4) between icon and text
 *  - Padding:    16px all around (p-4)
 */
export function InfoStatCard({
  icon,
  iconColorClass,
  label,
  value,
  className,
}: InfoStatCardProps) {
  return (
    <Card
      className={cn(
        "col-span-1 border-slate-800/50 bg-slate-950/70 shadow-none",
        className,
      )}
    >
      <CardContent className="flex min-h-[5rem] items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconColorClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p
            className="truncate text-sm font-semibold text-white"
            title={value !== "\u2014" ? value : undefined}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
