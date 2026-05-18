"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSettings } from "@/lib/api";
import MikrotikRouter from "@/components/MikrotikRouter";
import MikrotikRouterDesign from "@/components/router/MikrotikRouterDesign";
import { PageTransition } from "@/components/PageTransition";
import { useHashTab } from "@/hooks/useHashTab";
import {
  RouterWorkspace,
  RouterWorkspaceLoading,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

const MIKROTIK_TAB_IDS = [
  "system",
  "interfaces",
  "vlans",
  "routes",
  "dhcp",
  "firewall",
  "nat",
  "dns",
  "wireguard",
] as const;

type MikrotikTab = (typeof MIKROTIK_TAB_IDS)[number];

export default function MikrotikRouterPage() {
  return (
    <Suspense
      fallback={
        <PageTransition>
          <RouterWorkspace active="mikrotik">
            <RouterWorkspaceLoading />
          </RouterWorkspace>
        </PageTransition>
      }
    >
      <MikrotikRouterPageInner />
    </Suspense>
  );
}

function MikrotikRouterPageInner() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mikrotikEnabled, setMikrotikEnabled] = useState(false);
  const [tab, setTab] = useHashTab<MikrotikTab>("interfaces", [
    ...MIKROTIK_TAB_IDS,
  ]);
  const search = useSearchParams();
  const legacy = search?.get("legacy") === "1";

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchSettings();
        setMikrotikEnabled(settings.mikrotik_enabled);
      } catch {
        // ignore
      }
      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  return (
    <PageTransition>
      <RouterWorkspace active="mikrotik">
        {!settingsLoaded ? (
          <RouterWorkspaceLoading />
        ) : mikrotikEnabled ? (
          legacy ? (
            <MikrotikRouter />
          ) : (
            <MikrotikRouterDesign
              activeTab={tab}
              onTabChange={(v) =>
                setTab(
                  (MIKROTIK_TAB_IDS as readonly string[]).includes(v)
                    ? (v as MikrotikTab)
                    : "interfaces",
                )
              }
            />
          )
        ) : (
          <RouterWorkspaceState
            title="MikroTik Not Configured"
            description="Enable the MikroTik integration and save a RouterOS endpoint before using the router workspace."
            settingsHref="/settings/router"
            settingsLabel="Configure Router"
          />
        )}
      </RouterWorkspace>
    </PageTransition>
  );
}
