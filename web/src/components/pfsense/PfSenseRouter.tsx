"use client";

import { useCallback } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  Monitor,
  Network,
  Shield,
  Server,
  Globe,
  GitFork,
  FileArchive,
  Cog,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPfsenseStatus } from "@/lib/api";
import { useData } from "@/hooks/useData";
import { PfSenseStatusHeader } from "./PfSenseStatusHeader";
import { SystemTab } from "./tabs/SystemTab";
import { InterfacesTab } from "./tabs/InterfacesTab";
import { FirewallTab } from "./tabs/FirewallTab";
import { DhcpTab } from "./tabs/DhcpTab";
import { DnsTab } from "./tabs/DnsTab";
import { RoutingTab } from "./tabs/RoutingTab";
import { ConfigTab } from "./tabs/ConfigTab";
import { ServicesTab } from "./tabs/ServicesTab";
import { RouterWorkspaceState } from "@/components/router/RouterWorkspace";

const tabTriggerClass =
  "gap-1.5 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-white";

export default function PfSenseRouter() {
  const [tab, setTab] = useHashTab("system", ["system", "interfaces", "firewall", "dhcp", "dns", "services", "routing", "config"]);
  const fetcher = useCallback(() => fetchPfsenseStatus(), []);
  const { data: status, loading, error } = useData(fetcher);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status) {
    return (
      <RouterWorkspaceState
        title="pfSense status is unavailable"
        description="The pfSense integration is enabled, but the status API did not return router data."
        detail={error}
        settingsHref="/settings/pfsense"
        settingsLabel="Check Connection"
        tone="rose"
      />
    );
  }

  if (!status.configured || !status.reachable) {
    if (status.configured && !status.reachable) {
      return (
        <div className="space-y-5">
          <PfSenseStatusHeader status={status} />
          <RouterWorkspaceState
            title="pfSense router is unreachable"
            description="The integration is enabled, but the firewall did not respond. Last-known status fields remain visible below when available."
            settingsHref="/settings/pfsense"
            settingsLabel="Check Connection"
            tone="rose"
          />
          <SystemTab status={status} />
        </div>
      );
    }

    return (
      <RouterWorkspaceState
        title="pfSense router is not configured"
        description="Enable the pfSense integration and provide firewall connection settings before managing interfaces, services, DHCP, DNS, firewall, routing, and config backups."
        settingsHref="/settings/pfsense"
        settingsLabel="Configure pfSense"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PfSenseStatusHeader status={status} />

      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList
          className="h-auto w-full justify-start gap-1 border border-mesh-border bg-mesh-surface-1 p-1"
          data-testid="router-tabs"
        >
          <TabsTrigger value="system" data-testid="router-tab-system" className={tabTriggerClass}>
            <Monitor className="h-3.5 w-3.5" />
            System
          </TabsTrigger>
          <TabsTrigger value="interfaces" data-testid="router-tab-interfaces" className={tabTriggerClass}>
            <Network className="h-3.5 w-3.5" />
            Interfaces
          </TabsTrigger>
          <TabsTrigger value="firewall" data-testid="router-tab-firewall" className={tabTriggerClass}>
            <Shield className="h-3.5 w-3.5" />
            Firewall
          </TabsTrigger>
          <TabsTrigger value="dhcp" data-testid="router-tab-dhcp" className={tabTriggerClass}>
            <Server className="h-3.5 w-3.5" />
            DHCP
          </TabsTrigger>
          <TabsTrigger value="dns" data-testid="router-tab-dns" className={tabTriggerClass}>
            <Globe className="h-3.5 w-3.5" />
            DNS
          </TabsTrigger>
          <TabsTrigger value="services" data-testid="router-tab-services" className={tabTriggerClass}>
            <Cog className="h-3.5 w-3.5" />
            Services
          </TabsTrigger>
          <TabsTrigger value="routing" data-testid="router-tab-routing" className={tabTriggerClass}>
            <GitFork className="h-3.5 w-3.5" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="config" data-testid="router-tab-config" className={tabTriggerClass}>
            <FileArchive className="h-3.5 w-3.5" />
            Config & Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <SystemTab status={status} />
        </TabsContent>
        <TabsContent value="interfaces">
          <InterfacesTab />
        </TabsContent>
        <TabsContent value="firewall">
          <FirewallTab />
        </TabsContent>
        <TabsContent value="dhcp">
          <DhcpTab />
        </TabsContent>
        <TabsContent value="dns">
          <DnsTab />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="routing">
          <RoutingTab />
        </TabsContent>
        <TabsContent value="config">
          <ConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
