"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Router, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchSettings } from "@/lib/api";
import XiaomiRouter from "@/components/XiaomiRouter";
import XiaomiMeshTopology from "@/components/XiaomiMeshTopology";
import { PageTransition } from "@/components/PageTransition";
import { RouterSelector } from "@/components/RouterSelector";

export default function XiaomiRouterPage() {
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
      <div className="space-y-8">
        <RouterSelector active="xiaomi" />

        {!settingsLoaded ? (
          <div className="space-y-8">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : xiaomiEnabled ? (
          <Tabs defaultValue="system" className="space-y-4">
            <TabsList className="bg-slate-900 border border-slate-800">
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="mesh">Mesh Topology</TabsTrigger>
            </TabsList>
            <TabsContent value="system">
              <XiaomiRouter />
            </TabsContent>
            <TabsContent value="mesh">
              <XiaomiMeshTopology />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Card className="w-full max-w-md border-slate-800 bg-slate-900">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                  <Router className="h-8 w-8 text-amber-400" />
                </div>
                <h1 className="text-xl font-semibold text-white">
                  Xiaomi Mesh Not Configured
                </h1>
                <p className="text-center text-sm text-slate-500">
                  Enable Xiaomi mesh integration in Settings to use this page.
                </p>
                <Link href="/settings/xiaomi-mesh">
                  <Button
                    variant="outline"
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configure Xiaomi Mesh
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
