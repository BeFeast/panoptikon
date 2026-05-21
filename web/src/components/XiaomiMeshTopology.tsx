"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, RefreshCw, Router, Wifi, Cable } from "lucide-react";
import { fetchXiaomiTopology } from "@/lib/api";
import type { XiaomiTopology, XiaomiTopoNode, XiaomiTopoLeaf } from "@/lib/types";

// ─── Name resolution ─────────────────────────────────────
//
// Issue #807: Xiaomi mesh satellites that were never renamed in the router
// admin send `name: "default"`. The backend now strips that placeholder, so
// `node.name` arrives as `null` when the user has not customized it. Resolve
// to the next most-specific identifier instead of rendering a wall of
// "Mesh Node" cards.
function resolveNodeLabel(node: XiaomiTopoNode, fallbackIndex: number): string {
  const candidates = [node.name, node.locale, node.ip, node.mac];
  for (const c of candidates) {
    if (c && c.trim()) return c;
  }
  return node.is_main ? "Main Router" : `Satellite ${fallbackIndex + 1}`;
}

function resolveLeafLabel(leaf: XiaomiTopoLeaf): string {
  const candidates = [leaf.name, leaf.ip, leaf.mac];
  for (const c of candidates) {
    if (c && c.trim()) return c;
  }
  return "Unknown";
}

function roleLabel(node: XiaomiTopoNode): string {
  if (node.is_main || node.role === "main") return "Main";
  const backhaul = (node.backhaul || "").toLowerCase();
  if (backhaul === "wired" || backhaul === "wire") return "Satellite · Wired";
  if (backhaul === "wireless" || backhaul === "wifi") return "Satellite · Wi-Fi";
  // Legacy locale-as-role fallback ("master"/"slave" from older firmware).
  if (node.locale && node.locale.trim()) {
    return `Satellite · ${node.locale}`;
  }
  return "Satellite";
}

// ─── SVG layout ──────────────────────────────────────────
//
// Compact radial layout: main router at center, satellites arranged on a ring
// around it. Tuned for the topology-page Mesh tab (lives inside a scroll
// container, so we cap height around 480px) but the viewBox scales.

const VIEW_W = 720;
const VIEW_H = 480;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const SAT_RING_R = 160;
const MAIN_RECT_W = 168;
const MAIN_RECT_H = 64;
const SAT_RECT_W = 148;
const SAT_RECT_H = 58;

interface PositionedNode {
  node: XiaomiTopoNode;
  x: number;
  y: number;
  leafs: XiaomiTopoLeaf[];
}

function layoutTopology(
  data: XiaomiTopology,
): {
  main: PositionedNode | null;
  satellites: PositionedNode[];
} {
  const nodes = data.nodes;
  if (nodes.length === 0) return { main: null, satellites: [] };

  const mainIdx = nodes.findIndex((n) => n.is_main || n.role === "main");
  const mainNode = mainIdx >= 0 ? nodes[mainIdx] : nodes[0];
  const satNodes = nodes.filter((n) => n !== mainNode);

  const leafsByParent = new Map<string, XiaomiTopoLeaf[]>();
  for (const leaf of data.leafs) {
    const key = leaf.parent_id ?? "";
    const list = leafsByParent.get(key) ?? [];
    list.push(leaf);
    leafsByParent.set(key, list);
  }
  const leafsFor = (n: XiaomiTopoNode): XiaomiTopoLeaf[] => {
    if (n.mac && leafsByParent.has(n.mac)) return leafsByParent.get(n.mac)!;
    return [];
  };

  const main: PositionedNode = {
    node: mainNode,
    x: CENTER_X,
    y: CENTER_Y,
    leafs: leafsFor(mainNode),
  };

  const satellites: PositionedNode[] = satNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(satNodes.length, 1) - Math.PI / 2;
    return {
      node: n,
      x: CENTER_X + Math.cos(angle) * SAT_RING_R,
      y: CENTER_Y + Math.sin(angle) * SAT_RING_R,
      leafs: leafsFor(n),
    };
  });

  return { main, satellites };
}

// ─── Main Component ──────────────────────────────────────

export default function XiaomiMeshTopology() {
  const [data, setData] = useState<XiaomiTopology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const layout = useMemo(
    () => (data ? layoutTopology(data) : { main: null, satellites: [] }),
    [data],
  );

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

  const allPositioned = layout.main
    ? [layout.main, ...layout.satellites]
    : layout.satellites;

  return (
    <div className="space-y-4" data-testid="xiaomi-mesh-topology">
      {/* Header row — title + refresh */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Compact stats strip */}
      {!loading && data && (
        <div
          className="mesh-card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 text-[11px]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span className="text-mesh-text-dim">
            <span className="text-mesh-text">{stats.nodeCount}</span>{" "}
            mesh node{stats.nodeCount !== 1 ? "s" : ""}
          </span>
          <span className="text-mesh-text-dim">
            <span className="text-mesh-text">{stats.totalDevices}</span>{" "}
            online device{stats.totalDevices !== 1 ? "s" : ""}
          </span>
          <span className="text-mesh-text-dim">
            <span className="text-mesh-text">{stats.totalLeafs}</span>{" "}
            connected client{stats.totalLeafs !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mesh-card space-y-2 p-4">
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
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className="mesh-card flex items-center justify-center p-12 text-sm text-mesh-text-dim"
          data-testid="xiaomi-mesh-loading"
        >
          Loading mesh topology…
        </div>
      )}

      {/* SVG topology map */}
      {!loading && data && allPositioned.length > 0 && (
        <div
          className="mesh-card relative overflow-hidden"
          style={{ padding: 0 }}
          data-testid="xiaomi-mesh-svg-container"
        >
          {/* Blueprint grid background — mirrors /topology canvas chrome */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(96,144,212,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(96,144,212,0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <svg
            role="img"
            aria-label="Xiaomi mesh topology"
            data-testid="xiaomi-mesh-svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            style={{
              position: "relative",
              width: "100%",
              height: "auto",
              maxHeight: 520,
              display: "block",
            }}
          >
            {/* Edges: main → satellites */}
            {layout.main &&
              layout.satellites.map((sat, i) => {
                const isWired =
                  (sat.node.backhaul ?? "").toLowerCase() === "wired";
                return (
                  <line
                    key={`edge-${i}`}
                    x1={layout.main!.x}
                    y1={layout.main!.y}
                    x2={sat.x}
                    y2={sat.y}
                    stroke={
                      isWired
                        ? "var(--accent-cyan)"
                        : "var(--accent-violet)"
                    }
                    strokeWidth={isWired ? 1.4 : 1}
                    strokeDasharray={isWired ? undefined : "5 4"}
                    opacity={0.6}
                  />
                );
              })}

            {/* Nodes */}
            {allPositioned.map((pn, i) => {
              const isMain = pn.node.is_main || pn.node.role === "main";
              const w = isMain ? MAIN_RECT_W : SAT_RECT_W;
              const h = isMain ? MAIN_RECT_H : SAT_RECT_H;
              const label = resolveNodeLabel(pn.node, i);
              const role = roleLabel(pn.node);
              const key =
                pn.node.mac || pn.node.ip || `node-${i}`;
              const isSelected = selectedKey === key;
              const accent = isMain
                ? "var(--status-warning)"
                : "var(--accent-cyan)";

              return (
                <g
                  key={key}
                  transform={`translate(${pn.x},${pn.y})`}
                  onClick={() =>
                    setSelectedKey((prev) => (prev === key ? null : key))
                  }
                  style={{ cursor: "pointer" }}
                  data-testid={`xiaomi-mesh-node-${
                    isMain ? "main" : "sat"
                  }`}
                  data-node-label={label}
                  data-node-role={role}
                >
                  <rect
                    x={-w / 2}
                    y={-h / 2}
                    width={w}
                    height={h}
                    rx={4}
                    fill="var(--surface-2)"
                    stroke={isSelected ? accent : "rgba(96,144,212,0.30)"}
                    strokeWidth={isSelected ? 1.5 : 1}
                  />
                  {/* Role line */}
                  <text
                    x={0}
                    y={-h / 2 + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill={accent}
                    fontFamily="var(--font-mono)"
                    style={{
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {role}
                  </text>
                  {/* Name line — truncated to fit the box */}
                  <text
                    x={0}
                    y={-h / 2 + 30}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={600}
                    fill="var(--text)"
                    fontFamily="var(--font-sans)"
                  >
                    {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                  </text>
                  {/* IP + device count */}
                  <text
                    x={0}
                    y={-h / 2 + 46}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-dim)"
                    fontFamily="var(--font-mono)"
                  >
                    {(pn.node.ip || "—") +
                      "  ·  " +
                      (pn.node.online ?? 0) +
                      " dev"}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Detail panel for selected node */}
      {!loading && data && selectedKey && (
        <SelectedNodePanel
          allPositioned={allPositioned}
          selectedKey={selectedKey}
          onClose={() => setSelectedKey(null)}
        />
      )}

      {/* Empty state */}
      {!loading && !error && data && allPositioned.length === 0 && (
        <div className="mesh-card flex flex-col items-center gap-3 py-12">
          <Router className="h-10 w-10 text-mesh-text-mute" />
          <p className="text-sm text-mesh-text-dim">
            No mesh nodes found. Make sure the Xiaomi mesh integration is
            configured in Settings.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Selected node detail ────────────────────────────────

function SelectedNodePanel({
  allPositioned,
  selectedKey,
  onClose,
}: {
  allPositioned: PositionedNode[];
  selectedKey: string;
  onClose: () => void;
}) {
  const found = allPositioned.find(
    (pn, i) => (pn.node.mac || pn.node.ip || `node-${i}`) === selectedKey,
  );
  if (!found) return null;
  const isMain = found.node.is_main || found.node.role === "main";
  const label = resolveNodeLabel(found.node, 0);
  const role = roleLabel(found.node);
  const backhaul = (found.node.backhaul ?? "").toLowerCase();
  const Icon = isMain ? Crown : backhaul === "wired" ? Cable : Wifi;

  return (
    <div
      className="mesh-card p-4"
      data-testid="xiaomi-mesh-node-detail"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: isMain
                ? "rgba(251,191,36,0.16)"
                : "rgba(56,189,248,0.16)",
              color: isMain
                ? "var(--status-warning)"
                : "var(--accent-cyan)",
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mesh-text">{label}</p>
            <p
              className="text-[11px] uppercase tracking-wider text-mesh-text-mute"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {role}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
        <DetailRow label="IP" value={found.node.ip || "—"} mono />
        <DetailRow label="MAC" value={found.node.mac || "—"} mono />
        <DetailRow label="Hardware" value={found.node.hardware || "—"} />
        <DetailRow
          label="Online devices"
          value={String(found.node.online ?? 0)}
        />
      </div>

      {found.leafs.length > 0 && (
        <div className="mt-3 border-t border-mesh-border-strong pt-3">
          <p
            className="mb-2 text-[10px] uppercase tracking-wider text-mesh-text-mute"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Connected clients ({found.leafs.length})
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[12px]">
            {found.leafs.map((leaf, i) => (
              <li
                key={leaf.mac || leaf.ip || `leaf-${i}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate text-mesh-text">
                  {resolveLeafLabel(leaf)}
                </span>
                <span
                  className="shrink-0 text-mesh-text-mute"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {leaf.ip || "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="shrink-0 text-[10px] uppercase tracking-wider text-mesh-text-mute"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-mesh-text ${
          mono ? "tabular-nums" : ""
        }`}
        style={mono ? { fontFamily: "var(--font-mono)" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
