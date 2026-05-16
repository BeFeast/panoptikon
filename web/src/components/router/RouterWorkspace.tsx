"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouterSelector } from "@/components/RouterSelector";

type RouterWorkspaceProps = {
  active: "mikrotik" | "pfsense" | "xiaomi";
  children: ReactNode;
};

export function RouterWorkspace({ active, children }: RouterWorkspaceProps) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-md border border-slate-800/80 bg-slate-950/80 p-3">
        <RouterSelector active={active} />
      </div>
      {children}
    </div>
  );
}

export function RouterWorkspaceLoading() {
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
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
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  return (
    <Card className="border-slate-800 bg-slate-950 shadow-none">
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0 space-y-3">
          <div className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${toneClass}`}>
            <AlertCircle className="h-3.5 w-3.5" />
            {tone === "rose" ? "Connection degraded" : "Action required"}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              {description}
            </p>
            {detail && (
              <p className="mt-2 font-mono text-xs text-slate-500">{detail}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          asChild
          className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 sm:w-auto"
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
