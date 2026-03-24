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

export default function PfSenseRouter() {
  const [tab, setTab] = useHashTab("system", ["system", "interfaces", "firewall", "dhcp", "dns", "services", "routing", "config"]);
  const fetcher = useCallback(() => fetchPfsenseStatus(), []);
  const { data: status, loading } = useData(fetcher);

  if (loading || !status) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PfSenseStatusHeader status={status} />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="border-slate-800 bg-slate-900">
          <TabsTrigger value="system" className="gap-1.5">
            <Monitor className="h-3.5 w-3.5" />
            System
          </TabsTrigger>
          <TabsTrigger value="interfaces" className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Interfaces
          </TabsTrigger>
          <TabsTrigger value="firewall" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Firewall
          </TabsTrigger>
          <TabsTrigger value="dhcp" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />
            DHCP
          </TabsTrigger>
          <TabsTrigger value="dns" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            DNS
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <Cog className="h-3.5 w-3.5" />
            Services
          </TabsTrigger>
          <TabsTrigger value="routing" className="gap-1.5">
            <GitFork className="h-3.5 w-3.5" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
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
