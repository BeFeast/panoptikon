"use client";

import Link from "next/link";
import { Network, Router, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveRouter = "mikrotik" | "xiaomi" | "pfsense";

interface RouterSelectorProps {
  active: ActiveRouter;
}

const primaryActive =
  "border-mesh-accent/40 bg-mesh-accent/15 text-mesh-text hover:bg-mesh-accent/20";
const inactive =
  "border-mesh-border bg-mesh-surface-1 text-mesh-text-dim hover:bg-mesh-surface-2 hover:text-white";

export function RouterSelector({ active }: RouterSelectorProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button
        variant={active === "mikrotik" ? "default" : "outline"}
        size="sm"
        asChild
        className={active === "mikrotik" ? primaryActive : inactive}
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
        className={active === "pfsense" ? primaryActive : inactive}
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
            ? "border-[#fbbf24]/40 bg-[#fbbf24]/12 text-[#fbbf24] hover:bg-[#fbbf24]/20"
            : "border-mesh-border bg-mesh-surface-1 text-mesh-text-mute hover:bg-mesh-surface-2 hover:text-white"
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
