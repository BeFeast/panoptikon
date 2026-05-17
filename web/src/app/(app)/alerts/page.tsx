"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
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
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

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
  const selectedAlert = useMemo(() => {
    if (!alerts?.length) return null;
    return alerts.find((a) => a.id === selectedAlertId) ?? alerts[0];
  }, [alerts, selectedAlertId]);

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

      {/* Alert triage */}
      {alerts === null ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-2">
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
          <Card className="hidden border-slate-800 bg-slate-900 lg:block">
            <CardContent className="space-y-3 py-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/40">
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_6rem_7.25rem] gap-3 border-b border-slate-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 max-md:hidden">
              <span>Type</span>
              <span>Message</span>
              <span>Age</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-800">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedAlertId(alert.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedAlertId(alert.id);
                    }
                  }}
                  className={`grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-l-none border-slate-800 px-3 py-3 text-left transition-colors hover:bg-slate-900/75 lg:grid-cols-[2.25rem_minmax(0,1fr)_6rem_7.25rem] ${
                    acknowledgingIds.has(alert.id)
                      ? "animate-ack-strike opacity-0"
                      : selectedAlert?.id === alert.id
                        ? "bg-slate-900/90 shadow-[inset_2px_0_0_rgba(34,211,238,0.75)]"
                        : !alert.is_read && !alert.acknowledged_at
                          ? "bg-slate-900/55 shadow-[inset_2px_0_0_rgba(59,130,246,0.7)]"
                          : ""
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                    alert.acknowledged_at
                      ? "border-slate-800 bg-slate-900 text-slate-500"
                      : "border-slate-700 bg-slate-900"
                  }`}>
                    {alertIcon(alert.type)}
                  </span>

                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {alertTypeLabel(alert.type)}
                      </span>
                      {severityBadge(alert.severity)}
                      {!alert.is_read && !alert.acknowledged_at && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      )}
                      {alert.acknowledged_at && (
                        <Badge variant="outline" className="border-emerald-700 px-1.5 py-0 text-[10px] text-emerald-500">
                          ACK
                        </Badge>
                      )}
                    </span>
                    <span className={`mt-0.5 block truncate text-sm ${
                      alert.acknowledged_at
                        ? "text-slate-500"
                        : !alert.is_read
                          ? "text-slate-200"
                          : "text-slate-400"
                    }`}>
                      {alert.message}
                    </span>
                  </span>

                  <span className="shrink-0 font-mono text-[11px] text-slate-600 max-lg:hidden">
                    {timeAgo(alert.created_at)}
                  </span>

                  <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {!alert.acknowledged_at && (
                      alert.is_read ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-blue-400" onClick={() => handleMarkUnread(alert.id)} title="Mark unread">
                          <Bell className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-gray-200" onClick={() => handleMarkRead(alert.id)} title="Mark read">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                    {!alert.acknowledged_at && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-emerald-400" onClick={() => openAckDialog(alert.id)} title="Acknowledge">
                        <CheckCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-500 hover:text-rose-400" onClick={() => handleDeleteOne(alert.id)} title="Delete alert">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {selectedAlert && (
            <aside className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/60 p-4 lg:sticky lg:top-4 lg:self-start">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {alertTypeLabel(selectedAlert.type)}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-100">
                    Alert detail
                  </h2>
                </div>
                {severityBadge(selectedAlert.severity)}
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                {selectedAlert.message}
              </p>
              {selectedAlert.details && (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900/70 p-3 text-xs leading-5 text-slate-400">
                  {selectedAlert.details}
                </pre>
              )}

              <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs">
                <TriageRow label="Created" value={new Date(selectedAlert.created_at).toLocaleString()} />
                <TriageRow label="Status" value={selectedAlert.acknowledged_at ? "Acknowledged" : selectedAlert.is_read ? "Read" : "Unread"} />
                {selectedAlert.device_id && <TriageRow label="Device" value={selectedAlert.device_id} mono />}
                {selectedAlert.agent_id && <TriageRow label="Agent" value={selectedAlert.agent_id} mono />}
                {selectedAlert.acknowledged_by && <TriageRow label="Note" value={selectedAlert.acknowledged_by} />}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {!selectedAlert.acknowledged_at && (
                  <Button size="sm" className="gap-1.5" onClick={() => openAckDialog(selectedAlert.id)}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    Acknowledge
                  </Button>
                )}
                {selectedAlert.is_read ? (
                  <Button variant="outline" size="sm" className="gap-1.5 border-slate-700 text-slate-300 hover:text-white" onClick={() => handleMarkUnread(selectedAlert.id)}>
                    <Bell className="h-3.5 w-3.5" />
                    Mark unread
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5 border-slate-700 text-slate-300 hover:text-white" onClick={() => handleMarkRead(selectedAlert.id)}>
                    <Check className="h-3.5 w-3.5" />
                    Mark read
                  </Button>
                )}
                {selectedAlert.device_id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 border-slate-700 text-slate-300 hover:text-white">
                        <VolumeX className="h-3.5 w-3.5" />
                        Mute
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {[1, 8, 24].map((hours) => (
                        <DropdownMenuItem key={hours} onClick={() => selectedAlert.device_id && handleMute(selectedAlert.device_id, hours)}>
                          Mute {hours}h
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => selectedAlert.device_id && handleMute(selectedAlert.device_id, 0)}>
                        Unmute
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 border-slate-700 text-slate-300 hover:text-rose-400" onClick={() => handleDeleteOne(selectedAlert.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </aside>
          )}
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

function TriageRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      <span className={`min-w-0 truncate text-right text-slate-400 ${mono ? "font-mono tabular-nums" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}
