"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchSettings } from "@/lib/api";

export default function RouterRedirect() {
  const router = useRouter();

  useEffect(() => {
    const go = async () => {
      try {
        const settings = await fetchSettings();
        if (settings.default_router === "mikrotik" && settings.mikrotik_enabled) {
          router.replace("/router/mikrotik");
          return;
        }
        if (settings.default_router === "pfsense" && settings.pfsense_enabled) {
          router.replace("/router/pfsense");
          return;
        }
        if (settings.default_router === "xiaomi" && settings.xiaomi_mesh_enabled) {
          router.replace("/router/xiaomi");
          return;
        }

        if (settings.mikrotik_enabled) {
          router.replace("/router/mikrotik");
          return;
        }
        if (settings.pfsense_enabled) {
          router.replace("/router/pfsense");
          return;
        }
        if (settings.xiaomi_mesh_enabled) {
          router.replace("/router/xiaomi");
          return;
        }
      } catch {
        // fall through to default
      }
      router.replace("/router/mikrotik");
    };
    go();
  }, [router]);

  return (
    <div className="flex min-h-64 items-center justify-center">
      <div className="rounded-md border border-mesh-border-strong bg-mesh-surface-1 px-4 py-3 text-sm text-slate-400">
        Selecting router workspace...
      </div>
    </div>
  );
}
