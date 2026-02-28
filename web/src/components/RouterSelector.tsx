"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Router, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSettings } from "@/lib/api";

type ActiveRouter = "mikrotik" | "xiaomi" | "vyos";

interface RouterSelectorProps {
  active: ActiveRouter;
}

export function RouterSelector({ active }: RouterSelectorProps) {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mikrotikEnabled, setMikrotikEnabled] = useState(false);
  const [vyosConfigured, setVyosConfigured] = useState(false);
  const [xiaomiEnabled, setXiaomiEnabled] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchSettings();
        setMikrotikEnabled(settings.mikrotik_enabled);
        setVyosConfigured(!!settings.vyos_url && settings.vyos_api_key_set);
        setXiaomiEnabled(settings.xiaomi_mesh_enabled);
      } catch {
        // ignore
      }
      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  if (!settingsLoaded) {
    return <Skeleton className="h-9 w-48" />;
  }

  const count = [mikrotikEnabled, xiaomiEnabled, vyosConfigured].filter(Boolean).length;
  if (count === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {mikrotikEnabled && (
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
        )}
        {xiaomiEnabled && (
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
        )}
        {vyosConfigured && (
          <Button
            variant={active === "vyos" ? "default" : "outline"}
            size="sm"
            asChild
            className={
              active === "vyos"
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
            }
          >
            <Link href="/router">
              <Router className="mr-1.5 h-3.5 w-3.5" />
              VyOS
              <Badge
                variant="outline"
                className="ml-1.5 border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0"
              >
                Legacy
              </Badge>
            </Link>
          </Button>
        )}
      </div>
      {active === "vyos" && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-400">
            VyOS support is legacy. MikroTik is the recommended router platform for new deployments.
          </p>
        </div>
      )}
    </div>
  );
}
