"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useMotionValue, animate } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";

interface InfoStatCardProps {
  icon: React.ReactNode;
  iconColorClass: string;
  label: string;
  value: string;
  numericValue?: number;
  formatValue?: (v: number) => string;
  sparklineData?: number[];
  sparklineColorClass?: string;
  glowColorClass?: string;
  className?: string;
}

/**
 * Reusable card for displaying a single icon + label + value stat.
 *
 * Layout tokens:
 *  - Icon block: 48×48 (h-12 w-12), centered, rounded-lg, gradient bg
 *  - Label:      11px uppercase tracking-wider, slate-500
 *  - Value:      14px (text-sm) semibold white, truncated with title tooltip
 *  - Min height: 80px (min-h-[5rem]) for comfortable card rhythm
 *  - Gap:        16px (gap-4) between icon and text
 *  - Padding:    16px all around (p-4)
 *
 * Optional features:
 *  - numericValue + formatValue → animated counter (counts up from 0)
 *  - sparklineData → mini trend line next to value
 *  - glowColorClass → subtle radial glow in bottom-right
 */

function AnimatedValue({
  value,
  formatValue,
}: {
  value: number;
  formatValue?: (v: number) => string;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState("0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      motionValue.set(value);
      setDisplay(formatValue ? formatValue(value) : String(value));
      return;
    }
    hasAnimated.current = true;
    const controls = animate(motionValue, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => {
        setDisplay(
          formatValue ? formatValue(Math.round(v)) : String(Math.round(v)),
        );
      },
    });
    return () => controls.stop();
  }, [value, motionValue, formatValue]);

  return <span className="tabular-nums">{display}</span>;
}

export function InfoStatCard({
  icon,
  iconColorClass,
  label,
  value,
  numericValue,
  formatValue,
  sparklineData,
  sparklineColorClass,
  glowColorClass,
  className,
}: InfoStatCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-800/50 bg-slate-900/60 shadow-none",
        className,
      )}
    >
      <CardContent className="flex min-h-[5rem] items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            iconColorClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <div className="flex items-center gap-2">
            <p
              className="truncate text-sm font-semibold text-white"
              title={value !== "\u2014" ? value : undefined}
            >
              {numericValue != null ? (
                <AnimatedValue value={numericValue} formatValue={formatValue} />
              ) : (
                value
              )}
            </p>
            {sparklineData && sparklineData.length >= 2 && (
              <Sparkline
                data={sparklineData}
                strokeClass={sparklineColorClass}
              />
            )}
          </div>
        </div>
      </CardContent>

      {/* Subtle background glow — radial, bottom-right, 5-10% opacity */}
      {glowColorClass && (
        <div
          className={cn(
            "pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 rounded-full blur-2xl",
            glowColorClass,
          )}
        />
      )}
    </Card>
  );
}
