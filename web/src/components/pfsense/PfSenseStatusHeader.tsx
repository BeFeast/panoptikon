"use client";

import { Shield } from "lucide-react";
import type { PfsenseStatus } from "@/lib/types";
import { RouterWorkspaceHeader } from "@/components/router/RouterWorkspace";

export function PfSenseStatusHeader({ status }: { status: PfsenseStatus }) {
  const subtitle = (
    <>
      {status.hostname ?? "pfSense"}
      {status.version && (
        <>
          {" "}
          <span className="text-mesh-text-mute">&middot; pfSense {status.version}</span>
        </>
      )}
    </>
  );

  const meta: { label: string; value: string; mono?: boolean }[] = [];
  if (status.uptime) {
    meta.push({ label: "uptime", value: status.uptime, mono: true });
  }
  if (status.version) {
    meta.push({ label: "version", value: status.version, mono: true });
  }

  return (
    <RouterWorkspaceHeader
      eyebrow="firewall workspace"
      title="pfSense Router"
      tone="primary"
      icon={<Shield className="h-5 w-5" />}
      subtitle={subtitle}
      connected={Boolean(status.reachable)}
      meta={meta}
    />
  );
}
