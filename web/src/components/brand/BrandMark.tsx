import { cn } from "@/lib/utils";

interface BrandMarkProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * Panoptikon mesh mark.
 *
 * Faithful port of LogoMesh from the design handoff source
 * (panopticon/project/logos.jsx). Five nodes arranged as a
 * constellation, with axis links rendered in a sky-to-cobalt
 * gradient and dashed guide links in muted blue.
 */
export function BrandMark({ size = 32, className, glow = true }: BrandMarkProps) {
  const nodes = [
    { x: 14, y: 18, r: 2.6 },
    { x: 50, y: 14, r: 2.2 },
    { x: 32, y: 32, r: 3.2 },
    { x: 12, y: 48, r: 2.2 },
    { x: 52, y: 50, r: 2.6 },
  ];
  const links: Array<[number, number]> = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [0, 1],
    [3, 4],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn("shrink-0", className)}
      aria-label="Panoptikon"
      role="img"
      data-brand-mark="panoptikon"
    >
      <defs>
        <linearGradient id="panoptikonMeshAxis" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {links.map(([a, b], i) => {
        const isAxis = i < 4;
        return (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            stroke={isAxis ? "url(#panoptikonMeshAxis)" : "rgba(96,144,212,0.35)"}
            strokeWidth={isAxis ? 1 : 0.75}
            strokeDasharray={isAxis ? undefined : "2 4"}
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map((n, i) => {
        const isCenter = i === 2;
        return (
          <g key={i}>
            {isCenter && glow && (
              <circle cx={n.x} cy={n.y} r={n.r + 4} fill="#2563eb" opacity="0.14" />
            )}
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={isCenter ? "#2563eb" : "#0c1b30"}
              stroke={isCenter ? "#5eead4" : "#38bdf8"}
              strokeWidth={1}
            />
            {isCenter && <circle cx={n.x} cy={n.y} r={1} fill="#5eead4" />}
          </g>
        );
      })}
    </svg>
  );
}
