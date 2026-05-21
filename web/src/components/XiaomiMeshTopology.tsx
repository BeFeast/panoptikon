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
import type { XiaomiTopology, XiaomiTopoNode, XiaomiTopoLeaf } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────

/**
 * Pick the best human-readable mesh node label.
 *
 * MiWiFi reports a name in two fields — `locale` (user-facing room label set
 * via the Mi Home app) and `name` (internal radio identifier). The router
 * frequently emits the literal string `"default"` in `name` for satellites
 * the user has not renamed via the radio settings. The backend
 * (`effective_mesh_name` in `server/src/api/xiaomi.rs`) already strips this
 * sentinel, but we mirror the logic here so the UI degrades gracefully if a
 * stale build of the backend is in play (#807).
 */
function meshNodeLabel(node: { name?: string | null; locale?: string | null; ip?: string | null }): string {
  const clean = (s: string | null | undefined): string | null => {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === "default") return null;
    return trimmed;
  };
  return clean(node.locale) ?? clean(node.name) ?? node.ip?.trim() ?? "Mesh Node";
}

/** Get leafs attached to a given node MAC. */
function leafsForNode(
  nodeMac: string | null,
  leafs: XiaomiTopoLeaf[],
): XiaomiTopoLeaf[] {
  if (!nodeMac) return [];
  return leafs.filter((l) => l.parent_id === nodeMac);
}

// ─── SVG topology map ────────────────────────────────────

const SVG_W = 720;
const SVG_H = 360;
const SVG_CX = SVG_W / 2;
const SVG_CY = SVG_H / 2;
const SAT_RING = 130;

interface PositionedNode {
  node: XiaomiTopoNode;
  isMain: boolean;
  x: number;
  y: number;
  leafCount: number;
}

/**
 * Lay out the mesh nodes radially: main router at the centre, satellites on a
 * ring around it. Mirrors the SVG geometry used on `/topology` (Subnets tab)
 * so the two views read as the same family.
 */
function layoutNodes(
  data: XiaomiTopology,
  mainMac: string | null,
): PositionedNode[] {
  const main = data.nodes.find((n) => n.mac === mainMac) ?? data.nodes[0];
  const satellites = data.nodes.filter((n) => n !== main);

  const out: PositionedNode[] = [];
  if (main) {
    out.push({
      node: main,
      isMain: true,
      x: SVG_CX,
      y: SVG_CY,
      leafCount: leafsForNode(main.mac, data.leafs).length,
    });
  }
  satellites.forEach((sat, i) => {
    const angle = (2 * Math.PI * i) / Math.max(satellites.length, 1) - Math.PI / 2;
    out.push({
      node: sat,
      isMain: false,
      x: SVG_CX + Math.cos(angle) * SAT_RING,
      y: SVG_CY + Math.sin(angle) * SAT_RING,
      leafCount: leafsForNode(sat.mac, data.leafs).length,
    });
  });
  return out;
}

function MeshTopologyMap({
  data,
  mainMac,
}: {
  data: XiaomiTopology;
  mainMac: string | null;
}) {
  const positioned = useMemo(() => layoutNodes(data, mainMac), [data, mainMac]);
  const main = positioned.find((p) => p.isMain) ?? null;

  if (positioned.length === 0) return null;

  return (
    <div
      className="mesh-card relative overflow-hidden"
      style={{ padding: 0, height: SVG_H }}
      data-testid="xiaomi-mesh-svg-card"
    >
      {/* Blueprint grid background — matches /topology canvas */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(96,144,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(96,144,212,0.08) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.05), transparent 60%)",
        }}
      />

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Xiaomi mesh topology"
        data-testid="xiaomi-mesh-svg"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <radialGradient id="xmesh-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Edges: main → each satellite */}
        {main &&
          positioned
            .filter((p) => !p.isMain)
            .map((sat) => (
              <line
                key={`edge-${sat.node.mac ?? sat.node.ip}`}
                x1={main.x}
                y1={main.y}
                x2={sat.x}
                y2={sat.y}
                stroke="rgba(56,189,248,0.45)"
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />
            ))}

        {/* Nodes */}
        {positioned.map((p) => {
          const label = meshNodeLabel(p.node);
          const fill = p.isMain ? "#fbbf24" : "#2563eb";
          const stroke = p.isMain ? "#fbbf24" : "#38bdf8";
          const r = p.isMain ? 20 : 16;
          return (
            <g
              key={`node-${p.node.mac ?? p.node.ip ?? label}`}
              transform={`translate(${p.x},${p.y})`}
              data-testid="xiaomi-mesh-svg-node"
              data-node-name={label}
              data-node-role={p.isMain ? "main" : "satellite"}
            >
              <circle r={r + 12} fill="url(#xmesh-glow)" />
              <rect
                x={-r}
                y={-r}
                width={r * 2}
                height={r * 2}
                rx={4}
                fill={fill}
                fillOpacity={0.2}
                stroke={stroke}
                strokeWidth={1.5}
              />
              <text
                y={-r - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text, #e2e8f0)"
                fontFamily="var(--font-sans)"
                fontWeight={600}
              >
                {label.length > 22 ? `${label.slice(0, 21)}…` : label}
              </text>
              <text
                y={r + 14}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-mute, #94a3b8)"
                fontFamily="var(--font-mono)"
              >
                {p.node.ip ?? "—"} · {p.node.online ?? 0} dev
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        className="absolute"
        style={{
          bottom: 10,
          left: 12,
          display: "flex",
          gap: 12,
          padding: "6px 10px",
          background: "rgba(6,15,37,0.85)",
          border: "var(--hairline) solid rgba(96,144,212,0.20)",
          borderRadius: "var(--radius-sm)",
          font: "500 10px var(--font-mono)",
          color: "var(--text-dim)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 8,
              height: 8,
              background: "#fbbf24",
              borderRadius: 1,
            }}
          />
          main router
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              width: 8,
              height: 8,
              background: "#2563eb",
              borderRadius: 1,
            }}
          />
          satellite
        </span>
      </div>
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
    <Card
      className={isMain ? "ring-1 ring-[#fbbf24]/30" : undefined}
      data-testid="xiaomi-mesh-node-card"
      data-node-name={label}
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
                    {meshNodeLabel(leaf) || leaf.mac || "Unknown"}
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

      {/* SVG topology map */}
      {!loading && data && sortedNodes.length > 0 && (
        <MeshTopologyMap data={data} mainMac={mainMac} />
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
