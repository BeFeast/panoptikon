"use client";

import { useCallback, useState } from "react";
import { Cog, Play, Square, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPfsenseServices, pfsenseServiceAction } from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseService } from "@/lib/types";
import { toast } from "sonner";

export function ServicesTab() {
  const fetcher = useCallback(() => fetchPfsenseServices(), []);
  const { data: services, loading, reload } = useData(fetcher);
  const [acting, setActing] = useState<string | null>(null);

  async function handleAction(
    name: string,
    action: "start" | "stop" | "restart",
  ) {
    setActing(`${name}-${action}`);
    try {
      await pfsenseServiceAction(name, action);
      toast.success(`Service ${name}: ${action} successful`);
      reload();
    } catch (e) {
      toast.error(
        `Failed to ${action} ${name}: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const sorted = [...(services ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <Card className="border-mesh-border-strong bg-mesh-surface-1">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="flex items-center gap-2 text-white">
          <Cog className="h-4 w-4 text-blue-400" />
          Services
        </CardTitle>
        <span className="text-xs text-slate-500">
          {sorted.filter((s) => s.running).length} / {sorted.length} running
        </span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No services found
                  </td>
                </tr>
              ) : (
                sorted.map((svc) => (
                  <ServiceRow
                    key={svc.name}
                    service={svc}
                    acting={acting}
                    onAction={handleAction}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceRow({
  service,
  acting,
  onAction,
}: {
  service: PfsenseService;
  acting: string | null;
  onAction: (name: string, action: "start" | "stop" | "restart") => void;
}) {
  const isActing = acting?.startsWith(`${service.name}-`) ?? false;

  return (
    <tr className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
      <td className="px-3 py-2 font-medium text-white">{service.name}</td>
      <td className="px-3 py-2 text-slate-400">
        {service.description || "\u2014"}
      </td>
      <td className="px-3 py-2">
        {service.running ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            Running
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
          >
            Stopped
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {service.running ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-amber-400 hover:text-amber-300"
                disabled={isActing}
                onClick={() => onAction(service.name, "restart")}
              >
                <RotateCcw className="h-3 w-3" />
                Restart
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-rose-400 hover:text-rose-300"
                disabled={isActing}
                onClick={() => onAction(service.name, "stop")}
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-emerald-400 hover:text-emerald-300"
              disabled={isActing}
              onClick={() => onAction(service.name, "start")}
            >
              <Play className="h-3 w-3" />
              Start
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
