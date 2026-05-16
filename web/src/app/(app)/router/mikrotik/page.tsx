"use client";

import { useEffect, useState } from "react";
import { fetchSettings } from "@/lib/api";
import MikrotikRouter from "@/components/MikrotikRouter";
import { PageTransition } from "@/components/PageTransition";
import {
  RouterWorkspace,
  RouterWorkspaceLoading,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

export default function MikrotikRouterPage() {
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mikrotikEnabled, setMikrotikEnabled] = useState(false);

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
          <MikrotikRouter />
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
