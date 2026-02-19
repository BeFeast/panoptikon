"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  MonitorSmartphone,
  Shield,
  Wifi,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAlerts, markAlertRead } from "@/lib/api";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";

function alertIcon(type: Alert["type"]) {
  switch (type) {
    case "new_device":
      return <MonitorSmartphone className="h-5 w-5 text-blue-400" />;
    case "device_offline":
      return <Wifi className="h-5 w-5 text-red-400" />;
    case "device_online":
      return <Wifi className="h-5 w-5 text-green-400" />;
    case "agent_offline":
      return <Activity className="h-5 w-5 text-red-400" />;
    case "high_bandwidth":
      return <AlertTriangle className="h-5 w-5 text-amber-400" />;
    default:
      return <Shield className="h-5 w-5 text-gray-400" />;
  }
}

function alertTypeLabel(type: Alert["type"]): string {
  switch (type) {
    case "new_device":
      return "New Device";
    case "device_offline":
      return "Device Offline";
    case "device_online":
      return "Device Online";
    case "agent_offline":
      return "Agent Offline";
    case "high_bandwidth":
      return "High Bandwidth";
    default:
      return "Alert";
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAlerts(100);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleMarkRead(id: string) {
    try {
      await markAlertRead(id);
      setAlerts((prev) =>
        (prev ?? []).map((a) => (a.id === id ? { ...a, is_read: true } : a))
      );
    } catch {
      // silently ignore — next refresh will sync
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const unreadCount = (alerts ?? []).filter((a) => !a.is_read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Alerts</h1>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Bell className="h-3 w-3" />
              {unreadCount} unread
            </Badge>
          )}
        </div>
      </div>

      {/* Alert list */}
      {alerts === null ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-[#2a2a3a] bg-[#16161f]">
              <CardContent className="flex items-center gap-4 py-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <Card className="border-[#2a2a3a] bg-[#16161f]">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <BellOff className="h-10 w-10 text-gray-600" />
            <p className="text-sm text-gray-500">No alerts yet — all quiet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`cursor-pointer border-[#2a2a3a] transition-colors hover:border-blue-500/30 ${
                !alert.is_read ? "border-l-2 border-l-blue-500 bg-[#16161f]" : "bg-[#12121a]"
              }`}
              onClick={() => {
                if (!alert.is_read) handleMarkRead(alert.id);
              }}
            >
              <CardContent className="flex items-center gap-4 py-4">
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    !alert.is_read ? "bg-blue-500/10" : "bg-gray-800"
                  }`}
                >
                  {alertIcon(alert.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      {alertTypeLabel(alert.type)}
                    </span>
                    {!alert.is_read && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p
                    className={`mt-0.5 text-sm ${
                      !alert.is_read ? "text-gray-200" : "text-gray-400"
                    }`}
                  >
                    {alert.message}
                  </p>
                </div>

                {/* Time */}
                <span className="shrink-0 text-xs text-gray-600">
                  {timeAgo(alert.created_at)}
                </span>

                {/* Read indicator */}
                {alert.is_read && (
                  <CheckCheck className="h-4 w-4 shrink-0 text-gray-700" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
