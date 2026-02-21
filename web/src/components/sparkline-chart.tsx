"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineChartProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function SparklineChart({
  data,
  color = "#3b82f6",
  width = 80,
  height = 24,
}: SparklineChartProps) {
  if (data.length === 0) return <span className="text-slate-600 text-xs">—</span>;

  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
