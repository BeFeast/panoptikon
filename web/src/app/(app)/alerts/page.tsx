"use client";

/**
 * Alerts surface — literal port of the ALERTS section from
 * `/tmp/panopticon-design/panopticon/project/alerts-login.jsx`.
 *
 * Per design-export-to-ux-issues-runbook:
 *  - Inline `style={{ var(--X) }}` from source kept verbatim where possible.
 *  - Mock `ALERTS` array → real `fetchAlerts` from `@/lib/api`.
 *  - `<Icon name="X" />` → `lucide-react` glyphs (closest semantic match).
 *  - Severity badges → literal `style={{ background, color, border }}` per
 *    source `SevBadge`.
 *  - Action buttons → `.btn` / `.btn-primary` / `.btn-sm` recipes (globals.css).
 *  - Tokens: `var(--border)`, `var(--primary)`, `var(--status-*)` → literal
 *    hex per runbook (shadcn HSL aliases clash with mesh literals).
 *
 * Compatibility hooks preserved for existing E2E suites:
 *  - `data-testid="alerts-root"`, `data-testid="alert-row"` (smoke / severity).
 *  - `<h1>Alerts</h1>` (level 1).
 *  - "All clear!" empty-state copy.
 *  - `.mesh-card` recipe present on outer/list/detail panels.
 *  - "N critical · N warning · N info" subtitle counts.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Filter as FilterIcon,
  Plug,
  Plus,
  Trash2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import {
  acknowledgeAlert,
  deleteAlert,
  deleteAllAlerts,
  fetchAlerts,
  markAlertRead,
  markAlertUnread,
  markAllAlertsRead,
  muteDevice,
} from "@/lib/api";
import type { Alert } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useApiFetch } from "@/hooks/useApiFetch";
import { useWsEvent } from "@/lib/ws";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { Spark } from "@/components/mesh";
import { EmptyState } from "@/components/mesh/state/EmptyState";
import { ErrorState } from "@/components/mesh/state/ErrorState";
import { LoadingState } from "@/components/mesh/state/LoadingState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ── Severity model ───────────────────────────────────────────────
// Source `SevBadge` (alerts-login.jsx 24-41) + `SevIcon` 13-23.

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

// Literal-port of `SevBadge` style table (alerts-login.jsx 26-31).
const SEV_BADGE: Record<
  SevKey,
  { bg: string; color: string; border: string; label: string }
> = {
  critical: {
    bg: "rgba(244,63,94,0.10)",
    color: "#fb7185",
    border: "rgba(244,63,94,0.30)",
    label: "CRITICAL",
  },
  warning: {
    bg: "rgba(245,158,11,0.10)",
    color: "#fbbf24",
    border: "rgba(245,158,11,0.30)",
    label: "WARNING",
  },
  info: {
    bg: "rgba(56,189,248,0.10)",
    color: "#38bdf8",
    border: "rgba(56,189,248,0.30)",
    label: "INFO",
  },
  resolved: {
    bg: "var(--surface-2)",
    color: "var(--text-mute)",
    border: "var(--border)",
    label: "RESOLVED",
  },
};

// Literal-port of `SevIcon` color table — for the rail / left-border on rows.
const SEV_COLOR: Record<SevKey, string> = {
  critical: "#fb7185", // var(--status-offline) in source
  warning: "#fbbf24", // var(--status-warning)
  info: "#38bdf8", // var(--status-info)
  resolved: "#4ade80", // var(--status-online)
};

function SevBadge({ sev }: { sev: SevKey }) {
  const cfg = SEV_BADGE[sev];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 7px",
        borderRadius: "var(--radius-pill)",
        background: cfg.bg,
        color: cfg.color,
        border: `var(--hairline) solid ${cfg.border}`,
        font: "600 9.5px var(--font-sans)",
        letterSpacing: "0.08em",
      }}
    >
      {cfg.label}
    </span>
  );
}

// Map alert.type → lucide glyph + colored stroke per severity.
// Source uses `<Icon name="alert|plug|check" />` semantically
// (alerts-login.jsx 14-22). We keep the same 3-way mapping.
function SevIcon({ sev, size = 13 }: { sev: SevKey; size?: number }) {
  const color = SEV_COLOR[sev];
  if (sev === "critical" || sev === "warning") {
    return <AlertTriangle size={size} color={color} strokeWidth={1.8} />;
  }
  if (sev === "info") {
    return <Plug size={size} color={color} strokeWidth={1.8} />;
  }
  return <Check size={size} color={color} strokeWidth={1.8} />;
}

// Map alert.type → label for the row title (replaces source's hand-written title string).
function alertTitle(a: Alert): string {
  switch (a.type) {
    case "agent_offline":
      return "agent · offline";
    case "device_offline":
      return "device · offline";
    case "device_online":
      return "device · online";
    case "new_device":
      return "discovery · new device";
    case "high_bandwidth":
      return "qos · high bandwidth";
    default:
      return "alert";
  }
}

function alertSource(a: Alert): string {
  if (a.agent_id) return "fleet";
  if (a.device_id && a.type === "high_bandwidth") return "qos";
  if (a.device_id && a.type === "new_device") return "scanner";
  if (a.device_id) return "fleet";
  return "system";
}

function alertTarget(a: Alert): string {
  return a.device_id ?? a.agent_id ?? "system";
}

// ── Page ────────────────────────────────────────────────────────

export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5" data-testid="alerts-root">
          <LoadingState
            title="Loading alerts"
            message="Pulling open alerts…"
            tiles={0}
            rows={6}
          />
        </div>
      }
    >
      <AlertsPageInner />
    </Suspense>
  );
}

type ViewFilter = "All" | "Open" | "Ack" | "Resolved";

function AlertsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read initial filter from URL (?filter=open|ack|resolved).
  const initialFilter = ((): ViewFilter => {
    const q = searchParams.get("filter");
    if (q === "open") return "Open";
    if (q === "ack") return "Ack";
    if (q === "resolved") return "Resolved";
    return "All";
  })();
  const [view, setView] = useState<ViewFilter>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackAlertId, setAckAlertId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const { data: alerts, error, mutate, isLoading } = useApiFetch<Alert[]>(
    "/api/v1/alerts?all",
    async () => {
      const data = await fetchAlerts(200);
      return Array.isArray(data) ? data : [];
    },
    { refreshInterval: 30_000 },
  );

  // Refresh on alert-related WS events.
  useWsEvent(
    [
      "device_online",
      "device_offline",
      "new_device",
      "agent_offline",
      "agent_online",
    ],
    () => mutate(),
  );

  // Sync URL with current filter for shareable links.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (view === "All") sp.delete("filter");
    else sp.set("filter", view.toLowerCase());
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Bucket counts — design header: "4 open · 1 acknowledged · 18 resolved · 24h".
  const buckets = useMemo(() => {
    const list = alerts ?? [];
    const open = list.filter((a) => !a.acknowledged_at);
    const ack = list.filter((a) => !!a.acknowledged_at);
    return {
      critical: open.filter((a) => a.severity === "CRITICAL").length,
      warning: open.filter((a) => a.severity === "WARNING").length,
      info: open.filter((a) => a.severity === "INFO").length,
      resolved: ack.length, // backend collapses resolved/ack into acknowledged_at.
      open: open.length,
      all: list.length,
    };
  }, [alerts]);

  // Apply the segmented filter to the list pane.
  const filtered = useMemo(() => {
    const list = alerts ?? [];
    if (view === "Open") return list.filter((a) => !a.acknowledged_at);
    if (view === "Ack" || view === "Resolved")
      return list.filter((a) => !!a.acknowledged_at);
    return list;
  }, [alerts, view]);

  // Pin a default selection — first item once data arrives.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedAlert = useMemo(
    () => filtered.find((a) => a.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  // ── Actions ──
  const openAckDialog = useCallback((id: string) => {
    setAckAlertId(id);
    setAckNote("");
    setAckDialogOpen(true);
  }, []);

  async function handleAcknowledge() {
    if (!ackAlertId) return;
    const id = ackAlertId;
    try {
      await acknowledgeAlert(id, ackNote || undefined);
      setAckDialogOpen(false);
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
      toast.success("Alert acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    }
  }

  async function handleDeleteOne(id: string) {
    try {
      await deleteAlert(id);
      mutate((prev) => (prev ?? []).filter((a) => a.id !== id), {
        revalidate: false,
      });
      if (selectedId === id) setSelectedId(null);
    } catch {
      /* noop */
    }
  }

  async function handleDeleteAll() {
    try {
      await deleteAllAlerts();
      mutate([], { revalidate: false });
      setClearAllOpen(false);
      setSelectedId(null);
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
      toast.success("All alerts marked read");
    } catch {
      toast.error("Failed to mark all read");
    }
  }

  async function handleSnooze(id: string, hours: number) {
    const a = (alerts ?? []).find((x) => x.id === id);
    if (a?.device_id) {
      try {
        await muteDevice(a.device_id, hours);
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

  async function handleToggleRead(a: Alert) {
    try {
      if (a.is_read) {
        await markAlertUnread(a.id);
        mutate(
          (prev) =>
            (prev ?? []).map((x) => (x.id === a.id ? { ...x, is_read: false } : x)),
          { revalidate: false },
        );
      } else {
        await markAlertRead(a.id);
        mutate(
          (prev) =>
            (prev ?? []).map((x) => (x.id === a.id ? { ...x, is_read: true } : x)),
          { revalidate: false },
        );
      }
    } catch {
      /* noop */
    }
  }

  // ── Error state ──
  if (error) {
    return (
      <PageTransition>
        <div className="space-y-6" data-testid="alerts-root">
          <PageHeader buckets={buckets} disabled />
          <ErrorState
            title="Couldn't reach the alerts service"
            message={String(error)}
            onRetry={() => mutate()}
          />
        </div>
      </PageTransition>
    );
  }

  // ── Loading state ──
  if (isLoading && !alerts) {
    return (
      <PageTransition>
        <div className="space-y-5" data-testid="alerts-root">
          <PageHeader buckets={buckets} disabled />
          <LoadingState
            title="Loading alerts"
            message="Pulling open alerts and their history…"
            tiles={4}
            rows={6}
          />
        </div>
      </PageTransition>
    );
  }

  // ── Empty state ──
  if (buckets.all === 0) {
    return (
      <PageTransition>
        <div className="space-y-5" data-testid="alerts-root">
          <PageHeader
            buckets={buckets}
            onMarkAllRead={undefined}
            onClearAll={undefined}
          />
          <EmptyState
            title="All clear!"
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
        </div>
      </PageTransition>
    );
  }

  // ── Body: literal port of `Alerts` (alerts-login.jsx 43-216) ──
  // Outer wrapper keeps `padding: 18px / gap: 14px` per source.
  return (
    <PageTransition>
      <div
        data-testid="alerts-root"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <PageHeader
          buckets={buckets}
          onMarkAllRead={
            buckets.open > 0 && (alerts ?? []).some((a) => !a.is_read)
              ? handleMarkAllRead
              : undefined
          }
          onClearAll={buckets.all > 0 ? () => setClearAllOpen(true) : undefined}
        />

        {/* Severity bucket KPIs — source 79-93 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
          aria-label="Severity"
        >
          {(
            [
              { sev: "critical", count: buckets.critical, color: "#fb7185" },
              { sev: "warning", count: buckets.warning, color: "#fbbf24" },
              { sev: "info", count: buckets.info, color: "#38bdf8" },
              { sev: "resolved", count: buckets.resolved, color: "#4ade80" },
            ] as const
          ).map((b) => (
            <div
              key={b.sev}
              className="mesh-card"
              style={{
                padding: "var(--card-pad)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  background: b.color,
                  borderRadius: 2,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  className="t-micro"
                  style={{ color: "var(--text-mute)" }}
                >
                  {b.sev}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: "var(--text)",
                    lineHeight: 1,
                    marginTop: 2,
                  }}
                >
                  {b.count}
                </div>
              </div>
              <Spark
                data={sparkSeed(b.count)}
                width={64}
                height={28}
                color={b.color}
              />
            </div>
          ))}
        </div>

        {/* Two-pane: list + detail — source 96-216 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: 12,
          }}
        >
          {/* List pane — source 98-138 */}
          <div className="mesh-card" style={{ padding: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <h3 className="t-h3" style={{ margin: 0 }}>
                  Open alerts
                </h3>
                <span
                  style={{
                    font: "500 11px var(--font-mono)",
                    color: "var(--text-mute)",
                  }}
                >
                  · chronological
                </span>
              </div>
              <div
                role="tablist"
                aria-label="Alert view"
                style={{
                  display: "flex",
                  gap: 4,
                  background: "var(--surface-2)",
                  padding: 2,
                  borderRadius: "var(--radius-sm)",
                  border: "var(--hairline) solid rgba(96,144,212,0.20)",
                }}
              >
                {(["All", "Open", "Ack", "Resolved"] as ViewFilter[]).map(
                  (r) => {
                    const active = view === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setView(r)}
                        style={{
                          padding: "3px 9px",
                          font: "500 11px var(--font-sans)",
                          borderRadius: "var(--radius-xs)",
                          color: active ? "var(--text)" : "var(--text-mute)",
                          background: active
                            ? "var(--surface-3)"
                            : "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {r}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
            <div
              style={{
                borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
              }}
            >
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--text-mute)",
                    font: "400 12px var(--font-sans)",
                  }}
                >
                  Nothing matches "{view}".
                </div>
              ) : (
                filtered.map((a, i) => {
                  const sev = sevFromAlert(a);
                  const isSelected = a.id === selectedId;
                  const railColor = SEV_COLOR[sev];
                  return (
                    <div
                      key={a.id}
                      data-testid="alert-row"
                      data-severity={sev}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(a.id);
                        }
                      }}
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "11px 14px",
                        borderBottom:
                          i < filtered.length - 1
                            ? "var(--hairline) solid rgba(96,144,212,0.20)"
                            : "none",
                        background: isSelected
                          ? "var(--surface-2)"
                          : "transparent",
                        borderLeft: `2px solid ${railColor}`,
                        cursor: "pointer",
                      }}
                    >
                      {isSelected && (
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 6,
                            bottom: 6,
                            width: 2,
                            background: "#2563eb",
                          }}
                        />
                      )}
                      <div style={{ marginTop: 2 }}>
                        <SevIcon sev={sev} size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              font: "500 13px var(--font-sans)",
                              color: "var(--text)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {alertTitle(a)}
                          </span>
                          <span
                            className="mono"
                            style={{
                              font: "500 11px var(--font-mono)",
                              color: "var(--text-mute)",
                              flexShrink: 0,
                            }}
                          >
                            {timeAgo(a.created_at)}
                          </span>
                        </div>
                        <div
                          className="mono"
                          style={{
                            font: "400 11px var(--font-mono)",
                            color: "var(--text-mute)",
                            marginTop: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {alertSource(a)} · {alertTarget(a)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail pane — source 140-215 */}
          <div
            className="mesh-card"
            style={{
              padding: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {selectedAlert ? (
              <AlertDetail
                alert={selectedAlert}
                onAcknowledge={() => openAckDialog(selectedAlert.id)}
                onDelete={() => handleDeleteOne(selectedAlert.id)}
                onSnooze={(h) => handleSnooze(selectedAlert.id, h)}
                onToggleRead={() => handleToggleRead(selectedAlert)}
              />
            ) : (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-mute)",
                  font: "400 12px var(--font-sans)",
                }}
              >
                Select an alert to view details.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acknowledge dialog */}
      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent
          className="mesh-card"
          style={{ background: "var(--surface-1)" }}
        >
          <DialogHeader>
            <DialogTitle>Acknowledge alert</DialogTitle>
            <DialogDescription>
              Optionally add a note about why this alert is being acknowledged.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Add a note (optional)…"
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAcknowledge();
            }}
            style={{
              background: "var(--surface-2)",
              border: "var(--hairline) solid rgba(96,144,212,0.40)",
            }}
          />
          <DialogFooter>
            <button
              className="btn"
              type="button"
              onClick={() => setAckDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleAcknowledge}
            >
              Acknowledge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear-all dialog */}
      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent
          className="mesh-card"
          style={{ background: "var(--surface-1)" }}
        >
          <DialogHeader>
            <DialogTitle>Delete all alerts</DialogTitle>
            <DialogDescription>
              Delete all {buckets.all} alerts? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="btn"
              type="button"
              onClick={() => setClearAllOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleDeleteAll}
              style={{
                background: "#fb7185",
                borderColor: "#fb7185",
              }}
            >
              Delete all
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}

// ── Header — source 60-77 ──────────────────────────────────────

function PageHeader({
  buckets,
  onMarkAllRead,
  onClearAll,
  disabled,
}: {
  buckets: {
    critical: number;
    warning: number;
    info: number;
    resolved: number;
    open: number;
    all: number;
  };
  onMarkAllRead?: () => void;
  onClearAll?: () => void;
  disabled?: boolean;
}) {
  // Source subtitle: "4 open · 1 acknowledged · 18 resolved · 24h".
  // Compatibility: existing alerts-severity test asserts "N critical",
  // "N warning", "N info" text — keep those phrases visible in subtitle.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <div className="t-micro">Operations</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "4px 0 6px",
          }}
        >
          <h1 className="t-display" style={{ margin: 0 }}>
            Alerts
          </h1>
          <HelpTooltip text="Network events that need attention — devices joining/leaving, agents going offline, and configured rule violations." />
        </div>
        <div
          className="t-small mono"
          style={{ color: "var(--text-mute)" }}
        >
          {buckets.all} total · {" "}
          <span
            style={{
              color: buckets.critical > 0 ? "#fb7185" : undefined,
            }}
          >
            {buckets.critical} critical
          </span>
          {" · "}
          <span
            style={{
              color: buckets.warning > 0 ? "#fbbf24" : undefined,
            }}
          >
            {buckets.warning} warning
          </span>
          {" · "}
          <span
            style={{
              color: buckets.info > 0 ? "#38bdf8" : undefined,
            }}
          >
            {buckets.info} info
          </span>
          {" · "}
          {buckets.resolved} acknowledged
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {onMarkAllRead && (
          <button
            type="button"
            data-testid="alerts-mark-all-read"
            className="btn"
            disabled={disabled}
            onClick={onMarkAllRead}
          >
            <CheckCheck size={12} />
            <span>Ack all</span>
          </button>
        )}
        <a className="btn" href="/settings/alert-rules">
          <FilterIcon size={12} />
          <span>Rules</span>
        </a>
        {onClearAll && (
          <button
            type="button"
            data-testid="alerts-clear-all"
            className="btn btn-primary"
            disabled={disabled}
            onClick={onClearAll}
            style={{
              background: "#fb7185",
              borderColor: "#fb7185",
            }}
          >
            <Trash2 size={12} />
            <span>Clear all</span>
          </button>
        )}
        {!onClearAll && (
          <a className="btn btn-primary" href="/settings/alert-rules">
            <Plus size={12} />
            <span>New rule</span>
          </a>
        )}
      </div>
    </div>
  );
}

// ── Detail pane — source 140-215 ───────────────────────────────

function AlertDetail({
  alert,
  onAcknowledge,
  onDelete,
  onSnooze,
  onToggleRead,
}: {
  alert: Alert;
  onAcknowledge: () => void;
  onDelete: () => void;
  onSnooze: (hours: number) => void;
  onToggleRead: () => void;
}) {
  const sev = sevFromAlert(alert);
  const ackId = `ALERT-${alert.id.slice(0, 8).toUpperCase()}`;
  const fired = new Date(alert.created_at);
  const firedStr = `${fired.toISOString().slice(11, 19)} UTC`;

  // Pull lines for the "live metric / history" block from `alert.details`
  // when present; otherwise show a placeholder hint.
  const detailLines = (alert.details ?? "").split("\n").slice(0, 6);

  // Spark data — derive from alert.details (if numeric) or use a fallback
  // descending curve to indicate a stalled / spiking metric.
  const sparkData = useMemo(() => {
    const nums = (alert.details ?? "").match(/\d+(\.\d+)?/g);
    if (nums && nums.length >= 4) {
      return nums.slice(0, 30).map((n) => Number(n));
    }
    // Default shape from source: heartbeat-then-drop for critical/warning,
    // gentle rise for info/resolved.
    if (sev === "critical" || sev === "warning") {
      return [2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 0, 0, 0];
    }
    return [1, 1, 2, 2, 3, 3, 3, 4, 3, 4, 5, 4, 5, 5];
  }, [alert.details, sev]);

  return (
    <>
      {/* Detail header — source 142-156 */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <SevBadge sev={sev} />
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-mute)" }}
          >
            {ackId}
          </span>
          <span style={{ flex: 1 }} />
          {!alert.acknowledged_at && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onAcknowledge}
            >
              <Check size={11} />
              <span>Ack</span>
            </button>
          )}
          {alert.device_id ? (
            <a
              className="btn btn-sm btn-primary"
              href={`/devices?focus=${alert.device_id}`}
            >
              <span>Investigate</span>
            </a>
          ) : alert.agent_id ? (
            <a
              className="btn btn-sm btn-primary"
              href={`/agents?focus=${alert.agent_id}`}
            >
              <span>Investigate</span>
            </a>
          ) : null}
        </div>
        <h2 className="t-h2" style={{ margin: "4px 0 8px" }}>
          {alertTitle(alert)}
        </h2>
        <div
          className="t-small"
          style={{ color: "var(--text-dim)" }}
        >
          {alert.message}
        </div>
      </div>

      {/* Metadata grid — source 158-172 */}
      <div
        style={{
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        {(
          [
            ["rule", alert.type.replace(/_/g, " ")],
            ["fired", firedStr],
            [
              "target",
              alert.device_id ?? alert.agent_id ?? "system",
            ],
            ["severity", alert.severity.toLowerCase()],
            [
              "source",
              alertSource(alert),
            ],
            [
              "status",
              alert.acknowledged_at
                ? "acknowledged"
                : alert.is_read
                  ? "read"
                  : "unread",
            ],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k}>
            <div className="t-micro" style={{ marginBottom: 2 }}>
              {k}
            </div>
            <div
              className="mono"
              style={{
                font: "500 12px var(--font-mono)",
                color: "var(--text)",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Live metric — source 175-196 */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
          flex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span className="t-h3">Event signal · last window</span>
          <span
            className="mono"
            style={{
              color: SEV_COLOR[sev],
              font: "500 11px var(--font-mono)",
            }}
          >
            {sev === "resolved"
              ? "recovered"
              : alert.acknowledged_at
                ? "acknowledged"
                : "active"}
          </span>
        </div>
        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            border: "var(--hairline) solid rgba(96,144,212,0.20)",
            padding: 10,
          }}
        >
          <Spark
            data={sparkData}
            width={400}
            height={50}
            color={SEV_COLOR[sev]}
          />
        </div>
        <div
          style={{
            marginTop: 8,
            font: "400 11px var(--font-mono)",
            color: "var(--text-mute)",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "var(--text)" }}>{firedStr.slice(0, 8)}</span>{" "}
          alert raised · {alert.type.replace(/_/g, " ")}
          <br />
          {detailLines.length > 0 && detailLines[0] ? (
            detailLines.map((line, idx) => (
              <span key={idx}>
                <span style={{ color: "var(--text-faint)" }}>···</span> {line}
                <br />
              </span>
            ))
          ) : (
            <span style={{ color: "var(--text-faint)" }}>
              no additional context attached.
            </span>
          )}
        </div>
      </div>

      {/* Footer — adapted; source ends with the metric block */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
        }}
      >
        {!alert.acknowledged_at && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSnooze(1)}
            >
              <VolumeX size={11} />
              <span>1h</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSnooze(4)}
            >
              <VolumeX size={11} />
              <span>4h</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSnooze(24)}
            >
              <VolumeX size={11} />
              <span>24h</span>
            </button>
          </>
        )}
        {!alert.acknowledged_at && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onToggleRead}
          >
            {alert.is_read ? <Bell size={11} /> : <Check size={11} />}
            <span>{alert.is_read ? "Mark unread" : "Mark read"}</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={onDelete}
          style={{ color: "#fb7185" }}
        >
          <Trash2 size={11} />
          <span>Delete</span>
        </button>
      </div>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

// Build a tiny synthetic spark series from a bucket count so the layout
// stays stable when the backend doesn't ship per-bucket history yet.
// Source uses `[3,2,4,2,5,3,4,6,3,2,5,4,3,5,b.count]` — port the shape
// and just substitute the trailing data point.
function sparkSeed(count: number): number[] {
  return [3, 2, 4, 2, 5, 3, 4, 6, 3, 2, 5, 4, 3, 5, Math.max(0, count)];
}

