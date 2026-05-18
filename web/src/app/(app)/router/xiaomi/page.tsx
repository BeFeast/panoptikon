"use client";

import { useEffect, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchSettings } from "@/lib/api";
import XiaomiRouter from "@/components/XiaomiRouter";
import XiaomiMeshTopology from "@/components/XiaomiMeshTopology";
import { PageTransition } from "@/components/PageTransition";
import {
  RouterWorkspace,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

export default function XiaomiRouterPage() {
  const [tab, setTab] = useHashTab("system", ["system", "mesh"]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [xiaomiEnabled, setXiaomiEnabled] = useState(false);

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
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList
              className="mesh-card"
              data-testid="router-tabs"
            >
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
