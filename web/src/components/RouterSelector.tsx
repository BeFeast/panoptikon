"use client";

import Link from "next/link";
import { Router } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveRouter = "mikrotik" | "xiaomi" | "pfsense";

interface RouterSelectorProps {
  active: ActiveRouter;
}

export function RouterSelector({ active }: RouterSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={active === "mikrotik" ? "default" : "outline"}
        size="sm"
        asChild
        className={
          active === "mikrotik"
            ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20"
            : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
        }
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
        className={
          active === "pfsense"
            ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20"
            : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
        }
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
            ? "border-orange-400/40 bg-orange-400/12 text-orange-100 hover:bg-orange-400/20"
            : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
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
