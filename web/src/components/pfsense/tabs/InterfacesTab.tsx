"use client";

import { useCallback, useState } from "react";
import { Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPfsenseInterfaces } from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseInterface } from "@/lib/types";

const IFACE_TYPES = ["All", "Physical", "VLAN", "Bridge"] as const;
type IfaceFilter = (typeof IFACE_TYPES)[number];

function matchesFilter(iface: PfsenseInterface, filter: IfaceFilter): boolean {
  if (filter === "All") return true;
  return iface.iface_type.toLowerCase() === filter.toLowerCase();
}

function statusBadge(status: string) {
  switch (status) {
    case "up":
      return (
        <Badge variant="outline" className="border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]">
          Up
        </Badge>
      );
    case "down":
      return (
        <Badge variant="outline" className="border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]">
          Down
        </Badge>
      );
    case "disabled":
      return (
        <Badge variant="outline" className="border-mesh-text-mute/30 bg-mesh-text-mute/10 text-mesh-text-mute">
          Disabled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="border-mesh-text-mute/30 bg-mesh-text-mute/10 text-mesh-text-dim">
          {status || "Unknown"}
        </Badge>
      );
  }
}

export function InterfacesTab() {
  const fetcher = useCallback(() => fetchPfsenseInterfaces(), []);
  const { data: interfaces, loading } = useData(fetcher);
  const [filter, setFilter] = useState<IfaceFilter>("All");

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const filtered = (interfaces ?? []).filter((i) => matchesFilter(i, filter));

  return (
    <Card className="border-mesh-border bg-mesh-surface-1">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="flex items-center gap-2 text-white">
          <Network className="h-4 w-4 text-mesh-primary" />
          Interfaces
        </CardTitle>
        <div className="flex gap-1">
          {IFACE_TYPES.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={filter === t ? "default" : "ghost"}
              className={
                filter === t
                  ? "bg-mesh-primary text-white hover:bg-mesh-primary"
                  : "text-mesh-text-dim hover:text-white"
              }
              onClick={() => setFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-mesh-text-mute">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">IP Address</th>
                <th className="px-3 py-2">MAC</th>
                <th className="px-3 py-2">MTU</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-mesh-text-mute">
                    No interfaces found
                  </td>
                </tr>
              ) : (
                filtered.map((iface) => (
                  <tr key={iface.name} className="border-b border-mesh-border hover:bg-mesh-surface-2">
                    <td className="px-3 py-2 font-medium text-white">{iface.name}</td>
                    <td className="px-3 py-2 text-mesh-text-dim">{iface.descr ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-mesh-text-dim">{iface.iface_type}</td>
                    <td className="px-3 py-2">{statusBadge(iface.status)}</td>
                    <td className="px-3 py-2 font-mono text-mesh-text">
                      {iface.ip_address
                        ? `${iface.ip_address}${iface.subnet ? `/${iface.subnet}` : ""}`
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-2 font-mono text-mesh-text-dim">{iface.mac ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-mesh-text-dim">{iface.mtu ?? "\u2014"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
