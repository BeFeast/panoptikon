"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Router,
  Network,
  Globe,
  Shield,
  Server,
  Loader2,
  AlertCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  fetchRouterStatus,
  fetchRouterInterfaces,
  fetchRouterRoutes,
  fetchRouterDhcpLeases,
  fetchRouterFirewall,
  fetchRouterConfigInterfaces,
} from "@/lib/api";
import type { RouterStatus } from "@/lib/types";

// ── Not Configured state ────────────────────────────────

function NotConfigured() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-[#2a2a3a] bg-[#16161f]">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Router className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">
            Router Not Configured
          </h1>
          <p className="text-center text-sm text-gray-500">
            Connect to your VyOS router by adding its URL and API key in
            Settings.
          </p>
          <Link href="/settings">
            <Button
              variant="outline"
              className="border-[#2a2a3a] text-gray-300 hover:bg-[#1e1e2e]"
            >
              <Settings className="mr-2 h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Status Header ───────────────────────────────────────

function StatusHeader({ status }: { status: RouterStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Router className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white">Router</h1>
          <p className="text-xs text-gray-500">
            {status.hostname ?? "VyOS"}{" "}
            {status.version && (
              <span className="text-gray-600">· {status.version}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status.reachable ? (
          <Badge
            variant="outline"
            className="border-green-500/30 bg-green-500/10 text-green-400"
          >
            ● Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-red-500/30 bg-red-500/10 text-red-400"
          >
            ● Unreachable
          </Badge>
        )}
        {status.uptime && (
          <Badge
            variant="outline"
            className="border-[#2a2a3a] text-gray-400"
          >
            Uptime: {status.uptime}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Pre-formatted output panel ──────────────────────────

function OutputPanel({
  data,
  loading,
  error,
  emptyMsg,
}: {
  data: string | null;
  loading: boolean;
  error: string | null;
  emptyMsg?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }
  if (!data || data.trim().length === 0) {
    return (
      <p className="py-4 text-sm text-gray-500">
        {emptyMsg ?? "No data available."}
      </p>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-[#0e0e16] p-4 text-xs leading-relaxed text-gray-300">
      {data}
    </pre>
  );
}

// ── JSON tree panel ─────────────────────────────────────

function JsonPanel({
  data,
  loading,
  error,
  emptyMsg,
}: {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  emptyMsg?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }
  if (!data || Object.keys(data).length === 0) {
    return (
      <p className="py-4 text-sm text-gray-500">
        {emptyMsg ?? "No data available."}
      </p>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-[#0e0e16] p-4 text-xs leading-relaxed text-gray-300">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ── Hook: fetch with loading/error ──────────────────────

function useAsyncData<T>(
  fetcher: () => Promise<T>,
  enabled: boolean
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      if (e instanceof Error && e.message.includes("503")) {
        setError("Router not configured");
      } else {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, [fetcher, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

// ── Main Page ───────────────────────────────────────────

export default function RouterPage() {
  const [status, setStatus] = useState<RouterStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    fetchRouterStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          configured: false,
          reachable: false,
          version: null,
          uptime: null,
          hostname: null,
        })
      )
      .finally(() => setStatusLoading(false));
  }, []);

  if (statusLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status?.configured) {
    return <NotConfigured />;
  }

  return <RouterTabs status={status} />;
}

// ── Tabs component (only rendered when configured) ──────

function RouterTabs({ status }: { status: RouterStatus }) {
  const [tab, setTab] = useState("interfaces");

  const interfaces = useAsyncData(
    useCallback(() => fetchRouterInterfaces(), []),
    tab === "interfaces"
  );

  const configIfaces = useAsyncData(
    useCallback(() => fetchRouterConfigInterfaces(), []),
    tab === "interfaces"
  );

  const routes = useAsyncData(
    useCallback(() => fetchRouterRoutes(), []),
    tab === "routes"
  );

  const dhcp = useAsyncData(
    useCallback(() => fetchRouterDhcpLeases(), []),
    tab === "dhcp"
  );

  const firewall = useAsyncData(
    useCallback(() => fetchRouterFirewall(), []),
    tab === "firewall"
  );

  return (
    <div className="space-y-6">
      <StatusHeader status={status} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="border-[#2a2a3a] bg-[#0e0e16]">
          <TabsTrigger
            value="interfaces"
            className="data-[state=active]:bg-[#1e1e2e] data-[state=active]:text-white"
          >
            <Network className="mr-1.5 h-3.5 w-3.5" />
            Interfaces
          </TabsTrigger>
          <TabsTrigger
            value="routes"
            className="data-[state=active]:bg-[#1e1e2e] data-[state=active]:text-white"
          >
            <Globe className="mr-1.5 h-3.5 w-3.5" />
            Routes
          </TabsTrigger>
          <TabsTrigger
            value="dhcp"
            className="data-[state=active]:bg-[#1e1e2e] data-[state=active]:text-white"
          >
            <Server className="mr-1.5 h-3.5 w-3.5" />
            DHCP Leases
          </TabsTrigger>
          <TabsTrigger
            value="firewall"
            className="data-[state=active]:bg-[#1e1e2e] data-[state=active]:text-white"
          >
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Firewall
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interfaces" className="space-y-4">
          <Card className="border-[#2a2a3a] bg-[#16161f]">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Interface Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OutputPanel
                data={typeof interfaces.data === "string" ? interfaces.data : null}
                loading={interfaces.loading}
                error={interfaces.error}
                emptyMsg="No interfaces found."
              />
            </CardContent>
          </Card>
          <Card className="border-[#2a2a3a] bg-[#16161f]">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Interface Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JsonPanel
                data={
                  configIfaces.data &&
                  typeof configIfaces.data === "object"
                    ? configIfaces.data
                    : null
                }
                loading={configIfaces.loading}
                error={configIfaces.error}
                emptyMsg="No interface configuration found."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes">
          <Card className="border-[#2a2a3a] bg-[#16161f]">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Routing Table
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OutputPanel
                data={typeof routes.data === "string" ? routes.data : null}
                loading={routes.loading}
                error={routes.error}
                emptyMsg="No routes found."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dhcp">
          <Card className="border-[#2a2a3a] bg-[#16161f]">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DHCP Server Leases
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OutputPanel
                data={typeof dhcp.data === "string" ? dhcp.data : null}
                loading={dhcp.loading}
                error={dhcp.error}
                emptyMsg="DHCP server is not configured or has no leases."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall">
          <Card className="border-[#2a2a3a] bg-[#16161f]">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Firewall Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JsonPanel
                data={
                  firewall.data && typeof firewall.data === "object"
                    ? firewall.data
                    : null
                }
                loading={firewall.loading}
                error={firewall.error}
                emptyMsg="No firewall rules configured."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
