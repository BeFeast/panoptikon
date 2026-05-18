"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { fetchXiaomiTopology } from "@/lib/api";
import type { XiaomiTopology, XiaomiTopoNode, XiaomiTopoLeaf } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────

/** Get leafs attached to a given node MAC. */
function leafsForNode(
  nodeMac: string | null,
  leafs: XiaomiTopoLeaf[],
): XiaomiTopoLeaf[] {
  if (!nodeMac) return [];
  return leafs.filter((l) => l.parent_id === nodeMac);
}

// ─── Node Card ───────────────────────────────────────────

function NodeCard({
  node,
  leafs,
  isMain,
}: {
  node: XiaomiTopoNode;
  leafs: XiaomiTopoLeaf[];
  isMain: boolean;
}) {
  const connectedLeafs = leafsForNode(node.mac, leafs);
  const onlineDevices = node.online ?? 0;

  return (
    <Card
      className={`border-mesh-border bg-mesh-surface-1 transition-shadow hover:shadow-lg ${
        isMain
          ? "border-[#fbbf24]/30 shadow-[#fbbf24]/5"
          : "hover:border-mesh-border"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isMain ? "bg-[#fbbf24]/20" : "bg-mesh-primary/20"
            }`}
          >
            {isMain ? (
              <Crown className="h-5 w-5 text-[#fbbf24]" />
            ) : (
              <Router className="h-5 w-5 text-mesh-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm font-semibold text-white">
              {node.locale || node.name || "Mesh Node"}
            </CardTitle>
            <p className="truncate font-mono text-xs text-mesh-text-dim">
              {node.ip || "No IP"}
            </p>
          </div>
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              node.ip
                ? "bg-[#4ade80] shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                : "bg-mesh-text-mute"
            }`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-mesh-text-dim">
          <span className="flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5" />
            {onlineDevices} device{onlineDevices !== 1 ? "s" : ""} online
          </span>
          {connectedLeafs.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              {connectedLeafs.length} connected
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {node.model && (
            <Badge
              variant="outline"
              className="border-mesh-border-strong text-[10px] text-mesh-text-mute"
            >
              {node.model}
            </Badge>
          )}
          {node.hardware && node.hardware !== node.model && (
            <Badge
              variant="outline"
              className="border-mesh-border-strong text-[10px] text-mesh-text-mute"
            >
              {node.hardware}
            </Badge>
          )}
          {isMain && (
            <Badge className="border-[#fbbf24]/20 bg-[#fbbf24]/10 text-[10px] text-[#fbbf24]">
              Main Router
            </Badge>
          )}
        </div>

        {/* MAC address */}
        {node.mac && (
          <p className="font-mono text-[10px] text-mesh-text-mute">
            MAC: {node.mac}
          </p>
        )}

        {/* Connected devices list */}
        {connectedLeafs.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-mesh-border-strong pt-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-mesh-text-mute">
              Connected Devices
            </p>
            <div className="max-h-32 space-y-0.5 overflow-y-auto">
              {connectedLeafs.map((leaf) => (
                <div
                  key={leaf.mac || leaf.ip}
                  className="flex items-center justify-between rounded px-1.5 py-0.5 text-[11px] hover:bg-mesh-surface-2"
                >
                  <span className="truncate text-mesh-text">
                    {leaf.name || leaf.mac || "Unknown"}
                  </span>
                  <span className="shrink-0 font-mono text-mesh-text-mute">
                    {leaf.ip || "\u2014"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ────────────────────────────────────

function NodeCardSkeleton() {
  return (
    <Card className="">
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

// ─── Main Component ──────────────────────────────────────

export default function XiaomiMeshTopology() {
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

  // Determine which node is "main" (first node, typically the primary router)
  const { sortedNodes, mainMac } = useMemo(() => {
    if (!data) return { sortedNodes: [], mainMac: null };
    const main = data.nodes[0] ?? null;
    const mainMac = main?.mac ?? null;
    const sorted = [...data.nodes].sort((a, b) => {
      if (a.mac === mainMac) return -1;
      if (b.mac === mainMac) return 1;
      return (b.online ?? 0) - (a.online ?? 0);
    });
    return { sortedNodes: sorted, mainMac };
  }, [data]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { nodeCount: 0, totalDevices: 0, totalLeafs: 0 };
    const totalDevices = data.nodes.reduce(
      (sum, n) => sum + (n.online ?? 0),
      0,
    );
    return {
      nodeCount: data.nodes.length,
      totalDevices,
      totalLeafs: data.leafs.length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Mesh Topology
          </h2>
          <p className="mt-1 text-sm text-mesh-text-dim">
            Network mesh nodes from the Xiaomi router topology graph
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[11px] text-mesh-text-mute">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-mesh-border bg-mesh-surface-1 text-mesh-text hover:bg-mesh-surface-2"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mesh-primary/20">
                <Router className="h-4.5 w-4.5 text-mesh-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.nodeCount}
                </p>
                <p className="text-xs text-mesh-text-dim">Mesh Nodes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4ade80]/20">
                <MonitorSmartphone className="h-4.5 w-4.5 text-[#4ade80]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.totalDevices}
                </p>
                <p className="text-xs text-mesh-text-dim">Online Devices</p>
              </div>
            </CardContent>
          </Card>
          <Card className="">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c084fc]/20">
                <Wifi className="h-4.5 w-4.5 text-[#c084fc]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {stats.totalLeafs}
                </p>
                <p className="text-xs text-mesh-text-dim">Connected Clients</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-[#fb7185]/20 bg-[#fb7185]/5">
          <CardContent className="p-4">
            <p className="text-sm text-[#fb7185]">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="mt-2 text-xs text-mesh-primary hover:underline"
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
            <NodeCard
              key={node.mac || node.ip}
              node={node}
              leafs={data.leafs}
              isMain={node.mac === mainMac}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && sortedNodes.length === 0 && (
        <Card className="">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Router className="h-10 w-10 text-mesh-text-mute" />
            <p className="text-sm text-mesh-text-dim">
              No mesh nodes found. Make sure the Xiaomi mesh integration is
              configured in Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
