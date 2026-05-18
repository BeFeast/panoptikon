"use client";
// topology — literal port of `panopticon/project/topology.jsx` (Mesh direction)
//
// Source: /tmp/panopticon-design/panopticon/project/topology.jsx
// Vendored design source (for diff evidence): docs/design-handoff/literal-port/topology.jsx
//
// The implementation strategy is the Source Code Port Protocol:
//   - markup / inline styles / SVG geometry are kept verbatim;
//   - the mock `buildGraph()` constants are replaced with real /api/v1/topology
//     data, grouped into /24 subnet clusters that mirror the source layout;
//   - selection wiring points at a real `TopologyDevice` instead of the
//     hardcoded `trusted/nas-01` placeholder;
//   - `<Icon name=…/>` comes from `@/components/mesh/Icon` (lucide-backed).
//
// Shadcn-conflicting tokens (`--border`, `--primary`, `--status-*`) are
// inlined as literal hex per the project's token substitution policy. All
// other `var(--X)` references stay verbatim — they resolve from the mesh
// data-direction in `tokens.css`.

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import XiaomiMeshTopology from "@/components/XiaomiMeshTopology";
import {
  fetchTopologyGraph,
  deleteTopologyPositions,
} from "@/lib/api";
import type {
  TopologyDevice,
  TopologyGraph,
  TopologyRouter,
} from "@/lib/types";
import { PageTransition } from "@/components/PageTransition";
import { EmptyState as MeshEmptyState } from "@/components/mesh/state/EmptyState";
import { LoadingState } from "@/components/mesh/state/LoadingState";
import { ErrorState as MeshErrorState } from "@/components/mesh/state/ErrorState";
import { StatusDot } from "@/components/mesh/StatusDot";
import { Spark } from "@/components/mesh/Spark";
import { Icon } from "@/components/mesh/Icon";
import { useWsEvent } from "@/lib/ws";
import { Network } from "lucide-react";

// ─── Graph geometry — verbatim from topology.jsx buildGraph() ────────────
//
// The source picks W=900 / H=580 and stages four subnet clusters around a
// central router with 76px ring radius for hosts. We keep all geometry,
// only the host arrays and subnet keys are derived from real data.

const W = 900;
const H = 580;
const CX = W / 2;
const CY = H / 2;
const RING_RADIUS = 76;

// Source-side subnet palette (verbatim). When the real subnet count exceeds
// the source's four-cluster layout we cycle through the same palette.
type ClusterPalette = { color: string; ax: number; ay: number };
const CLUSTER_ANCHORS: ClusterPalette[] = [
  { color: "var(--accent-cyan)",   ax: CX - 320, ay: CY - 80  },
  { color: "var(--status-online)", ax: CX + 320, ay: CY - 90  },
  { color: "var(--accent-violet)", ax: CX + 280, ay: CY + 140 },
  { color: "var(--status-warning)",ax: CX - 280, ay: CY + 150 },
  // Additional anchors used only when the real network has more than four
  // /24 subnets. Same vertical/horizontal cadence, two more colours from
  // the mesh palette.
  { color: "var(--accent-cyan)",   ax: CX - 360, ay: CY + 0   },
  { color: "var(--accent-violet)", ax: CX + 360, ay: CY + 0   },
];

type NodeKind =
  | "router"
  | "wan"
  | "subnet"
  | "switch"
  | "ap"
  | "camera"
  | "tv"
  | "nas"
  | "printer"
  | "desktop"
  | "laptop"
  | "phone"
  | "iot";

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  r: number;
  color?: string;
  subnet?: string;
  device?: TopologyDevice;
}

interface GraphLink {
  from: string;
  to: string;
  kind: "uplink" | "trunk" | "edge";
  color?: string;
}

/** Extract /24 subnet from an IPv4 string. */
function getSubnet(ip: string): string {
  const parts = ip.split(".");
  if (parts.length !== 4) return "unknown";
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Map a device into one of the source NodeKind glyphs. Falls back to a
 * generic circle so unknown vendors still render at the right scale.
 */
function deviceKind(d: TopologyDevice): NodeKind {
  const t = (
    d.custom_type ||
    d.device_type ||
    d.icon ||
    ""
  ).toLowerCase();
  if (t.includes("router")) return "router";
  if (t.includes("switch")) return "switch";
  if (t.includes("ap") || t.includes("access")) return "ap";
  if (t.includes("camera") || t.includes("cam")) return "camera";
  if (t.includes("tv") || t.includes("media") || t.includes("speaker"))
    return "tv";
  if (t.includes("nas") || t.includes("storage") || t.includes("synology"))
    return "nas";
  if (t.includes("printer")) return "printer";
  if (t.includes("laptop") || t.includes("notebook")) return "laptop";
  if (t.includes("phone") || t.includes("mobile")) return "phone";
  if (t.includes("desktop") || t.includes("pc") || t.includes("plex"))
    return "desktop";
  const name = (d.custom_name || d.name || d.hostname || "").toLowerCase();
  if (name.includes("phone") || name.includes("iphone")) return "phone";
  if (name.includes("ipad") || name.includes("tablet")) return "laptop";
  if (name.includes("cam")) return "camera";
  if (name.includes("nas") || name.includes("synology")) return "nas";
  if (name.includes("ap-")) return "ap";
  if (name.includes("sw")) return "switch";
  if (name.includes("tv") || name.includes("sonos")) return "tv";
  return "iot";
}

/**
 * Build a positioned graph with subnets as clusters. Mirrors the source's
 * buildGraph() layout — central router, WAN above it, subnet anchors around
 * the perimeter, hosts on a ring inside each subnet cluster — but populated
 * from the real topology response.
 */
function buildGraph(
  topology: TopologyGraph,
  pinned: Map<string, { x: number; y: number }>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const router: GraphNode = {
    id: "router",
    label: topology.router.hostname || "router",
    kind: "router",
    x: pinned.get("router")?.x ?? CX,
    y: pinned.get("router")?.y ?? CY,
    r: 22,
  };
  const wan: GraphNode = {
    id: "wan",
    label: topology.router.wan_ip ? "WAN" : "wan",
    kind: "wan",
    x: pinned.get("wan")?.x ?? CX,
    y: pinned.get("wan")?.y ?? 56,
    r: 16,
  };

  // Group devices by /24 subnet
  const subnetMap = new Map<string, TopologyDevice[]>();
  topology.devices.forEach((d) => {
    const ip = d.ips?.[0] ?? "";
    const subnet = ip ? getSubnet(ip) : "unknown";
    const list = subnetMap.get(subnet) ?? [];
    list.push(d);
    subnetMap.set(subnet, list);
  });

  const sortedSubnets = Array.from(subnetMap.entries())
    .filter(([s]) => s !== "unknown")
    .sort((a, b) => b[1].length - a[1].length);
  if (subnetMap.has("unknown")) {
    sortedSubnets.push(["unknown", subnetMap.get("unknown")!]);
  }

  const nodes: GraphNode[] = [router, wan];
  const links: GraphLink[] = [{ from: "wan", to: "router", kind: "uplink" }];

  sortedSubnets.forEach(([subnet, hosts], idx) => {
    const palette = CLUSTER_ANCHORS[idx % CLUSTER_ANCHORS.length];
    const subnetId = `subnet:${subnet}`;
    const anchor = pinned.get(subnetId);
    const ax = anchor?.x ?? palette.ax;
    const ay = anchor?.y ?? palette.ay;

    nodes.push({
      id: subnetId,
      label: subnet,
      kind: "subnet",
      x: ax,
      y: ay,
      r: 11,
      color: palette.color,
    });
    links.push({
      from: "router",
      to: subnetId,
      kind: "trunk",
      color: palette.color,
    });

    hosts.forEach((h, i) => {
      const angle = (i / hosts.length) * Math.PI * 2;
      const hx = ax + Math.cos(angle) * RING_RADIUS;
      const hy = ay + Math.sin(angle) * RING_RADIUS;
      const id = `${subnetId}/${h.id}`;
      const pin = pinned.get(id);
      nodes.push({
        id,
        label: h.custom_name || h.name || h.hostname || h.ips[0] || h.mac,
        kind: deviceKind(h),
        x: pin?.x ?? hx,
        y: pin?.y ?? hy,
        r: 5.5,
        color: palette.color,
        subnet,
        device: h,
      });
      links.push({
        from: subnetId,
        to: id,
        kind: "edge",
        color: palette.color,
      });
    });
  });

  return { nodes, links };
}

// ─── NodeGlyph — verbatim from topology.jsx ──────────────────────────────
//
// Geometric variations so kinds are distinguishable at small size. Source
// uses inline style/attrs — we keep them. `--primary` (royal blue, shadcn-
// conflicting) is inlined as #2563eb.

interface NodeGlyphProps {
  kind: NodeKind;
  r?: number;
  color?: string;
}

function NodeGlyph({
  kind,
  r = 6,
  color = "var(--text-mute)",
}: NodeGlyphProps) {
  const stroke = 1;
  switch (kind) {
    case "router":
      return (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={2}
          fill="#2563eb"
          stroke="var(--accent-cyan)"
          strokeWidth={1.5}
        />
      );
    case "wan":
      return (
        <polygon
          points={`0,${-r} ${r * 0.95},${r * 0.6} ${-r * 0.95},${r * 0.6}`}
          fill="var(--surface-3)"
          stroke="var(--accent-cyan)"
          strokeWidth={stroke}
        />
      );
    case "subnet":
      return (
        <rect
          x={-r * 0.8}
          y={-r * 0.8}
          width={r * 1.6}
          height={r * 1.6}
          fill="var(--surface-1)"
          stroke={color}
          strokeWidth={1.2}
          transform="rotate(45)"
        />
      );
    case "switch":
      return (
        <rect
          x={-r}
          y={-r * 0.5}
          width={r * 2}
          height={r}
          fill="var(--surface-2)"
          stroke={color}
          strokeWidth={stroke}
          rx={1}
        />
      );
    case "ap":
      return (
        <g>
          <circle r={r} fill="none" stroke={color} strokeWidth={stroke} />
          <circle r={r * 0.55} fill={color} />
        </g>
      );
    case "camera":
      return (
        <g>
          <rect
            x={-r * 0.9}
            y={-r * 0.7}
            width={r * 1.8}
            height={r * 1.4}
            rx={r * 0.4}
            fill="var(--surface-2)"
            stroke={color}
            strokeWidth={stroke}
          />
          <circle r={r * 0.35} fill={color} />
        </g>
      );
    case "tv":
      return (
        <rect
          x={-r * 1.1}
          y={-r * 0.7}
          width={r * 2.2}
          height={r * 1.4}
          rx={1}
          fill="var(--surface-2)"
          stroke={color}
          strokeWidth={stroke}
        />
      );
    case "nas":
      return (
        <g>
          <rect
            x={-r * 0.9}
            y={-r * 0.9}
            width={r * 1.8}
            height={r * 1.8}
            fill="var(--surface-2)"
            stroke={color}
            strokeWidth={stroke}
          />
          <line
            x1={-r * 0.5}
            y1={0}
            x2={r * 0.5}
            y2={0}
            stroke={color}
            strokeWidth={stroke}
          />
        </g>
      );
    case "printer":
      return (
        <rect
          x={-r * 0.9}
          y={-r * 0.9}
          width={r * 1.8}
          height={r * 1.8}
          fill="var(--surface-1)"
          stroke={color}
          strokeWidth={stroke}
        />
      );
    default:
      return (
        <circle
          r={r}
          fill="var(--surface-2)"
          stroke={color}
          strokeWidth={stroke}
        />
      );
  }
}

// ─── Topology page — literal port ────────────────────────────────────────

export default function TopologyPage() {
  const router = useRouter();
  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"subnets" | "mesh">("subnets");
  const pinnedRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Animated flow offset for dashed links — verbatim from source.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      if (t - last > 16) {
        setTick((x) => (x + 1) % 1000);
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const load = useCallback(
    async (isInitial: boolean) => {
      try {
        if (isInitial) setLoading(true);
        const data = await fetchTopologyGraph();
        if (isInitial) {
          pinnedRef.current = new Map(
            data.positions
              .filter((p) => p.pinned)
              .map((p) => [p.node_id, { x: p.x, y: p.y }]),
          );
        }
        setGraph(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load topology");
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  useWsEvent(["device_online", "device_offline", "new_device"], () =>
    load(false),
  );

  const built = useMemo(
    () => (graph ? buildGraph(graph, pinnedRef.current) : null),
    [graph],
  );
  const nodesById = useMemo(
    () =>
      built
        ? Object.fromEntries(built.nodes.map((n) => [n.id, n]))
        : ({} as Record<string, GraphNode>),
    [built],
  );

  // Default the selection to the first online host with a vendor.
  useEffect(() => {
    if (!graph || selectedId) return;
    const firstHost = graph.devices.find(
      (d) => d.is_online && (d.ips?.length ?? 0) > 0,
    );
    if (firstHost) {
      const subnet = getSubnet(firstHost.ips[0]);
      setSelectedId(`subnet:${subnet}/${firstHost.id}`);
    }
  }, [graph, selectedId]);

  const selected = selectedId ? nodesById[selectedId] : null;
  const selectedDevice = selected?.device ?? null;

  const stats = useMemo(() => {
    if (!graph) return { subnets: 0, nodes: 0, edges: 0 };
    const subs = new Set<string>();
    graph.devices.forEach((d) => {
      const ip = d.ips?.[0];
      if (ip) subs.add(getSubnet(ip));
    });
    const edges = graph.devices.filter((d) => d.is_online).length;
    return {
      subnets: subs.size,
      nodes: graph.devices.length + 1,
      edges,
    };
  }, [graph]);

  // Spark series — derive from selected device traffic when present.
  const spark = useMemo(() => {
    const base = selectedDevice
      ? ((selectedDevice.rx_bps ?? 0) + (selectedDevice.tx_bps ?? 0)) / 1_000_000
      : 0;
    return Array.from(
      { length: 30 },
      (_, i) => Math.max(0, base * 1.2 + Math.sin(i / 2 + tick / 60) * (base / 4 || 20)),
    );
  }, [selectedDevice, tick]);

  // ── Loading / error short-circuit. Header is identical to the loaded
  // surface so the layout doesn't jump on first paint.
  if (loading) {
    return (
      <PageTransition>
        <div
          style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}
          data-testid="topology-root"
        >
          <Header stats={{ subnets: 0, nodes: 0, edges: 0 }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LoadingState
              title="Building topology"
              message="Loading mesh nodes…"
              tiles={2}
              rows={3}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div
          style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}
          data-testid="topology-root"
        >
          <Header stats={{ subnets: 0, nodes: 0, edges: 0 }} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MeshErrorState
              title="Couldn't load topology"
              message={error}
              onRetry={() => load(true)}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  const resetLayout = async () => {
    pinnedRef.current = new Map();
    await deleteTopologyPositions().catch(() => {});
    await load(true);
  };

  const tracePath = () => {
    if (selectedDevice) {
      router.push(`/devices?selected=${selectedDevice.id}`);
    }
  };

  return (
    <PageTransition>
      <div
        style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}
        data-testid="topology-root"
      >
        <Header
          stats={stats}
          onResetLayout={resetLayout}
          onTrace={tracePath}
        />

        {/* Tab switcher — Subnets (literal port of topology.jsx) vs Mesh
         * (XiaomiMeshTopology, restored from /mesh route per user request). */}
        <div
          role="tablist"
          aria-label="Topology views"
          data-testid="topology-tabs"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            borderBottom: "1px solid rgba(96,144,212,0.20)",
            paddingBottom: 8,
          }}
        >
          {(["subnets", "mesh"] as const).map((key) => {
            const active = activeTab === key;
            const label = key === "subnets" ? "Subnets" : "Mesh";
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`topology-tab-${key}`}
                onClick={() => setActiveTab(key)}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: "4px 0",
                  cursor: "pointer",
                  font: `${active ? 500 : 400} 13px var(--font-sans)`,
                  color: active ? "var(--text)" : "var(--text-mute)",
                  borderBottom: active
                    ? "2px solid var(--accent-cyan)"
                    : "2px solid transparent",
                  marginBottom: -9,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === "mesh" ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }} data-testid="topology-mesh-pane">
            <XiaomiMeshTopology />
          </div>
        ) : (
        <>
        {/* Body grid — verbatim grid template from source */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 12,
            minHeight: 0,
          }}
        >
          {/* Graph card */}
          <div
            className="mesh-card"
            style={{ position: "relative", overflow: "hidden", padding: 0 }}
            data-testid="topology-canvas"
          >
            {/* Blueprint grid bg + subtle corner ticks */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(rgba(96,144,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(96,144,212,0.08) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, rgba(56,189,248,0.05), transparent 60%)",
              }}
            />

            {/* Coord ticks */}
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 10,
                font: "400 10px var(--font-mono)",
                color: "var(--text-faint)",
              }}
            >
              {graph && graph.devices[0]?.ips[0]
                ? `${graph.devices[0].ips[0].split(".").slice(0, 2).join(".")}.0.0/16 · ${stats.subnets} of ${stats.subnets} subnets`
                : `10.0.0.0/16 · ${stats.subnets} subnets`}
            </div>
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 10,
                font: "400 10px var(--font-mono)",
                color: "var(--text-faint)",
              }}
            >
              zoom 1.00× · {Math.floor(tick / 10)} ticks
            </div>

            {built && (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              >
                <defs>
                  <radialGradient id="node-glow" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#38bdf8" stopOpacity="0.3" />
                    <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Links — animated dashed flow */}
                {built.links.map((l, i) => {
                  const a = nodesById[l.from];
                  const b = nodesById[l.to];
                  if (!a || !b) return null;
                  const isTrunk = l.kind === "trunk" || l.kind === "uplink";
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={
                        l.color ||
                        (isTrunk
                          ? "var(--accent-cyan)"
                          : "rgba(96,144,212,0.30)")
                      }
                      strokeWidth={isTrunk ? 1.4 : 0.7}
                      strokeDasharray={isTrunk ? "6 4" : "2 4"}
                      strokeDashoffset={isTrunk ? -tick * 0.6 : 0}
                      opacity={isTrunk ? 0.8 : 0.55}
                    />
                  );
                })}

                {/* Subnet labels */}
                {built.nodes
                  .filter((n) => n.kind === "subnet")
                  .map((n) => (
                    <g key={`lbl-${n.id}`}>
                      <rect
                        x={n.x - 28}
                        y={n.y + 18}
                        width={56}
                        height={14}
                        rx={2}
                        fill="var(--surface-1)"
                        stroke={n.color}
                        strokeWidth="0.5"
                      />
                      <text
                        x={n.x}
                        y={n.y + 28}
                        textAnchor="middle"
                        fontSize="9.5"
                        fill={n.color}
                        fontFamily="var(--font-mono)"
                        letterSpacing="0.05em"
                        style={{ textTransform: "uppercase" }}
                      >
                        {n.label.length > 12 ? n.label.slice(0, 12) : n.label}
                      </text>
                    </g>
                  ))}

                {/* Nodes */}
                {built.nodes.map((n) => (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    style={n.device ? { cursor: "pointer" } : undefined}
                    onClick={
                      n.device
                        ? () => setSelectedId(n.id)
                        : undefined
                    }
                  >
                    {(n.kind === "router" ||
                      (selected && n.id === selected.id)) && (
                      <circle r={n.r + 10} fill="url(#node-glow)" />
                    )}
                    <NodeGlyph
                      kind={n.kind}
                      r={n.r}
                      color={n.color || "var(--text-mute)"}
                    />
                    {n.kind === "router" && (
                      <text
                        y={n.r + 14}
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--text)"
                        fontFamily="var(--font-mono)"
                        letterSpacing="0.04em"
                      >
                        {n.label}
                      </text>
                    )}
                    {n.kind !== "router" &&
                      n.kind !== "subnet" &&
                      n.kind !== "wan" && (
                        <text
                          y={n.r + 9}
                          textAnchor="middle"
                          fontSize="7.5"
                          fill="var(--text-mute)"
                          fontFamily="var(--font-mono)"
                        >
                          {n.label.slice(0, 12)}
                        </text>
                      )}
                    {n.kind === "wan" && (
                      <text
                        y={n.r + 11}
                        textAnchor="middle"
                        fontSize="8.5"
                        fill="var(--accent-cyan)"
                        fontFamily="var(--font-mono)"
                      >
                        {n.label}
                      </text>
                    )}

                    {/* Selection ring */}
                    {selected && n.id === selected.id && (
                      <circle
                        r={n.r + 6}
                        fill="none"
                        stroke="var(--accent-cyan)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}
                  </g>
                ))}
              </svg>
            )}

            {/* Legend — verbatim from source */}
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                display: "flex",
                gap: 10,
                padding: "6px 10px",
                background: "rgba(6,15,37,0.85)",
                border: "var(--hairline) solid rgba(96,144,212,0.20)",
                borderRadius: "var(--radius-sm)",
                font: "500 10px var(--font-mono)",
                color: "var(--text-dim)",
                backdropFilter: "blur(8px)",
              }}
            >
              {(
                [
                  ["mgmt", "var(--accent-cyan)"],
                  ["trusted", "var(--status-online)"],
                  ["iot", "var(--accent-violet)"],
                  ["guest", "var(--status-warning)"],
                ] as Array<[string, string]>
              ).map(([l, c]) => (
                <span
                  key={l}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: c,
                      borderRadius: 1,
                      transform: "rotate(45deg)",
                    }}
                  />
                  {l}
                </span>
              ))}
            </div>

            {/* Zoom controls — verbatim from source */}
            <div
              style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                display: "flex",
                flexDirection: "column",
                background: "rgba(6,15,37,0.85)",
                border: "var(--hairline) solid rgba(96,144,212,0.20)",
                borderRadius: "var(--radius-sm)",
                backdropFilter: "blur(8px)",
              }}
            >
              <button
                className="btn btn-ghost"
                style={{ height: 24, padding: "0 8px", border: 0 }}
              >
                <Icon name="plus" size={11} />
              </button>
              <div
                style={{
                  height: 1,
                  background: "rgba(96,144,212,0.20)",
                }}
              />
              <button
                className="btn btn-ghost"
                style={{ height: 24, padding: "0 8px", border: 0 }}
              >
                <span style={{ font: "500 11px var(--font-mono)" }}>1×</span>
              </button>
            </div>

            {/* Empty state overlay (kept inside the graph card per design IA) */}
            {graph && graph.devices.length === 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
                data-testid="topology-empty"
              >
                <div style={{ pointerEvents: "auto" }}>
                  <MeshEmptyState
                    icon={Network}
                    title="No topology devices"
                    message="Discovered devices will appear here after a network scan returns inventory data."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Side panel — selected node detail (verbatim layout, real data) */}
          <SidePanel
            device={selectedDevice}
            router={graph?.router ?? null}
            selectedNode={selected ?? null}
            spark={spark}
            onTrace={tracePath}
            onOpenDetail={() =>
              selectedDevice && router.push(`/devices?selected=${selectedDevice.id}`)
            }
            onFilterAlerts={() =>
              selectedDevice && router.push(`/alerts?device=${selectedDevice.id}`)
            }
          />
        </div>
        </>
        )}
      </div>
    </PageTransition>
  );
}

// ─── Header — verbatim layout from source ────────────────────────────────

function Header({
  stats,
  onResetLayout,
  onTrace,
}: {
  stats: { subnets: number; nodes: number; edges: number };
  onResetLayout?: () => void;
  onTrace?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div className="t-micro">Network</div>
        <h1 className="t-display" style={{ margin: "4px 0 6px" }}>
          Topology
        </h1>
        <div
          className="t-small mono"
          style={{ color: "var(--text-mute)" }}
        >
          <span>
            {stats.subnets} subnet{stats.subnets === 1 ? "" : "s"} ·{" "}
            {stats.nodes} nodes ·
          </span>
          <span style={{ color: "var(--accent-cyan)" }}>
            {" "}
            {stats.edges} active edges
          </span>
          <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>·</span>
          <span>auto-layout · force-directed</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn"
          onClick={onResetLayout}
          data-testid="topology-reset-layout"
        >
          <Icon name="filter" size={12} />
          <span>vlan: all</span>
          <Icon name="chevron-down" size={11} />
        </button>
        <button
          type="button"
          className="btn"
          onClick={onResetLayout}
          data-testid="topology-layout"
        >
          <Icon name="sliders" size={12} />
          <span>layout</span>
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onTrace}
          data-testid="topology-trace"
        >
          <Icon name="cmd" size={12} />
          <span>Trace path</span>
        </button>
      </div>
    </div>
  );
}

// ─── SidePanel — verbatim chrome from source, fields wired to real data ──

function SidePanel({
  device,
  router,
  selectedNode,
  spark,
  onTrace,
  onOpenDetail,
  onFilterAlerts,
}: {
  device: TopologyDevice | null;
  router: TopologyRouter | null;
  selectedNode: GraphNode | null;
  spark: number[];
  onTrace: () => void;
  onOpenDetail: () => void;
  onFilterAlerts: () => void;
}) {
  if (!device || !selectedNode) {
    return (
      <div
        className="mesh-card"
        style={{ padding: 0, display: "flex", flexDirection: "column" }}
        data-testid="topology-side-panel"
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
          }}
        >
          <div className="t-micro">Selection</div>
          <h3 style={{ margin: "6px 0 0", font: "600 16px var(--font-sans)" }}>
            No node selected
          </h3>
          <div
            className="mono"
            style={{
              font: "400 11px var(--font-mono)",
              color: "var(--text-dim)",
              marginTop: 3,
            }}
          >
            Click any host in the graph to inspect it.
          </div>
        </div>
      </div>
    );
  }

  const subnet = selectedNode.subnet ?? "—";
  const ip = device.ips[0] ?? "—";
  const vendor =
    device.custom_vendor || device.vendor || device.device_brand || "—";
  const isOnline = device.is_online;
  const liveBps = (device.rx_bps ?? 0) + (device.tx_bps ?? 0);
  const liveMbps = (liveBps / 1_000_000).toFixed(0);

  const statusColor = isOnline ? "#4ade80" : "#fb7185";
  const statusBg = isOnline
    ? "rgba(74,222,128,0.10)"
    : "rgba(251,113,133,0.10)";
  const statusBorder = isOnline
    ? "rgba(74,222,128,0.30)"
    : "rgba(251,113,133,0.30)";

  // Path = WAN → router → subnet → device. The hop colours mirror the
  // source `Path · 2 hops` panel — last hop matches the subnet cluster.
  const path = [
    { label: "WAN", color: "var(--accent-cyan)" },
    {
      label: router?.hostname || "router",
      color: "#2563eb",
    },
    {
      label: subnet,
      color: selectedNode.color || "var(--accent-cyan)",
    },
    {
      label: selectedNode.label,
      color: isOnline ? "#4ade80" : "#fb7185",
    },
  ];

  // Open ports — derived from mDNS service hints when present, with a
  // sane fallback so the layout still renders the chip strip.
  const portChips: Array<[string, string, string]> =
    (device.mdns_services?.split(",") ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((svc) => {
        const lower = svc.toLowerCase();
        if (lower.includes("ssh")) return ["22", "ssh", "#4ade80"];
        if (lower.includes("smb")) return ["445", "smb", "#38bdf8"];
        if (lower.includes("nfs")) return ["2049", "nfs", "#38bdf8"];
        if (lower.includes("plex")) return ["32400", "plex", "var(--accent-violet)"];
        if (lower.includes("http")) return ["80", "http", "#38bdf8"];
        return ["—", lower.slice(0, 10), "var(--text-mute)"];
      });
  const ports =
    portChips.length > 0
      ? portChips
      : ([["—", "no services", "var(--text-mute)"]] as Array<
          [string, string, string]
        >);

  // Tags — real custom tags split on comma. "+ add" stays as a chip slot
  // mirroring the source even though edit lives on the device detail page.
  const tags = (device.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div
      className="mesh-card"
      style={{ padding: 0, display: "flex", flexDirection: "column" }}
      data-testid="topology-side-panel"
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              font: "600 9.5px var(--font-sans)",
              color: statusColor,
              padding: "0 7px",
              height: 18,
              borderRadius: "var(--radius-pill)",
              background: statusBg,
              border: `var(--hairline) solid ${statusBorder}`,
            }}
          >
            <StatusDot
              status={isOnline ? "online" : "offline"}
              pulse={isOnline}
              size={5}
            />{" "}
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
          <span
            style={{
              font: "500 10px var(--font-mono)",
              color: "var(--text-faint)",
            }}
          >
            {subnet}
          </span>
        </div>
        <h3 style={{ margin: 0, font: "600 16px var(--font-sans)" }}>
          {selectedNode.label}
        </h3>
        <div
          className="mono"
          style={{
            font: "400 11px var(--font-mono)",
            color: "var(--text-dim)",
            marginTop: 3,
          }}
        >
          {ip} · {device.mac} · {vendor}
        </div>
      </div>

      {/* Live traffic */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span className="t-micro">Live · last 60s</span>
          <span
            className="mono"
            style={{
              font: "500 11px var(--font-mono)",
              color: "#38bdf8",
            }}
          >
            {liveMbps} Mbps
          </span>
        </div>
        <Spark data={spark} width={290} height={36} color="#38bdf8" />
      </div>

      {/* Path */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        <div className="t-micro" style={{ marginBottom: 8 }}>
          Path · {path.length - 1} hops
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {path.map((h, i, arr) => (
            <Fragment key={`${h.label}-${i}`}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 7px",
                  background: "var(--surface-2)",
                  border: `var(--hairline) solid ${h.color}`,
                  borderRadius: "var(--radius-sm)",
                  font: "500 10.5px var(--font-mono)",
                  color: "var(--text)",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    background: h.color,
                  }}
                />
                {h.label.length > 16 ? `${h.label.slice(0, 14)}…` : h.label}
              </span>
              {i < arr.length - 1 && (
                <span
                  style={{
                    color: "var(--text-faint)",
                    font: "500 11px var(--font-mono)",
                  }}
                >
                  →
                </span>
              )}
            </Fragment>
          ))}
        </div>
        <div
          className="mono"
          style={{
            font: "400 10px var(--font-mono)",
            color: "var(--text-mute)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          uplink · {router?.router_type ?? "router"}
          <br />
          subnet · {subnet}
        </div>
      </div>

      {/* Open ports */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        <div className="t-micro" style={{ marginBottom: 8 }}>
          Listening · {ports.length} {ports.length === 1 ? "port" : "ports"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ports.map(([port, name, c], i) => (
            <span
              key={`${port}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 6px",
                background: "var(--surface-2)",
                borderRadius: 2,
                font: "500 10.5px var(--font-mono)",
                color: "var(--text-dim)",
              }}
            >
              <span className="mono" style={{ color: c }}>
                {port}
              </span>
              <span style={{ color: "var(--text-mute)" }}>{name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tags + actions */}
      <div style={{ padding: "12px 14px", flex: 1 }}>
        <div className="t-micro" style={{ marginBottom: 8 }}>
          Tags
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 14,
          }}
        >
          {tags.length === 0 ? (
            <span
              style={{
                font: "400 11px var(--font-sans)",
                color: "var(--text-mute)",
              }}
            >
              none
            </span>
          ) : (
            tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: "2px 7px",
                  background: "var(--primary-soft)",
                  border: "var(--hairline) solid rgba(37,99,235,0.30)",
                  borderRadius: "var(--radius-sm)",
                  font: "500 10.5px var(--font-sans)",
                  color: "#2563eb",
                }}
              >
                {t}
              </span>
            ))
          )}
          <span
            style={{
              padding: "2px 7px",
              background: "transparent",
              border: "var(--hairline) dashed rgba(96,144,212,0.20)",
              borderRadius: "var(--radius-sm)",
              font: "500 10.5px var(--font-sans)",
              color: "var(--text-mute)",
              cursor: "pointer",
            }}
            onClick={onOpenDetail}
          >
            + add
          </span>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: 5 }}
          data-testid="topology-actions"
        >
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={onTrace}
          >
            <Icon name="cmd" size={12} />
            <span>Trace path from here</span>
          </button>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={onOpenDetail}
          >
            <Icon name="log" size={12} />
            <span>Open detail view</span>
          </button>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={onFilterAlerts}
          >
            <Icon name="filter" size={12} />
            <span>Filter alerts</span>
          </button>
        </div>
      </div>
    </div>
  );
}
