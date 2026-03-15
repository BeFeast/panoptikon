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
        if (
          settings.default_router === "pfsense" &&
          settings.pfsense_enabled
        ) {
          router.replace("/router/pfsense");
          return;
        }
        if (
          settings.default_router === "xiaomi" &&
          settings.xiaomi_mesh_enabled
        ) {
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
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
