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

function statusBadge(status: PfsenseInterface["status"]) {
  switch (status) {
    case "up":
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          Up
        </Badge>
      );
    case "down":
      return (
        <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
          Down
        </Badge>
      );
    case "disabled":
      return (
        <Badge variant="outline" className="border-slate-600/30 bg-slate-600/10 text-slate-500">
          Disabled
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
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="flex items-center gap-2 text-white">
          <Network className="h-4 w-4 text-blue-400" />
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
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-400 hover:text-white"
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
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
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
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No interfaces found
                  </td>
                </tr>
              ) : (
                filtered.map((iface) => (
                  <tr key={iface.name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-medium text-white">{iface.name}</td>
                    <td className="px-3 py-2 text-slate-400">{iface.descr ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{iface.iface_type}</td>
                    <td className="px-3 py-2">{statusBadge(iface.status)}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">
                      {iface.ip_address
                        ? `${iface.ip_address}${iface.subnet ? `/${iface.subnet}` : ""}`
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-400">{iface.mac ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{iface.mtu ?? "\u2014"}</td>
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
