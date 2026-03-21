"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import { useMotionValue, useTransform, motion, animate } from "framer-motion";

interface InfoStatCardProps {
  icon: React.ReactNode;
  iconColorClass: string;
  label: string;
  value: string;
  className?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  glowColor?: string;
}

function AnimatedNumber({ value }: { value: string }) {
  const numMatch = value.match(/^([\d,]+(?:\.\d+)?)(.*)/);
  if (!numMatch) return <>{value}</>;

  const rawNum = numMatch[1].replace(/,/g, "");
  const target = parseFloat(rawNum);
  const suffix = numMatch[2];
  const hasCommas = numMatch[1].includes(",");
  const decimals = rawNum.includes(".") ? rawNum.split(".")[1].length : 0;

  return (
    <AnimatedCounter
      target={target}
      suffix={suffix}
      decimals={decimals}
      hasCommas={hasCommas}
    />
  );
}

function AnimatedCounter({
  target,
  suffix,
  decimals,
  hasCommas,
}: {
  target: number;
  suffix: string;
  decimals: number;
  hasCommas: boolean;
}) {
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => {
    const fixed = v.toFixed(decimals);
    if (hasCommas) {
      const [int, dec] = fixed.split(".");
      const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return dec ? `${formatted}.${dec}` : formatted;
    }
    return fixed;
  });

  React.useEffect(() => {
    const controls = animate(motionVal, target, {
      duration: 0.6,
      ease: "easeOut",
    });
    return controls.stop;
  }, [motionVal, target]);

  return (
    <>
      <motion.span>{display}</motion.span>
      {suffix}
    </>
  );
}

export function InfoStatCard({
  icon,
  iconColorClass,
  label,
  value,
  className,
  sparklineData,
  sparklineColor,
  glowColor,
}: InfoStatCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-800/50 bg-slate-900/60 shadow-none",
        className,
      )}
    >
      {glowColor && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 90% 90%, ${glowColor} 0%, transparent 60%)`,
            opacity: 0.07,
          }}
        />
      )}
      <CardContent className="relative flex min-h-[5rem] items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b",
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
              <AnimatedNumber value={value} />
            </p>
            {sparklineData && sparklineData.length >= 2 && (
              <Sparkline
                data={sparklineData}
                color={sparklineColor}
                width={48}
                height={18}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
