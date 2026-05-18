"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSettings } from "@/lib/api";
import PfSenseRouter from "@/components/pfsense/PfSenseRouter";
import PfSenseRouterDesign from "@/components/router/PfSenseRouterDesign";
import { PageTransition } from "@/components/PageTransition";
import { useHashTab } from "@/hooks/useHashTab";
import {
  RouterWorkspace,
  RouterWorkspaceLoading,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

const PFSENSE_TAB_IDS = [
  "system",
  "interfaces",
  "firewall",
  "dhcp",
  "dns",
  "services",
  "routing",
  "config",
] as const;

type PfsenseTab = (typeof PFSENSE_TAB_IDS)[number];

export default function PfSenseRouterPage() {
  return (
    <Suspense
      fallback={
        <PageTransition>
          <RouterWorkspace active="pfsense">
            <RouterWorkspaceLoading />
          </RouterWorkspace>
        </PageTransition>
      }
    >
      <PfSenseRouterPageInner />
    </Suspense>
  );
}

function PfSenseRouterPageInner() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pfsenseEnabled, setPfsenseEnabled] = useState(false);
  const [tab, setTab] = useHashTab<PfsenseTab>("system", [...PFSENSE_TAB_IDS]);
  const search = useSearchParams();
  const legacy = search?.get("legacy") === "1";

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchSettings();
        setPfsenseEnabled(settings.pfsense_enabled);
      } catch {
        // ignore
      }
      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  return (
    <PageTransition>
      <RouterWorkspace active="pfsense">
        {!settingsLoaded ? (
          <RouterWorkspaceLoading />
        ) : pfsenseEnabled ? (
          legacy ? (
            <PfSenseRouter />
          ) : (
            <PfSenseRouterDesign
              activeTab={tab}
              onTabChange={(v) =>
                setTab(
                  (PFSENSE_TAB_IDS as readonly string[]).includes(v)
                    ? (v as PfsenseTab)
                    : "system",
                )
              }
            />
          )
        ) : (
          <RouterWorkspaceState
            title="pfSense Not Configured"
            description="Enable the pfSense integration and save a firewall host before using the router workspace."
            settingsHref="/settings/pfsense"
            settingsLabel="Configure pfSense"
          />
        )}
      </RouterWorkspace>
    </PageTransition>
  );
}
