"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSettings } from "@/lib/api";
import PfSenseRouter from "@/components/pfsense/PfSenseRouter";
import { PageTransition } from "@/components/PageTransition";
import { RouterSelector } from "@/components/RouterSelector";

export default function PfSenseRouterPage() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pfsenseEnabled, setPfsenseEnabled] = useState(false);

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
      <div className="space-y-6">
        <RouterSelector active="pfsense" />

        {!settingsLoaded ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : pfsenseEnabled ? (
          <PfSenseRouter />
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Card className="w-full max-w-md border-slate-800 bg-slate-900">
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                  <Shield className="h-8 w-8 text-blue-400" />
                </div>
                <h1 className="text-xl font-semibold text-white">
                  pfSense Not Configured
                </h1>
                <p className="text-center text-sm text-slate-500">
                  Enable pfSense integration in Settings to use this page.
                </p>
                <Link href="/settings/pfsense">
                  <Button
                    variant="outline"
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configure pfSense
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
