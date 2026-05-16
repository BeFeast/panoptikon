"use client";

import Link from "next/link";
import { Network, Router, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveRouter = "mikrotik" | "xiaomi" | "pfsense";

interface RouterSelectorProps {
  active: ActiveRouter;
}

export function RouterSelector({ active }: RouterSelectorProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button
        variant={active === "mikrotik" ? "default" : "outline"}
        size="sm"
        asChild
        className={
          active === "mikrotik"
            ? "bg-cyan-600 text-white hover:bg-cyan-500"
            : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white"
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
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white"
        }
      >
        <Link href="/router/pfsense">
          <Shield className="mr-1.5 h-3.5 w-3.5" />
          pfSense
        </Link>
      </Button>
      <Button
        variant={active === "xiaomi" ? "default" : "outline"}
        size="sm"
        asChild
        className={
          active === "xiaomi"
            ? "bg-orange-600 text-white hover:bg-orange-500"
            : "border-slate-800 bg-slate-950 text-slate-500 hover:bg-slate-800 hover:text-white"
        }
      >
        <Link href="/router/xiaomi">
          <Network className="mr-1.5 h-3.5 w-3.5" />
          Xiaomi
        </Link>
      </Button>
    </div>
  );
}
