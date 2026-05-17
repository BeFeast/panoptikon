"use client";

import { ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-mesh-accent" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          Audit log
        </h1>
      </div>
      <Card className="border-mesh-border-strong bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ScrollText className="h-10 w-10 text-mesh-text-faint/80" />
          <p className="text-sm text-slate-400">
            Audit events stream not yet wired to this surface.
          </p>
          <p className="font-mono text-xs text-slate-600">
            Authentication, configuration, and policy changes will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
