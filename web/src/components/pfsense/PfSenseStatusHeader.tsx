"use client";

import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PfsenseStatus } from "@/lib/types";

export function PfSenseStatusHeader({ status }: { status: PfsenseStatus }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Shield className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">pfSense Firewall</h1>
          <p className="text-xs text-slate-500">
            {status.hostname ?? "pfSense"}{" "}
            {status.version && (
              <span className="text-slate-600">&middot; pfSense {status.version}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
  );
}
