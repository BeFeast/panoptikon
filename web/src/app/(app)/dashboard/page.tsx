"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  MonitorSmartphone,
  Router,
  Shield,
  Wifi,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchDashboardStats, fetchRecentAlerts, fetchTopDevices } from "@/lib/api";
import type { Alert, DashboardStats, TopDevice } from "@/lib/types";
import { formatBps, timeAgo } from "@/lib/format";

// ─── Alert type → icon mapping ──────────────────────────

function alertIcon(type: Alert["type"]) {
  switch (type) {
    case "new_device":
      return <MonitorSmartphone className="h-4 w-4 text-blue-400" />;
    case "device_offline":
      return <Wifi className="h-4 w-4 text-red-400" />;
    case "device_online":
      return <Wifi className="h-4 w-4 text-green-400" />;
    case "agent_offline":
      return <Activity className="h-4 w-4 text-red-400" />;
    case "high_bandwidth":
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    default:
      return <Shield className="h-4 w-4 text-gray-400" />;
  }
}

// ─── Status dot ─────────────────────────────────────────

function StatusDot({ status }: { status: "online" | "offline" | "warning" }) {
  const colors = {
    online: "bg-green-500",
    offline: "bg-red-500",
    warning: "bg-amber-500",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]} status-pulse`}
    />
  );
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon,
  status,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  status: "online" | "offline" | "warning";
}) {
  return (
    <Card className="border-[#2a2a3a] bg-[#16161f]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-400">
          {title}
        </CardTitle>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-gray-500">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton for stat cards ────────────────────

function StatCardSkeleton() {
  return (
    <Card className="border-[#2a2a3a] bg-[#16161f]">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-32" />
      </CardContent>
    </Card>
  );
}

// ─── Derive display values from flat stats ──────────────

function routerStatusLabel(s: DashboardStats): { label: string; status: "online" | "offline" | "warning" } {
  switch (s.router_status) {
    case "online":
      return { label: "Online", status: "online" };
    case "unconfigured":
      return { label: "Unconfigured", status: "warning" };
    default:
      return { label: "Offline", status: "offline" };
  }
}

// ─── Page ───────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [topDevices, setTopDevices] = useState<TopDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, a, d] = await Promise.all([
          fetchDashboardStats(),
          fetchRecentAlerts(5),
          fetchTopDevices(5),
        ]);
        setStats(s);
        setAlerts(Array.isArray(a) ? a : []);
        setTopDevices(Array.isArray(d) ? d : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    }
    load();

    // Refresh every 30s
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Dashboard</h1>

      {/* ── Stat cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats ? (
          <>
            <StatCard
              title="Router Status"
              value={routerStatusLabel(stats).label}
              subtitle={
                stats.router_status === "online"
                  ? "Connected to router"
                  : stats.router_status === "unconfigured"
                  ? "Router not configured yet"
                  : "Cannot reach router"
              }
              icon={<Router className="h-4 w-4" />}
              status={routerStatusLabel(stats).status}
            />
            <StatCard
              title="Active Devices"
              value={String(stats.devices_online)}
              subtitle={`${stats.devices_total} total known`}
              icon={<MonitorSmartphone className="h-4 w-4" />}
              status="online"
            />
            <StatCard
              title="WAN Bandwidth"
              value={`↓ ${formatBps(stats.wan_rx_bps)}`}
              subtitle={`↑ ${formatBps(stats.wan_tx_bps)}`}
              icon={<Activity className="h-4 w-4" />}
              status="online"
            />
            <StatCard
              title="Unread Alerts"
              value={String(stats.alerts_unread)}
              subtitle={stats.alerts_unread > 0 ? "Needs attention" : "All clear"}
              icon={<AlertTriangle className="h-4 w-4" />}
              status={stats.alerts_unread > 0 ? "warning" : "online"}
            />
          </>
        ) : (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        )}
      </div>

      {/* ── Bottom panels ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Alerts */}
        <Card className="border-[#2a2a3a] bg-[#16161f]">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-white">
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts === null ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-gray-500">No recent alerts — all clear.</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 rounded-md px-2 py-1.5 ${
                      !alert.is_read ? "bg-blue-500/5" : ""
                    }`}
                  >
                    <div className="mt-0.5">{alertIcon(alert.type)}</div>
                    <p className="flex-1 text-sm text-gray-300">{alert.message}</p>
                    <span className="shrink-0 text-xs text-gray-600">
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top devices by bandwidth */}
        <Card className="border-[#2a2a3a] bg-[#16161f]">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-white">
              Top Devices by Bandwidth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDevices === null ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topDevices.length === 0 ? (
              <p className="text-sm text-gray-500">No traffic data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#2a2a3a] hover:bg-transparent">
                    <TableHead className="text-gray-500">Device</TableHead>
                    <TableHead className="text-gray-500">IP</TableHead>
                    <TableHead className="text-right text-gray-500">
                      <ArrowDown className="mr-1 inline h-3 w-3" />
                      RX
                    </TableHead>
                    <TableHead className="text-right text-gray-500">
                      <ArrowUp className="mr-1 inline h-3 w-3" />
                      TX
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDevices.map((d) => (
                    <TableRow key={d.id} className="border-[#2a2a3a]">
                      <TableCell className="font-medium text-white">
                        {d.name ?? d.hostname ?? d.ip}
                      </TableCell>
                      <TableCell className="font-mono text-gray-400">
                        {d.ip}
                      </TableCell>
                      <TableCell className="text-right text-green-400">
                        {formatBps(d.rx_bps)}
                      </TableCell>
                      <TableCell className="text-right text-blue-400">
                        {formatBps(d.tx_bps)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
