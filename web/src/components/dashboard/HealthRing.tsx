"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface HealthRingProps {
  online: number;
  total: number;
}

export function HealthRing({ online, total }: HealthRingProps) {
  const pct = total === 0 ? 0 : Math.round((online / total) * 100);
  const circumference = 2 * Math.PI * 40; // r=40
  const offset = circumference - (pct / 100) * circumference;

  const color =
    pct >= 90
      ? "stroke-[#4ade80]"
      : pct >= 70
        ? "stroke-[#fbbf24]"
        : "stroke-[#fb7185]";
  const bgColor =
    pct >= 90
      ? "text-[#4ade80]/10"
      : pct >= 70
        ? "text-[#fbbf24]/10"
        : "text-[#fb7185]/10";
  const textColor =
    pct >= 90
      ? "text-[#4ade80]"
      : pct >= 70
        ? "text-[#fbbf24]"
        : "text-[#fb7185]";

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="relative aspect-square w-full max-w-[7rem]">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              strokeWidth="8"
              className="text-mesh-text-mute/10 stroke-current"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-medium text-mesh-text-mute">N/A</span>
          </div>
        </div>
        <span className="text-xs text-mesh-text-mute text-center">
          No critical devices
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="relative aspect-square w-full max-w-[7rem]">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="8"
            className={`${bgColor} stroke-current`}
          />
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold tabular-nums ${textColor}`}>
            {pct}%
          </span>
        </div>
      </div>
      <span className="text-xs text-mesh-text-mute">
        {online}/{total} critical online
      </span>
    </div>
  );
}
