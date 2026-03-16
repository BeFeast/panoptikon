"use client";

import Link from "next/link";
import { Router } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveRouter = "mikrotik" | "xiaomi";

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
            ? "bg-pink-600 text-white hover:bg-pink-500"
            : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
        }
      >
        <Link href="/router/mikrotik">
          <Router className="mr-1.5 h-3.5 w-3.5" />
          MikroTik
        </Link>
      </Button>
      <Button
        variant={active === "xiaomi" ? "default" : "outline"}
        size="sm"
        asChild
        className={
          active === "xiaomi"
            ? "bg-orange-600 text-white hover:bg-orange-500"
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
