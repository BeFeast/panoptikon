"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Reusable empty-state placeholder shown when a section has no data.
 * Displays an icon, a heading, and a helpful hint pointing users
 * toward the next action they should take.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="mb-4 h-12 w-12 text-slate-600" />
      <p className="text-lg font-medium text-slate-400">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>
    </div>
  );
}
