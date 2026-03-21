"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function AnimatedCounter({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
    });
    return controls.stop;
  }, [motionValue, value, duration]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return unsubscribe;
  }, [rounded]);

  return <span>{display.toLocaleString()}</span>;
}

export interface HeroStatProps {
  title: string;
  value: number;
  formattedValue?: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  href?: string;
}

export function HeroStat({
  title,
  value,
  formattedValue,
  subtitle,
  icon,
  gradient,
  href,
}: HeroStatProps) {
  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden border-0 h-full",
        gradient,
        href && "transition-shadow hover:shadow-lg hover:shadow-slate-900/50",
      )}
    >
      <CardContent className="relative z-10 flex flex-col justify-between p-5 h-full min-h-[7.5rem]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-white/70">
            {title}
          </span>
          <span className="text-white/50">{icon}</span>
        </div>
        <div className="mt-3">
          <motion.p
            className="text-3xl font-bold tabular-nums text-white"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {formattedValue ?? <AnimatedCounter value={value} />}
          </motion.p>
          <p className="mt-1 text-xs text-white/60">{subtitle}</p>
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
