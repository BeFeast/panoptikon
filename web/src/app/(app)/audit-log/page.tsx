"use client";

import { ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-cyan-400" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          Audit log
        </h1>
      </div>
      <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ScrollText className="h-10 w-10 text-cyan-900/60" />
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
