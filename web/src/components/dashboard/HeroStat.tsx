"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HeroStatProps {
  title: string;
  value: number;
  suffix?: string;
  prefix?: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  href?: string;
  formatValue?: (v: number) => string;
}

function AnimatedCounter({
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
      // After first animation, just snap to new value
      motionValue.set(value);
      setDisplay(formatValue ? formatValue(value) : String(value));
      return;
    }
    hasAnimated.current = true;
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        setDisplay(
          formatValue ? formatValue(Math.round(v)) : String(Math.round(v))
        );
      },
    });
    return () => controls.stop();
  }, [value, motionValue, formatValue]);

  return <span className="tabular-nums">{display}</span>;
}

export function HeroStat({
  title,
  value,
  suffix,
  prefix,
  subtitle,
  icon,
  gradient,
  href,
  formatValue,
}: HeroStatProps) {
  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-700/40 h-full",
        gradient,
        href && "transition-shadow hover:shadow-lg hover:shadow-black/20"
      )}
    >
      <CardContent className="relative z-10 flex flex-col justify-between p-5 h-full min-h-[140px]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-white/70">
            {title}
          </span>
          <span className="text-white/50">{icon}</span>
        </div>
        <div className="mt-auto">
          <p className="text-3xl font-bold text-white leading-none">
            {prefix}
            <AnimatedCounter value={value} formatValue={formatValue} />
            {suffix}
          </p>
          <p className="mt-1.5 text-sm text-white/60">{subtitle}</p>
        </div>
      </CardContent>
      {/* Decorative glow */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
