"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Download,
  Filter as FilterIcon,
  MonitorSmartphone,
  Shield,
  Trash2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

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
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { downloadExport } from "@/lib/export";
import { useApiFetch } from "@/hooks/useApiFetch";
import { useWsEvent } from "@/lib/ws";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";

import { LoadingState } from "@/components/mesh/state/LoadingState";
import { EmptyState } from "@/components/mesh/state/EmptyState";
import { ErrorState } from "@/components/mesh/state/ErrorState";
import {
  DetailsDrawer,
  DetailsHeader,
  DetailsTabs,
  DetailsSection,
  DetailsField,
  DetailsFooter,
} from "@/components/mesh/details";

// Severity helpers
type SevKey = "critical" | "warning" | "info" | "resolved";

function sevFromAlert(alert: Alert): SevKey {
  if (alert.acknowledged_at) return "resolved";
  switch (alert.severity) {
    case "CRITICAL":
      return "critical";
    case "WARNING":
      return "warning";
    default:
      return "info";
  }
}

const SEV_COLOR: Record<SevKey, string> = {
  critical: "#fb7185",
  warning: "#fbbf24",
  info: "#38bdf8",
  resolved: "#4ade80",
};

const SEV_LABEL: Record<SevKey, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
  resolved: "RESOLVED",
};

function SevPill({ sev }: { sev: SevKey }) {
  const color = SEV_COLOR[sev];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]"
      style={{
        background: `${color}1a`,
        color,
        borderColor: `${color}4d`,
      }}
    >
      {SEV_LABEL[sev]}
    </span>
  );
}

function SevRail({ sev }: { sev: SevKey }) {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-0 bottom-0 w-[2px] rounded-r"
      style={{ background: SEV_COLOR[sev] }}
    />
  );
}

function alertIcon(type: Alert["type"], sev: SevKey) {
  const color = SEV_COLOR[sev];
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "new_device":
      return <MonitorSmartphone className={cls} style={{ color }} />;
    case "device_offline":
      return <Wifi className={cls} style={{ color }} />;
    case "device_online":
      return <Wifi className={cls} style={{ color }} />;
    case "agent_offline":
      return <Activity className={cls} style={{ color }} />;
    case "high_bandwidth":
      return <AlertTriangle className={cls} style={{ color }} />;
    default:
      return <Shield className={cls} style={{ color }} />;
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

// Filter chips
type ChipKey = "all" | "critical" | "warning" | "info" | "ack";

const CHIPS: { key: ChipKey; label: string; testid: string }[] = [
  { key: "all", label: "All", testid: "filter-chip-all" },
  { key: "critical", label: "Critical", testid: "filter-chip-critical" },
  { key: "warning", label: "Warning", testid: "filter-chip-warning" },
  { key: "info", label: "Info", testid: "filter-chip-info" },
  { key: "ack", label: "Acknowledged", testid: "filter-chip-ack" },
];

function filterAlerts(alerts: Alert[], chip: ChipKey): Alert[] {
  switch (chip) {
    case "critical":
      return alerts.filter((a) => !a.acknowledged_at && a.severity === "CRITICAL");
    case "warning":
      return alerts.filter((a) => !a.acknowledged_at && a.severity === "WARNING");
    case "info":
      return alerts.filter((a) => !a.acknowledged_at && a.severity === "INFO");
    case "ack":
      return alerts.filter((a) => !!a.acknowledged_at);
    default:
      return alerts;
  }
}

export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5" data-testid="alerts-root">
          <LoadingState title="Loading alerts" message="Pulling open alerts…" tiles={0} rows={6} />
        </div>
      }
    >
      <AlertsPageInner />
    </Suspense>
  );
}

function AlertsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialChip = (searchParams.get("filter") as ChipKey) ?? "all";
  const [chip, setChip] = useState<ChipKey>(
    CHIPS.some((c) => c.key === initialChip) ? initialChip : "all",
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");

  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackAlertId, setAckAlertId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

  const { data: alerts, error, mutate, isLoading } = useApiFetch<Alert[]>(
    `/api/v1/alerts?all`,
    async () => {
      const data = await fetchAlerts(200);
      return Array.isArray(data) ? data : [];
    },
    { refreshInterval: 30_000 },
  );

  // WS refresh on alert-related events
  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_offline", "agent_online"],
    () => {
      mutate();
    },
  );

  // Sync chip -> URL
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (chip === "all") {
      sp.delete("filter");
    } else {
      sp.set("filter", chip);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip]);

  const counts = useMemo(() => {
    const list = alerts ?? [];
    const active = list.filter((a) => !a.acknowledged_at);
    return {
      all: list.length,
      critical: active.filter((a) => a.severity === "CRITICAL").length,
      warning: active.filter((a) => a.severity === "WARNING").length,
      info: active.filter((a) => a.severity === "INFO").length,
      ack: list.filter((a) => !!a.acknowledged_at).length,
      unread: list.filter((a) => !a.is_read).length,
      active: active.length,
    };
  }, [alerts]);

  const filtered = useMemo(
    () => filterAlerts(alerts ?? [], chip),
    [alerts, chip],
  );

  const selectedAlert = useMemo(() => {
    if (!alerts || !selectedAlertId) return null;
    return alerts.find((a) => a.id === selectedAlertId) ?? null;
  }, [alerts, selectedAlertId]);

  const openDrawer = useCallback((alertId: string) => {
    setSelectedAlertId(alertId);
    setActiveTab("overview");
    setDrawerOpen(true);
  }, []);

  async function handleMarkRead(id: string) {
    try {
      await markAlertRead(id);
      mutate(
        (prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, is_read: true } : a)),
        { revalidate: false },
      );
    } catch {
      /* noop */
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
      /* noop */
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
      setAcknowledgingIds((prev) => new Set(prev).add(id));
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
                : a,
            ),
          { revalidate: false },
        );
      }, 400);
      toast.success("Alert acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    }
  }

  async function handleDeleteOne(id: string) {
    try {
      await deleteAlert(id);
      mutate((prev) => (prev ?? []).filter((a) => a.id !== id), { revalidate: false });
      if (selectedAlertId === id) {
        setDrawerOpen(false);
        setSelectedAlertId(null);
      }
    } catch {
      /* noop */
    }
  }

  async function handleDeleteAll() {
    try {
      await deleteAllAlerts();
      mutate([], { revalidate: false });
      setClearAllDialogOpen(false);
      setDrawerOpen(false);
      setSelectedAlertId(null);
      toast.success("All alerts cleared");
    } catch {
      toast.error("Failed to clear alerts");
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllAlertsRead();
      mutate((prev) => (prev ?? []).map((a) => ({ ...a, is_read: true })), {
        revalidate: false,
      });
      toast.success("All alerts marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  }

  async function handleSnooze(alertId: string, hours: number) {
    // Snooze maps onto mute when alert has device_id; otherwise just acknowledge.
    const alert = (alerts ?? []).find((a) => a.id === alertId);
    if (alert?.device_id) {
      try {
        await muteDevice(alert.device_id, hours);
        toast.success(`Snoozed ${hours}h`);
      } catch {
        toast.error("Failed to snooze");
      }
    } else {
      toast.message("Snooze unavailable", {
        description: "No device target — acknowledge instead.",
      });
    }
  }

  if (error) {
    return (
      <PageTransition>
        <div className="space-y-6" data-testid="alerts-root">
          <PageHeader counts={counts} disabled />
          <ErrorState
            title="Couldn't reach the alerts service"
            message={String(error)}
            onRetry={() => mutate()}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-5" data-testid="alerts-root">
        <PageHeader
          counts={counts}
          onMarkAllRead={counts.unread > 0 ? handleMarkAllRead : undefined}
          onClearAll={counts.all > 0 ? () => setClearAllDialogOpen(true) : undefined}
        />

        {/* Filter chip strip */}
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => {
            const count = counts[c.key];
            const active = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                data-testid={c.testid}
                aria-pressed={active}
                onClick={() => setChip(c.key)}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                  (active
                    ? "border-mesh-accent bg-mesh-primary-soft text-mesh-text"
                    : "border-mesh-border bg-mesh-surface-1 text-mesh-text-mute hover:bg-mesh-surface-2 hover:text-mesh-text")
                }
              >
                <span>{c.label}</span>
                <span
                  className="rounded font-mono text-[10.5px]"
                  style={{ color: active ? undefined : "var(--mesh-text-mute)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <div className="ms-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text-dim hover:text-mesh-text gap-1.5"
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
                      await downloadExport(
                        "/api/v1/alerts/export?format=csv",
                        "panoptikon-alerts.csv",
                      );
                      toast.success("Alerts exported as CSV");
                    } catch {
                      toast.error("Export failed");
                    }
                  }}
                >
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await downloadExport(
                        "/api/v1/alerts/export?format=json",
                        "panoptikon-alerts.json",
                      );
                      toast.success("Alerts exported as JSON");
                    } catch {
                      toast.error("Export failed");
                    }
                  }}
                >
                  Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Alert list / states */}
        {isLoading && !alerts ? (
          <LoadingState
            title="Loading alerts"
            message="Pulling open alerts and their history…"
            tiles={0}
            rows={6}
          />
        ) : filtered.length === 0 ? (
          chip === "all" && counts.all === 0 ? (
            <EmptyState
              title="All clear"
              message="No active alerts. New events from devices, agents, or rules will show up here."
              action={
                <Button asChild variant="outline" size="sm">
                  <a href="/settings/alert-rules">
                    <FilterIcon className="h-3.5 w-3.5" />
                    <span>Configure rules</span>
                  </a>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No alerts in this filter"
              message={`Nothing matches "${CHIPS.find((c) => c.key === chip)?.label ?? chip}" right now. Try a different filter or clear it.`}
              action={
                <Button variant="outline" size="sm" onClick={() => setChip("all")}>
                  Show all
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-hidden mesh-card shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="grid grid-cols-[32px_72px_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-mesh-border bg-mesh-surface-1/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-mesh-text-mute max-md:hidden">
              <span />
              <span>Severity</span>
              <span>Event</span>
              <span>Age</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-mesh-border">
              {filtered.map((alert) => {
                const sev = sevFromAlert(alert);
                const animating = acknowledgingIds.has(alert.id);
                const isSelected = selectedAlertId === alert.id && drawerOpen;
                return (
                  <li
                    key={alert.id}
                    data-testid="alert-row"
                    data-severity={sev}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDrawer(alert.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDrawer(alert.id);
                      }
                    }}
                    className={
                      "relative grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors md:grid-cols-[32px_72px_minmax(0,1fr)_120px_120px] " +
                      (animating
                        ? "opacity-30"
                        : isSelected
                          ? "bg-mesh-surface-2"
                          : "hover:bg-mesh-surface-2/60")
                    }
                  >
                    <SevRail sev={sev} />
                    <span className="flex items-center justify-center">
                      {alertIcon(alert.type, sev)}
                    </span>
                    <span className="max-md:hidden">
                      <SevPill sev={sev} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-mesh-text-mute">
                          {alertTypeLabel(alert.type)}
                        </span>
                        {!alert.is_read && !alert.acknowledged_at && (
                          <span
                            aria-label="unread"
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: SEV_COLOR.info }}
                          />
                        )}
                        <span className="md:hidden">
                          <SevPill sev={sev} />
                        </span>
                      </span>
                      <span
                        className={
                          "mt-0.5 block truncate text-[13px] " +
                          (alert.acknowledged_at
                            ? "text-mesh-text-mute"
                            : !alert.is_read
                              ? "font-medium text-mesh-text"
                              : "text-mesh-text-dim")
                        }
                      >
                        {alert.message}
                      </span>
                      {(alert.device_id || alert.agent_id) && (
                        <span className="mt-1 block truncate font-mono text-[11px] text-mesh-text-mute">
                          {alert.device_id
                            ? `device · ${alert.device_id}`
                            : `agent · ${alert.agent_id}`}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-mesh-text-mute max-md:hidden">
                      <Clock className="me-1 inline h-3 w-3 align-[-2px]" />
                      {timeAgo(alert.created_at)}
                    </span>
                    <span
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!alert.acknowledged_at &&
                        (alert.is_read ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-mesh-text-mute hover:text-mesh-accent"
                            onClick={() => handleMarkUnread(alert.id)}
                            title="Mark unread"
                          >
                            <Bell className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-mesh-text-mute hover:text-mesh-text"
                            onClick={() => handleMarkRead(alert.id)}
                            title="Mark read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        ))}
                      {!alert.acknowledged_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-mesh-text-mute hover:text-[#4ade80]"
                          onClick={() => openAckDialog(alert.id)}
                          title="Acknowledge"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-mesh-text-mute hover:text-[#fb7185]"
                        onClick={() => handleDeleteOne(alert.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Details Drawer */}
        <DetailsDrawer
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) setSelectedAlertId(null);
          }}
          data-testid="alert-drawer"
        >
          {selectedAlert ? (
            <AlertDrawerBody
              alert={selectedAlert}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onAcknowledge={() => openAckDialog(selectedAlert.id)}
              onSnooze={(hours) => handleSnooze(selectedAlert.id, hours)}
              onDelete={() => handleDeleteOne(selectedAlert.id)}
              onMarkRead={() => handleMarkRead(selectedAlert.id)}
              onMarkUnread={() => handleMarkUnread(selectedAlert.id)}
            />
          ) : null}
        </DetailsDrawer>

        {/* Acknowledge Dialog */}
        <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
          <DialogContent className="border-mesh-border bg-mesh-surface-1">
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
              className="border-mesh-border bg-mesh-surface-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAcknowledge();
              }}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAckDialogOpen(false)}
                className="border-mesh-border"
              >
                Cancel
              </Button>
              <Button onClick={handleAcknowledge}>Acknowledge</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clear-all Dialog */}
        <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
          <DialogContent className="border-mesh-border bg-mesh-surface-1">
            <DialogHeader>
              <DialogTitle>Delete All Alerts</DialogTitle>
              <DialogDescription>
                Delete all {counts.all} alerts? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setClearAllDialogOpen(false)}
                className="border-mesh-border"
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteAll}>
                Delete all
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

// Header
function PageHeader({
  counts,
  onMarkAllRead,
  onClearAll,
  disabled,
}: {
  counts: {
    all: number;
    critical: number;
    warning: number;
    info: number;
    ack: number;
    unread: number;
    active: number;
  };
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-mesh-text-mute">
          Operations
        </div>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="m-0 text-[24px] font-semibold tracking-tight text-mesh-text">
            Alerts
          </h1>
          <HelpTooltip text="Network events that need attention — devices joining/leaving, agents going offline, and configured rule violations." />
        </div>
        <div className="mt-1 font-mono text-[12px] text-mesh-text-mute">
          {counts.all} total
          {" · "}
          <span style={{ color: counts.critical > 0 ? SEV_COLOR.critical : undefined }}>
            {counts.critical} critical
          </span>
          {" · "}
          <span style={{ color: counts.warning > 0 ? SEV_COLOR.warning : undefined }}>
            {counts.warning} warning
          </span>
          {" · "}
          {counts.unread} unread
          {" · "}
          {counts.ack} acknowledged
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onMarkAllRead && (
          <Button
            data-testid="alerts-mark-all-read"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onMarkAllRead}
            className="border-mesh-border bg-mesh-surface-1 text-mesh-text-dim hover:text-mesh-text gap-1.5"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
        {onClearAll && (
          <Button
            data-testid="alerts-clear-all"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onClearAll}
            className="border-mesh-border bg-mesh-surface-1 text-mesh-text-dim hover:text-[#fb7185] gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>
    </header>
  );
}

// Drawer body
function AlertDrawerBody({
  alert,
  activeTab,
  onTabChange,
  onAcknowledge,
  onSnooze,
  onDelete,
  onMarkRead,
  onMarkUnread,
}: {
  alert: Alert;
  activeTab: string;
  onTabChange: (id: string) => void;
  onAcknowledge: () => void;
  onSnooze: (hours: number) => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}) {
  const sev = sevFromAlert(alert);
  const iconName =
    alert.type === "agent_offline"
      ? ("agent" as const)
      : alert.type === "high_bandwidth"
        ? ("alert" as const)
        : alert.type === "new_device"
          ? ("device" as const)
          : ("plug" as const);

  return (
    <>
      <DetailsHeader
        icon={iconName}
        iconColor={SEV_COLOR[sev]}
        title={alertTypeLabel(alert.type)}
        pills={<SevPill sev={sev} />}
        meta={
          <span>
            {alert.device_id ? `device · ${alert.device_id}` : null}
            {alert.agent_id ? `agent · ${alert.agent_id}` : null}
            {!alert.device_id && !alert.agent_id ? "system" : null}
            {" · "}
            {timeAgo(alert.created_at)}
          </span>
        }
      />
      <DetailsTabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activity", label: "Activity" },
          { id: "source", label: "Source" },
        ]}
        active={activeTab}
        onChange={onTabChange}
      />
      <div className="flex-1 overflow-auto p-4">
        {activeTab === "overview" && (
          <div className="flex flex-col gap-4">
            <DetailsSection title="Message">
              <p className="text-[13px] leading-6 text-mesh-text">{alert.message}</p>
              {alert.details ? (
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap mesh-card-2 p-3 font-mono text-[11.5px] leading-5 text-mesh-text-dim">
                  {alert.details}
                </pre>
              ) : null}
            </DetailsSection>
            <DetailsSection title="Metadata">
              <DetailsField label="created" value={new Date(alert.created_at).toLocaleString()} />
              <DetailsField
                label="status"
                value={
                  alert.acknowledged_at
                    ? "acknowledged"
                    : alert.is_read
                      ? "read"
                      : "unread"
                }
                valueColor={
                  alert.acknowledged_at
                    ? SEV_COLOR.resolved
                    : alert.is_read
                      ? undefined
                      : SEV_COLOR.info
                }
              />
              <DetailsField label="severity" value={alert.severity} />
              <DetailsField label="type" value={alert.type} />
              {alert.device_id ? (
                <DetailsField label="device" value={alert.device_id} />
              ) : null}
              {alert.agent_id ? (
                <DetailsField label="agent" value={alert.agent_id} />
              ) : null}
              {alert.acknowledged_by ? (
                <DetailsField label="note" value={alert.acknowledged_by} />
              ) : null}
              {alert.acknowledged_at ? (
                <DetailsField
                  label="ack at"
                  value={new Date(alert.acknowledged_at).toLocaleString()}
                />
              ) : null}
            </DetailsSection>
          </div>
        )}
        {activeTab === "activity" && (
          <DetailsSection title="History">
            <ul className="flex flex-col gap-2 font-mono text-[11.5px] text-mesh-text-dim">
              <li>
                <span className="text-mesh-text">{new Date(alert.created_at).toLocaleTimeString()}</span>{" "}
                alert raised
              </li>
              {alert.is_read ? (
                <li>
                  <span className="text-mesh-text">—</span> marked read
                </li>
              ) : null}
              {alert.acknowledged_at ? (
                <li>
                  <span className="text-mesh-text">
                    {new Date(alert.acknowledged_at).toLocaleTimeString()}
                  </span>{" "}
                  acknowledged{alert.acknowledged_by ? ` · ${alert.acknowledged_by}` : ""}
                </li>
              ) : null}
            </ul>
          </DetailsSection>
        )}
        {activeTab === "source" && (
          <DetailsSection title="Source">
            <DetailsField label="origin" value={alert.type} />
            {alert.device_id ? (
              <DetailsField
                label="device"
                value={
                  <a
                    className="text-mesh-accent underline-offset-2 hover:underline"
                    href={`/devices?focus=${alert.device_id}`}
                  >
                    {alert.device_id}
                  </a>
                }
              />
            ) : null}
            {alert.agent_id ? (
              <DetailsField
                label="agent"
                value={
                  <a
                    className="text-mesh-accent underline-offset-2 hover:underline"
                    href={`/agents?focus=${alert.agent_id}`}
                  >
                    {alert.agent_id}
                  </a>
                }
              />
            ) : null}
            <p className="mt-2 text-[11.5px] text-mesh-text-mute">
              Related rules and dependent topology will appear here once the backend exposes a
              dedicated source endpoint (TODO).
            </p>
          </DetailsSection>
        )}
      </div>
      <DetailsFooter
        hint={
          alert.acknowledged_at
            ? `acknowledged ${timeAgo(alert.acknowledged_at)}`
            : alert.is_read
              ? "read · awaiting ack"
              : "unread"
        }
        actions={
          <>
            {!alert.acknowledged_at && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-mesh-border"
                  onClick={() => onSnooze(1)}
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  1h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-mesh-border"
                  onClick={() => onSnooze(4)}
                >
                  4h
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-mesh-border"
                  onClick={() => onSnooze(24)}
                >
                  24h
                </Button>
              </>
            )}
            {alert.acknowledged_at ? null : alert.is_read ? (
              <Button
                variant="outline"
                size="sm"
                className="border-mesh-border"
                onClick={onMarkUnread}
              >
                <Bell className="h-3.5 w-3.5" />
                Mark unread
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-mesh-border"
                onClick={onMarkRead}
              >
                <Check className="h-3.5 w-3.5" />
                Mark read
              </Button>
            )}
            {!alert.acknowledged_at && (
              <Button size="sm" onClick={onAcknowledge} className="gap-1.5">
                <CheckCheck className="h-3.5 w-3.5" />
                Acknowledge
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-mute hover:text-[#fb7185]"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </>
        }
      />
    </>
  );
}
