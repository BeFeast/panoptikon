"use client";

import { useEffect, useState } from "react";
import { fetchSettings } from "@/lib/api";
import PfSenseRouter from "@/components/pfsense/PfSenseRouter";
import { PageTransition } from "@/components/PageTransition";
import {
  RouterWorkspace,
  RouterWorkspaceLoading,
  RouterWorkspaceState,
} from "@/components/router/RouterWorkspace";

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
      <RouterWorkspace active="pfsense">
        {!settingsLoaded ? (
          <RouterWorkspaceLoading />
        ) : pfsenseEnabled ? (
          <PfSenseRouter />
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
