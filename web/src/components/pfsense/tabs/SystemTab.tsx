"use client";

import { Monitor, Clock, Cpu, MemoryStick, HardDrive, Globe } from "lucide-react";
import { InfoStatCard } from "@/components/ui/info-stat-card";
import type { PfsenseStatus } from "@/lib/types";

function formatMemoryMB(bytes: number | null): string {
  if (bytes === null) return "\u2014";
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function SystemTab({ status }: { status: PfsenseStatus }) {
  const memPercent =
    status.memory_total && status.memory_used
      ? `${((status.memory_used / status.memory_total) * 100).toFixed(1)}%`
      : "\u2014";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <InfoStatCard
        icon={<Monitor className="h-5 w-5 text-blue-400" />}
        iconColorClass="bg-blue-500/10"
        label="Hostname"
        value={status.hostname ?? "\u2014"}
      />
      <InfoStatCard
        icon={<Globe className="h-5 w-5 text-cyan-400" />}
        iconColorClass="bg-cyan-500/10"
        label="Version"
        value={status.version ?? "\u2014"}
      />
      <InfoStatCard
        icon={<Clock className="h-5 w-5 text-emerald-400" />}
        iconColorClass="bg-emerald-500/10"
        label="Uptime"
        value={status.uptime ?? "\u2014"}
      />
      <InfoStatCard
        icon={<Cpu className="h-5 w-5 text-amber-400" />}
        iconColorClass="bg-amber-500/10"
        label="CPU Usage"
        value={status.cpu_usage !== null ? `${status.cpu_usage}%` : "\u2014"}
      />
      <InfoStatCard
        icon={<MemoryStick className="h-5 w-5 text-purple-400" />}
        iconColorClass="bg-purple-500/10"
        label="Memory Usage"
        value={
          status.memory_used !== null
            ? `${formatMemoryMB(status.memory_used)} / ${formatMemoryMB(status.memory_total)} (${memPercent})`
            : "\u2014"
        }
      />
      <InfoStatCard
        icon={<HardDrive className="h-5 w-5 text-rose-400" />}
        iconColorClass="bg-rose-500/10"
        label="Platform"
        value={status.platform ?? "\u2014"}
      />
    </div>
  );
}
