"use client";

import Link from "next/link";
import { Router } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveRouter = "mikrotik" | "xiaomi" | "pfsense";

interface RouterSelectorProps {
  active: ActiveRouter;
}

export function RouterSelector({ active }: RouterSelectorProps) {
  const itemClass =
    "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-100";
  const activeClass =
    "border-cyan-400/50 bg-cyan-500/15 text-cyan-100 shadow-none hover:bg-cyan-500/20";

  return (
    <div className="flex flex-wrap gap-2" aria-label="Router clients">
      <Button
        variant={active === "mikrotik" ? "default" : "outline"}
        size="sm"
        asChild
        className={active === "mikrotik" ? activeClass : itemClass}
      >
        <Link href="/router/mikrotik">
          <Router className="mr-1.5 h-3.5 w-3.5" />
          MikroTik
        </Link>
      </Button>
      <Button
        variant={active === "pfsense" ? "default" : "outline"}
        size="sm"
        asChild
        className={active === "pfsense" ? activeClass : itemClass}
      >
        <Link href="/router/pfsense">
          <Router className="mr-1.5 h-3.5 w-3.5" />
          pfSense
        </Link>
      </Button>
      <Button
        variant={active === "xiaomi" ? "default" : "outline"}
        size="sm"
        asChild
        className={
          active === "xiaomi"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
            : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-300"
        }
      >
        <Link href="/router/xiaomi">
          <Router className="mr-1.5 h-3.5 w-3.5" />
          Xiaomi
        </Link>
      </Button>
    </div>
  );
}
