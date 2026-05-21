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
import { Skeleton } from "@/components/ui/skeleton";
import { fetchXiaomiTopology } from "@/lib/api";
import { meshLeafLabel, meshNodeLabel } from "@/lib/mesh-labels";
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

// ─── SVG topology view ──────────────────────────────────
//
// Restores the SVG topology semantics that the cards-only redesign
// regressed (#807). Mirrors the topology.jsx geometry: main router center,
// satellite mesh nodes radially placed, leaf devices on a ring around their
// parent. Uses the mesh design tokens (--accent-cyan, --surface-*) so it
// reads as a cohesive operator-console screen.

const SVG_W = 900;
const SVG_H = 420;
const SVG_CX = SVG_W / 2;
const SVG_CY = SVG_H / 2;
const SATELLITE_RADIUS = 170;
const LEAF_RING_RADIUS = 56;

interface PlacedNode {
  id: string;
  label: string;
  x: number;
  y: number;
  isMain: boolean;
  online: number;
  ip: string;
  hardware: string;
  model: string;
}

interface PlacedLeaf {
  id: string;
  label: string;
  x: number;
  y: number;
  parentId: string;
  ip: string;
}

interface PlacedTopology {
  mainId: string | null;
  nodes: PlacedNode[];
  leafs: PlacedLeaf[];
}

function placeTopology(data: XiaomiTopology): PlacedTopology {
  const main = data.nodes[0] ?? null;
  const mainId = main ? main.mac || main.ip || "main" : null;
  const placed: PlacedNode[] = [];

  if (main) {
    placed.push({
      id: mainId as string,
      label: meshNodeLabel(main),
      x: SVG_CX,
      y: SVG_CY,
      isMain: true,
      online: main.online ?? 0,
      ip: main.ip ?? "",
      hardware: main.hardware ?? "",
      model: main.model ?? "",
    });
  }

  const satellites = data.nodes.slice(1);
  satellites.forEach((node, i) => {
    const id = node.mac || node.ip || `sat-${i}`;
    const angle = (i / Math.max(satellites.length, 1)) * Math.PI * 2 - Math.PI / 2;
    placed.push({
      id,
      label: meshNodeLabel(node),
      x: SVG_CX + Math.cos(angle) * SATELLITE_RADIUS,
      y: SVG_CY + Math.sin(angle) * SATELLITE_RADIUS,
      isMain: false,
      online: node.online ?? 0,
      ip: node.ip ?? "",
      hardware: node.hardware ?? "",
      model: node.model ?? "",
    });
  });

  // Place leafs on a tight ring around their parent (or the main router if
  // unparented). Skip orphan leafs without a placed parent so the layout
  // doesn't drift.
  const nodeById = new Map(placed.map((n) => [n.id, n]));
  const leafsByParent = new Map<string, XiaomiTopoLeaf[]>();
  for (const leaf of data.leafs) {
    const parentId = leaf.parent_id ?? mainId ?? "main";
    const list = leafsByParent.get(parentId) ?? [];
    list.push(leaf);
    leafsByParent.set(parentId, list);
  }

  const placedLeafs: PlacedLeaf[] = [];
  for (const [parentId, leafList] of leafsByParent.entries()) {
    const parent = nodeById.get(parentId);
    if (!parent) continue;
    leafList.forEach((leaf, i) => {
      const angle = (i / leafList.length) * Math.PI * 2;
      placedLeafs.push({
        id: leaf.mac || leaf.ip || `leaf-${parentId}-${i}`,
        label: meshLeafLabel(leaf),
        x: parent.x + Math.cos(angle) * LEAF_RING_RADIUS,
        y: parent.y + Math.sin(angle) * LEAF_RING_RADIUS,
        parentId,
        ip: leaf.ip ?? "",
      });
    });
  }

  return { mainId, nodes: placed, leafs: placedLeafs };
}

function MeshTopologySvg({ data }: { data: XiaomiTopology }) {
  const placed = useMemo(() => placeTopology(data), [data]);

  if (placed.nodes.length === 0) {
    return null;
  }

  const mainNode = placed.nodes.find((n) => n.isMain);

  return (
    <div
      className="mesh-card relative overflow-hidden"
      data-testid="mesh-topology-svg"
      style={{ padding: 0 }}
    >
      {/* Blueprint grid background */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(96,144,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(96,144,212,0.08) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.05), transparent 60%)",
        }}
      />

      {/* Corner tick — node count */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          font: "400 10px var(--font-mono)",
          color: "var(--text-faint)",
          zIndex: 1,
        }}
      >
        mesh · {placed.nodes.length} node
        {placed.nodes.length === 1 ? "" : "s"} · {placed.leafs.length} leaf
        {placed.leafs.length === 1 ? "" : "s"}
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", minHeight: 320, display: "block" }}
      >
        <defs>
          <radialGradient id="mesh-node-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mesh-sat-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.30" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Backhaul links: satellites → main */}
        {mainNode &&
          placed.nodes
            .filter((n) => !n.isMain)
            .map((sat) => (
              <line
                key={`backhaul-${sat.id}`}
                x1={mainNode.x}
                y1={mainNode.y}
                x2={sat.x}
                y2={sat.y}
                stroke="var(--accent-cyan)"
                strokeWidth={1.4}
                strokeDasharray="6 4"
                opacity={0.7}
              />
            ))}

        {/* Leaf links: leaf → parent */}
        {placed.leafs.map((leaf) => {
          const parent = placed.nodes.find((n) => n.id === leaf.parentId);
          if (!parent) return null;
          return (
            <line
              key={`leaf-link-${leaf.id}`}
              x1={parent.x}
              y1={parent.y}
              x2={leaf.x}
              y2={leaf.y}
              stroke="rgba(96,144,212,0.30)"
              strokeWidth={0.7}
              strokeDasharray="2 4"
              opacity={0.55}
            />
          );
        })}

        {/* Mesh nodes */}
        {placed.nodes.map((n) => {
          const r = n.isMain ? 22 : 16;
          return (
            <g
              key={`node-${n.id}`}
              transform={`translate(${n.x},${n.y})`}
              data-testid={`mesh-svg-node-${n.id}`}
            >
              <circle
                r={r + 10}
                fill={`url(#${n.isMain ? "mesh-node-glow" : "mesh-sat-glow"})`}
              />
              <rect
                x={-r}
                y={-r}
                width={r * 2}
                height={r * 2}
                rx={3}
                fill={n.isMain ? "#fbbf24" : "#2563eb"}
                stroke="var(--accent-cyan)"
                strokeWidth={1.5}
              />
              <text
                y={r + 14}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text)"
                fontFamily="var(--font-sans)"
                fontWeight={600}
              >
                {n.label}
              </text>
              <text
                y={r + 26}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-mute)"
                fontFamily="var(--font-mono)"
              >
                {n.ip}
              </text>
              {n.isMain && (
                <text
                  y={-r - 8}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="#fbbf24"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.05em"
                  style={{ textTransform: "uppercase" }}
                >
                  Main
                </text>
              )}
            </g>
          );
        })}

        {/* Leaf glyphs */}
        {placed.leafs.map((leaf) => (
          <g
            key={`leaf-${leaf.id}`}
            transform={`translate(${leaf.x},${leaf.y})`}
            data-testid={`mesh-svg-leaf-${leaf.id}`}
          >
            <circle
              r={3.5}
              fill="var(--surface-2)"
              stroke="var(--accent-cyan)"
              strokeWidth={1}
            />
          </g>
        ))}
      </svg>
    </div>
  );
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
  const label = meshNodeLabel(node);

  return (
    <Card className={isMain ? "ring-1 ring-[#fbbf24]/30" : undefined}>
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
            <CardTitle className="truncate text-sm font-semibold text-mesh-text">
              {label}
            </CardTitle>
            <p className="truncate font-mono text-xs text-mesh-text-dim">
              {node.ip || "No IP"}
            </p>
          </div>
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
              node.ip
                ? "bg-[#4ade80] shadow-[0_0_6px_rgba(74,222,128,0.5)]"
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
                    {meshLeafLabel(leaf)}
                  </span>
                  <span className="shrink-0 font-mono text-mesh-text-mute">
                    {leaf.ip || "—"}
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
    <Card>
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
    <div className="space-y-6" data-testid="xiaomi-mesh-topology">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="t-h2 text-mesh-text">Mesh Topology</h2>
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
          <button type="button" className="btn btn-sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mesh-primary/20">
                <Router className="h-4 w-4 text-mesh-primary" />
              </div>
              <div>
                <p className="t-h1 text-mesh-text">{stats.nodeCount}</p>
                <p className="text-xs text-mesh-text-dim">Mesh Nodes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4ade80]/20">
                <MonitorSmartphone className="h-4 w-4 text-[#4ade80]" />
              </div>
              <div>
                <p className="t-h1 text-mesh-text">{stats.totalDevices}</p>
                <p className="text-xs text-mesh-text-dim">Online Devices</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c084fc]/20">
                <Wifi className="h-4 w-4 text-[#c084fc]" />
              </div>
              <div>
                <p className="t-h1 text-mesh-text">{stats.totalLeafs}</p>
                <p className="text-xs text-mesh-text-dim">Connected Clients</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SVG topology — restored from the previous correct semantics (#807) */}
      {!loading && data && sortedNodes.length > 0 && (
        <MeshTopologySvg data={data} />
      )}

      {/* Error state */}
      {error && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm text-[#fb7185]">{error}</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setLoading(true);
                load();
              }}
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
        <Card>
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
