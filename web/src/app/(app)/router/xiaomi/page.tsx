"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useHashTab } from "@/hooks/useHashTab";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchSettings } from "@/lib/api";
import XiaomiRouter from "@/components/XiaomiRouter";
import XiaomiMeshTopology from "@/components/XiaomiMeshTopology";
import XiaomiRouterDesign from "@/components/router/XiaomiRouterDesign";
import { PageTransition } from "@/components/PageTransition";
import {
  RouterWorkspace,
  RouterWorkspaceLoading,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

const XIAOMI_TAB_IDS = [
  "system",
  "mesh",
  "wifi",
  "wan",
  "lan",
  "devices",
] as const;
type XiaomiTab = (typeof XIAOMI_TAB_IDS)[number];

export default function XiaomiRouterPage() {
  return (
    <Suspense
      fallback={
        <PageTransition>
          <RouterWorkspace active="xiaomi">
            <RouterWorkspaceLoading />
          </RouterWorkspace>
        </PageTransition>
      }
    >
      <XiaomiRouterPageInner />
    </Suspense>
  );
}

function XiaomiRouterPageInner() {
  const [tab, setTab] = useHashTab<XiaomiTab>("system", [...XIAOMI_TAB_IDS]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [xiaomiEnabled, setXiaomiEnabled] = useState(false);
  const search = useSearchParams();
  const legacy = search?.get("legacy") === "1";

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchSettings();
        setXiaomiEnabled(settings.xiaomi_mesh_enabled);
      } catch {
        // ignore
      }
      setSettingsLoaded(true);
    };
    loadSettings();
  }, []);

  return (
    <PageTransition>
      <RouterWorkspace active="xiaomi">
        {!settingsLoaded ? (
          <div className="space-y-8">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : xiaomiEnabled ? (
          legacy ? (
            <Tabs
              value={tab}
              onValueChange={(v) =>
                setTab(
                  (XIAOMI_TAB_IDS as readonly string[]).includes(v)
                    ? (v as XiaomiTab)
                    : "system",
                )
              }
              className="space-y-4"
            >
              <TabsList className="mesh-card" data-testid="router-tabs">
                <TabsTrigger value="system" data-testid="router-tab-system">
                  System
                </TabsTrigger>
                <TabsTrigger value="mesh" data-testid="router-tab-mesh">
                  Mesh Topology
                </TabsTrigger>
              </TabsList>
              <TabsContent value="system">
                <XiaomiRouter />
              </TabsContent>
              <TabsContent value="mesh">
                <XiaomiMeshTopology />
              </TabsContent>
            </Tabs>
          ) : (
            <XiaomiRouterDesign
              activeTab={tab}
              onTabChange={(v) =>
                setTab(
                  (XIAOMI_TAB_IDS as readonly string[]).includes(v)
                    ? (v as XiaomiTab)
                    : "system",
                )
              }
            />
          )
        ) : (
          <RouterWorkspaceState
            title="Xiaomi Mesh Not Configured"
            description="Enable Xiaomi mesh integration in Settings → Integrations → Xiaomi Mesh before viewing system stats and mesh topology."
            settingsHref="/settings/xiaomi-mesh"
            settingsLabel="Configure Xiaomi Mesh"
          />
        )}
      </RouterWorkspace>
    </PageTransition>
  );
}
