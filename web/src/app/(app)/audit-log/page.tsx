"use client";

import { ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-mesh-accent" />
        <h1 className="t-h1" style={{ margin: 0 }}>
          Audit log
        </h1>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ScrollText className="h-10 w-10 text-mesh-text-faint/80" />
          <p className="text-sm text-mesh-text-dim">
            Audit events stream not yet wired to this surface.
          </p>
          <p className="font-mono text-xs text-mesh-text-mute">
            Authentication, configuration, and policy changes will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
