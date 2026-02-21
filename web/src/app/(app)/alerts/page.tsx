"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock,
  MonitorSmartphone,
  Shield,
  VolumeX,
  Wifi,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAlerts,
  markAlertRead,
  acknowledgeAlert,
  muteDevice,
} from "@/lib/api";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { PageTransition } from "@/components/PageTransition";

function alertIcon(type: Alert["type"]) {
  switch (type) {
    case "new_device":
      return <MonitorSmartphone className="h-5 w-5 text-blue-400" />;
    case "device_offline":
      return <Wifi className="h-5 w-5 text-rose-400" />;
    case "device_online":
      return <Wifi className="h-5 w-5 text-emerald-400" />;
    case "agent_offline":
      return <Activity className="h-5 w-5 text-rose-400" />;
    case "high_bandwidth":
      return <AlertTriangle className="h-5 w-5 text-amber-400" />;
    default:
      return <Shield className="h-5 w-5 text-slate-400" />;
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

function severityBadge(severity: Alert["severity"]) {
  switch (severity) {
    case "CRITICAL":
      return (
        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px] px-1.5 py-0">
          CRITICAL
        </Badge>
      );
    case "WARNING":
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
          WARNING
        </Badge>
      );
    case "INFO":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
          INFO
        </Badge>
      );
    default:
      return null;
  }
}

type StatusFilter = "all" | "active" | "acknowledged";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackAlertId, setAckAlertId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [muteDropdownId, setMuteDropdownId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = statusFilter === "all" ? undefined : statusFilter;
      const data = await fetchAlerts(100, status);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    }
  }, [statusFilter]);

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
      // silently ignore
    }
  }

  function openAckDialog(alertId: string) {
    setAckAlertId(alertId);
    setAckNote("");
    setAckDialogOpen(true);
  }

  async function handleAcknowledge() {
    if (!ackAlertId) return;
    try {
      await acknowledgeAlert(ackAlertId, ackNote || undefined);
      setAlerts((prev) =>
        (prev ?? []).map((a) =>
          a.id === ackAlertId
            ? {
                ...a,
                acknowledged_at: new Date().toISOString(),
                acknowledged_by: ackNote || null,
                is_read: true,
              }
            : a
        )
      );
      setAckDialogOpen(false);
    } catch {
      // silently ignore
    }
  }

  async function handleMute(deviceId: string, hours: number) {
    try {
      await muteDevice(deviceId, hours);
      setMuteDropdownId(null);
    } catch {
      // silently ignore
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  const activeCount = (alerts ?? []).filter((a) => !a.acknowledged_at).length;
  const acknowledgedCount = (alerts ?? []).filter((a) => !!a.acknowledged_at).length;

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Alerts</h1>
          {activeCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Bell className="h-3 w-3" />
              {activeCount} active
            </Badge>
          )}
          {acknowledgedCount > 0 && (
            <Badge variant="outline" className="gap-1 text-slate-400 border-gray-700">
              <Check className="h-3 w-3" />
              {acknowledgedCount} acknowledged
            </Badge>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "active", "acknowledged"] as StatusFilter[]).map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f)}
            className={
              statusFilter === f
                ? ""
                : "border-gray-700 text-slate-400 hover:text-gray-200"
            }
          >
            {f === "all" ? "All" : f === "active" ? "Active" : "Acknowledged"}
          </Button>
        ))}
      </div>

      {/* Alert list */}
      {alerts === null ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-800 bg-slate-900">
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
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <BellOff className="h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-500">No alerts yet — all quiet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`border-slate-800 transition-colors hover:bg-slate-800/60 hover:border-blue-500/30 ${
                alert.acknowledged_at
                  ? "bg-[#12121a] opacity-70"
                  : !alert.is_read
                    ? "border-l-2 border-l-blue-500 bg-slate-900"
                    : "bg-slate-900"
              }`}
            >
              <CardContent className="flex items-center gap-4 py-4">
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    alert.acknowledged_at
                      ? "bg-gray-800/50"
                      : !alert.is_read
                        ? "bg-blue-500/10"
                        : "bg-gray-800"
                  }`}
                >
                  {alertIcon(alert.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                      {alertTypeLabel(alert.type)}
                    </span>
                    {severityBadge(alert.severity)}
                    {!alert.is_read && !alert.acknowledged_at && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                    {alert.acknowledged_at && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-700 text-emerald-500">
                        <CheckCheck className="mr-0.5 h-3 w-3" />
                        ACK
                      </Badge>
                    )}
                  </div>
                  <p
                    className={`mt-0.5 text-sm ${
                      alert.acknowledged_at
                        ? "text-slate-500"
                        : !alert.is_read
                          ? "text-gray-200"
                          : "text-slate-400"
                    }`}
                  >
                    {alert.message}
                  </p>
                  {alert.acknowledged_by && (
                    <p className="mt-0.5 text-xs text-slate-600 italic">
                      Note: {alert.acknowledged_by}
                    </p>
                  )}
                </div>

                {/* Time */}
                <span className="shrink-0 text-xs text-slate-600">
                  {timeAgo(alert.created_at)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Mark read */}
                  {!alert.is_read && !alert.acknowledged_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-slate-500 hover:text-gray-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(alert.id);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Acknowledge */}
                  {!alert.acknowledged_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-slate-500 hover:text-emerald-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAckDialog(alert.id);
                      }}
                      title="Acknowledge"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Mute device */}
                  {alert.device_id && (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-slate-500 hover:text-amber-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMuteDropdownId(
                            muteDropdownId === alert.id ? null : alert.id
                          );
                        }}
                        title="Mute device"
                      >
                        <VolumeX className="h-3.5 w-3.5" />
                      </Button>
                      {muteDropdownId === alert.id && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-slate-800 bg-slate-800/50 py-1 shadow-lg">
                          {[
                            { label: "Mute 1h", hours: 1 },
                            { label: "Mute 8h", hours: 8 },
                            { label: "Mute 24h", hours: 24 },
                            { label: "Unmute", hours: 0 },
                          ].map((opt) => (
                            <button
                              key={opt.hours}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (alert.device_id) {
                                  handleMute(alert.device_id, opt.hours);
                                }
                              }}
                            >
                              <Clock className="h-3 w-3" />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Acknowledge Dialog */}
      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
            <DialogDescription>
              Optionally add a note about why this alert is being acknowledged.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Add a note (optional)..."
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            className="bg-[#12121a] border-slate-800"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAcknowledge();
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAckDialogOpen(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button onClick={handleAcknowledge}>Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
