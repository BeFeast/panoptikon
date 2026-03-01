"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cable,
  Crown,
  MonitorSmartphone,
  RefreshCw,
  Router,
  Wifi,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/PageTransition";
import { fetchXiaomiTopology } from "@/lib/api";
import type { XiaomiTopology, XiaomiTopoNode } from "@/lib/types";

// ─── Node Card ───────────────────────────────────────────

function NodeCard({ node }: { node: XiaomiTopoNode }) {
  const isMain = node.is_main;
  const onlineDevices = node.online ?? 0;

  return (
    <Card
      className={`border-slate-800 bg-slate-900/50 transition-shadow hover:shadow-lg ${
        isMain
          ? "border-amber-500/30 shadow-amber-500/5"
          : "hover:border-slate-700"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isMain ? "bg-amber-500/20" : "bg-blue-500/20"
            }`}
          >
            {isMain ? (
              <Crown className="h-5 w-5 text-amber-400" />
            ) : (
              <Router className="h-5 w-5 text-blue-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-semibold text-white">
              {node.name || node.locale || "Mesh Node"}
            </CardTitle>
            <p className="truncate font-mono text-xs text-slate-400">
              {node.ip || "No IP"}
            </p>
          </div>
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              node.ip
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                : "bg-slate-600"
            }`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5" />
            {onlineDevices} device{onlineDevices !== 1 ? "s" : ""} online
          </span>
          {node.link_type && (
            <span className="flex items-center gap-1.5">
              {node.link_type === "wired" ? (
                <Cable className="h-3.5 w-3.5" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              {node.link_type}
            </span>
          )}
          {node.signal != null && node.signal > 0 && (
            <span className="flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              Signal: {node.signal}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {node.hardware && (
            <Badge
              variant="outline"
              className="border-slate-700 text-[10px] text-slate-500"
            >
              {node.hardware}
            </Badge>
          )}
          {isMain && (
            <Badge className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-400">
              Main Router
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ────────────────────────────────────

function NodeCardSkeleton() {
  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-1.5">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function XiaomiMeshPage() {
  const [data, setData] = useState<XiaomiTopology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchXiaomiTopology();
      setData(result);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Xiaomi topology",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Sort: main node first, then by online device count descending
  const sortedNodes = useMemo(() => {
    if (!data) return [];
    return [...data.nodes].sort((a, b) => {
      if (a.is_main && !b.is_main) return -1;
      if (!a.is_main && b.is_main) return 1;
      return (b.online ?? 0) - (a.online ?? 0);
    });
  }, [data]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { nodeCount: 0, totalDevices: 0 };
    const totalDevices = data.nodes.reduce(
      (sum, n) => sum + (n.online ?? 0),
      0,
    );
    return {
      nodeCount: data.nodes.length,
      totalDevices,
    };
  }, [data]);

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Xiaomi Mesh Topology
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Network mesh nodes from the Xiaomi router topology graph
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[11px] text-slate-500">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {!loading && data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20">
                  <Router className="h-4.5 w-4.5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {stats.nodeCount}
                  </p>
                  <p className="text-xs text-slate-400">Mesh Nodes</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-800 bg-slate-900/50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20">
                  <MonitorSmartphone className="h-4.5 w-4.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {stats.totalDevices}
                  </p>
                  <p className="text-xs text-slate-400">Online Devices</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error state */}
        {error && (
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="p-4">
              <p className="text-sm text-rose-400">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  load();
                }}
                className="mt-2 text-xs text-blue-400 hover:underline"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <NodeCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Node cards */}
        {!loading && data && sortedNodes.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedNodes.map((node) => (
              <NodeCard key={node.ip || node.name} node={node} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data && sortedNodes.length === 0 && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <Router className="h-10 w-10 text-slate-600" />
              <p className="text-sm text-slate-400">
                No mesh nodes found. Make sure the Xiaomi mesh integration is
                configured in Settings.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
