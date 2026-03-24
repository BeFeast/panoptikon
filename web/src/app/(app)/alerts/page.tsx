"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Download,
  MonitorSmartphone,
  Shield,
  Trash2,
  VolumeX,
  Wifi,
  X,
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
  markAlertUnread,
  acknowledgeAlert,
  muteDevice,
  deleteAlert,
  deleteAllAlerts,
  markAllAlertsRead,
} from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { downloadExport } from "@/lib/export";
import { toast } from "sonner";
import { useApiFetch } from "@/hooks/useApiFetch";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
type TypeFilter = "all" | Alert["type"];

const ALERT_TYPES: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "new_device", label: "New Device" },
  { value: "device_online", label: "Online" },
  { value: "device_offline", label: "Offline" },
  { value: "agent_offline", label: "Agent Offline" },
  { value: "high_bandwidth", label: "High Bandwidth" },
];

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackAlertId, setAckAlertId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [muteDropdownId, setMuteDropdownId] = useState<string | null>(null);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

  const status = statusFilter === "all" ? undefined : statusFilter;
  const alertType = typeFilter === "all" ? undefined : typeFilter;
  const { data: alerts, error, mutate } = useApiFetch<Alert[]>(
    `/api/v1/alerts?status=${statusFilter}&type=${typeFilter}`,
    async () => {
      const data = await fetchAlerts(100, status, undefined, alertType);
      return Array.isArray(data) ? data : [];
    },
    { refreshInterval: 30_000 },
  );

  async function handleMarkRead(id: string) {
    try {
      await markAlertRead(id);
      mutate(
        (prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, is_read: true } : a)),
        { revalidate: false },
      );
    } catch {
      // silently ignore
    }
  }

  async function handleMarkUnread(id: string) {
    try {
      await markAlertUnread(id);
      mutate(
        (prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, is_read: false } : a)),
        { revalidate: false },
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
    const id = ackAlertId;
    try {
      await acknowledgeAlert(id, ackNote || undefined);
      setAckDialogOpen(false);
      // Start strike-through animation
      setAcknowledgingIds((prev) => new Set(prev).add(id));
      // After animation completes, update the alert state
      setTimeout(() => {
        setAcknowledgingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        mutate(
          (prev) =>
            (prev ?? []).map((a) =>
              a.id === id
                ? {
                    ...a,
                    acknowledged_at: new Date().toISOString(),
                    acknowledged_by: ackNote || null,
                    is_read: true,
                  }
                : a
            ),
          { revalidate: false },
        );
      }, 600);
    } catch {
      // silently ignore
    }
  }

  async function handleDeleteOne(id: string) {
    try {
      await deleteAlert(id);
      mutate(
        (prev) => (prev ?? []).filter((a) => a.id !== id),
        { revalidate: false },
      );
    } catch {
      // silently ignore
    }
  }

  async function handleDeleteAll() {
    try {
      await deleteAllAlerts();
      mutate([], { revalidate: false });
      setClearAllDialogOpen(false);
    } catch {
      // silently ignore
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllAlertsRead();
      mutate(
        (prev) => (prev ?? []).map((a) => ({ ...a, is_read: true })),
        { revalidate: false },
      );
      toast.success("All alerts marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  }

  async function handleMute(deviceId: string, hours: number) {
    try {
      await muteDevice(deviceId, hours);
      setMuteDropdownId(null);
      if (hours > 0) {
        toast.success(`Device muted for ${hours}h`);
      } else {
        toast.success("Device unmuted");
      }
    } catch {
      toast.error("Failed to mute device");
    }
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => mutate()} />;
  }

  const activeCount = (alerts ?? []).filter((a) => !a.acknowledged_at).length;
  const acknowledgedCount = (alerts ?? []).filter((a) => !!a.acknowledged_at).length;
  const criticalCount = (alerts ?? []).filter((a) => a.severity === "CRITICAL" && !a.acknowledged_at).length;
  const warningCount = (alerts ?? []).filter((a) => a.severity === "WARNING" && !a.acknowledged_at).length;
  const infoCount = (alerts ?? []).filter((a) => a.severity === "INFO" && !a.acknowledged_at).length;

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Alerts</h1>
          <HelpTooltip text="Notifications about network events — new devices, devices going offline, and security alerts. Configure rules in Settings → Alert Rules." />
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
        {alerts && alerts.length > 0 && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-slate-400 hover:text-gray-200 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await downloadExport("/api/v1/alerts/export?format=csv", "panoptikon-alerts.csv");
                      toast.success("Alerts exported as CSV");
                    } catch { toast.error("Export failed"); }
                  }}
                >
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await downloadExport("/api/v1/alerts/export?format=json", "panoptikon-alerts.json");
                      toast.success("Alerts exported as JSON");
                    } catch { toast.error("Export failed"); }
                  }}
                >
                  Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(alerts ?? []).some((a) => !a.is_read) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-700 text-slate-400 hover:text-gray-200 gap-1.5"
                    onClick={handleMarkAllRead}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                  Mark every unread alert as read
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-slate-400 hover:text-rose-400 gap-1.5"
                  onClick={() => setClearAllDialogOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Permanently delete all alerts
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="static space-y-2">
        <div className="static flex gap-2">
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

        {/* Type filter */}
        <div className="static flex gap-2 flex-wrap">
          {ALERT_TYPES.map((t) => (
            <Button
              key={t.value}
              variant={typeFilter === t.value ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(t.value)}
              className={
                typeFilter === t.value
                  ? ""
                  : "border-gray-700 text-slate-400 hover:text-gray-200"
              }
            >
              {t.value !== "all" && (
                <span className="mr-1.5">{alertIcon(t.value as Alert["type"])}</span>
              )}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Severity Summary Bar */}
      {alerts && alerts.length > 0 && (criticalCount > 0 || warningCount > 0 || infoCount > 0) && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Severity</span>
          <div className="flex items-center gap-3">
            {criticalCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {criticalCount} critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {warningCount} warning
              </Badge>
            )}
            {infoCount > 0 && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {infoCount} info
              </Badge>
            )}
          </div>
        </div>
      )}

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
          <CardContent>
            <EmptyState
              icon={Shield}
              title="All clear!"
              description="No alerts right now. Alerts appear when new devices join, devices go offline, or configured rules are triggered."
              variant="success"
              actionLabel="Configure Alert Rules"
              actionHref="/settings/alert-rules"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`rounded-l-none border-slate-800 transition-all hover:bg-slate-800/60 hover:border-blue-500/30 ${
                acknowledgingIds.has(alert.id)
                  ? "animate-ack-strike opacity-0"
                  : alert.acknowledged_at
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
                    className={`mt-0.5 line-clamp-2 text-sm ${
                      alert.acknowledged_at
                        ? "text-slate-500"
                        : !alert.is_read
                          ? "text-gray-200"
                          : "text-slate-400"
                    }`}
                    title={alert.message}
                  >
                    {alert.message}
                  </p>
                  {alert.acknowledged_by && (
                    <p className="mt-0.5 truncate text-xs italic text-slate-600" title={alert.acknowledged_by}>
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
                  {/* Mark read / unread toggle */}
                  {!alert.acknowledged_at && (
                    alert.is_read ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-slate-500 hover:text-blue-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkUnread(alert.id);
                        }}
                        title="Mark unread"
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-slate-500 hover:text-gray-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(alert.id);
                        }}
                        title="Mark read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )
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

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-slate-500 hover:text-rose-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteOne(alert.id);
                    }}
                    title="Delete alert"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
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

      {/* Clear All Confirmation Dialog */}
      <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle>Delete All Alerts</DialogTitle>
            <DialogDescription>
              Delete all {alerts?.length ?? 0} alerts? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearAllDialogOpen(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
            >
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
