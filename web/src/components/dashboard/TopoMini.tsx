"use client";
import type { TopologyGraph } from "@/lib/types";

export interface TopoMiniProps {
  /** Optional live topology — used to build the node ring. */
  topology?: TopologyGraph | null;
}

/**
 * TopoMini — compact topology preview port of dashboard.jsx TopoMini.
 *
 * If `topology` is supplied, a router hub is rendered at the centre with up
 * to eight live device nodes arranged in a ring around it (online tinted,
 * offline muted). With no data we fall back to the design-handoff layout
 * (WAN → router → APs/switch → clients) so the card never reads as empty.
 */
export function TopoMini({ topology }: TopoMiniProps) {
  if (topology && topology.devices.length > 0) {
    const cx = 50;
    const cy = 80;
    const devices = topology.devices.slice(0, 8);
    const ring = devices.map((d, i) => {
      const angle = (i / devices.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 38;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        device: d,
      };
    });

    return (
      <svg
        viewBox="0 0 100 160"
        style={{ width: "100%", height: "100%", display: "block" }}
        aria-label="Topology preview"
        role="img"
      >
        {ring.map((n, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke="hsl(var(--border))"
            strokeWidth="0.6"
            opacity={n.device.is_online ? 0.7 : 0.3}
          />
        ))}
        <circle
          cx={cx}
          cy={cy}
          r="7"
          fill="hsl(var(--primary))"
          stroke="hsl(var(--ring))"
          strokeWidth="0.6"
        />
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="3.4"
          fill="hsl(var(--muted-foreground))"
          fontFamily="var(--font-mono)"
        >
          router
        </text>
        {ring.map((n, i) => (
          <g key={i}>
            <circle
              cx={n.x}
              cy={n.y}
              r="4"
              fill="hsl(var(--secondary))"
              stroke={
                n.device.is_online
                  ? "hsl(var(--status-online))"
                  : "hsl(var(--status-offline))"
              }
              strokeWidth="0.5"
              opacity={n.device.is_online ? 1 : 0.55}
            />
            <text
              x={n.x}
              y={n.y + 8}
              textAnchor="middle"
              fontSize="3"
              fill="hsl(var(--muted-foreground))"
              fontFamily="var(--font-mono)"
            >
              {(
                n.device.name ||
                n.device.hostname ||
                n.device.ips[0] ||
                ""
              ).slice(0, 10)}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  // Static placeholder mirroring the design handoff layout.
  const nodes = [
    { x: 50, y: 20, r: 12, label: "WAN", kind: "wan" as const },
    { x: 50, y: 60, r: 14, label: "router", kind: "router" as const },
    { x: 22, y: 100, r: 10, label: "AP-LR", kind: "ap" as const },
    { x: 50, y: 100, r: 10, label: "AP-Pro", kind: "ap" as const },
    { x: 78, y: 100, r: 10, label: "Sw24", kind: "switch" as const },
    { x: 10, y: 140, r: 6, label: "14", kind: "client" as const },
    { x: 30, y: 145, r: 6, label: "22", kind: "client" as const },
    { x: 50, y: 145, r: 6, label: "8", kind: "client" as const },
    { x: 70, y: 145, r: 6, label: "42", kind: "client" as const },
    { x: 90, y: 140, r: 6, label: "56", kind: "client" as const },
  ];
  const links: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 5],
    [2, 6],
    [3, 7],
    [4, 8],
    [4, 9],
  ];

  return (
    <svg
      viewBox="0 0 100 160"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="Topology preview"
      role="img"
    >
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="hsl(var(--border))"
          strokeWidth="0.6"
          opacity={0.7}
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r * 0.5}
            fill={
              n.kind === "wan"
                ? "hsl(var(--accent))"
                : n.kind === "router"
                  ? "hsl(var(--primary))"
                  : "hsl(var(--secondary))"
            }
            stroke={
              n.kind === "router"
                ? "hsl(var(--ring))"
                : "hsl(var(--border))"
            }
            strokeWidth="0.5"
          />
          <text
            x={n.x}
            y={n.y + n.r * 0.5 + 4}
            textAnchor="middle"
            fontSize="3.4"
            fill="hsl(var(--muted-foreground))"
            fontFamily="var(--font-mono)"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
