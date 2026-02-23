"use client";

/**
 * StatusSparkline — 24 vertical bars showing device online/offline history.
 * Green (#10b981) = online, red/slate (#334155) = offline.
 */
export function StatusSparkline({
  timeline,
  width = 96,
  height = 16,
}: {
  timeline: boolean[];
  width?: number;
  height?: number;
}) {
  if (timeline.length === 0) return null;

  const bars = timeline.length;
  const gap = 1;
  const barWidth = (width - gap * (bars - 1)) / bars;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      aria-label="24-hour status history"
    >
      {timeline.map((online, i) => (
        <rect
          key={i}
          x={i * (barWidth + gap)}
          y={0}
          width={barWidth}
          height={height}
          rx={1}
          fill={online ? "#10b981" : "#334155"}
        />
      ))}
    </svg>
  );
}
