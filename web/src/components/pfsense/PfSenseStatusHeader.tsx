"use client";

import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PfsenseStatus } from "@/lib/types";

export function PfSenseStatusHeader({ status }: { status: PfsenseStatus }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/90 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/10">
            <Shield className="h-5 w-5 text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-blue-300/80">
              firewall workspace
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-white">
              pfSense Router
            </h1>
            <p className="truncate text-xs text-slate-500">
              {status.hostname ?? "pfSense"}{" "}
              {status.version && (
                <span className="text-slate-600">&middot; pfSense {status.version}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.reachable ? (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            >
              &#9679; Connected
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-rose-500/30 bg-rose-500/10 text-rose-400"
            >
              &#9679; Unreachable
            </Badge>
          )}
          {status.uptime && (
            <Badge variant="outline" className="border-slate-800 text-slate-400">
              Uptime: {status.uptime}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
