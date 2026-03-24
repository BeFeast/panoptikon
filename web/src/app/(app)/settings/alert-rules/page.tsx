"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  ArrowLeft,
  Bell,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  GripVertical,
  Search,
  Download,
  Upload,
  Clock,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";
import {
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  reorderAlertRules,
  exportAlertRules,
  importAlertRules,
} from "@/lib/api";
import type { AlertRule, CreateAlertRuleRequest } from "@/lib/types";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Status = "idle" | "loading" | "success" | "error";

const RULE_TYPE_LABELS: Record<string, { label: string; description: string; unit: string }> = {
  device_offline: {
    label: "Device Offline",
    description: "Alert when a device is offline for N minutes.",
    unit: "minutes",
  },
  bandwidth_threshold: {
    label: "Bandwidth Threshold",
    description: "Alert when bandwidth exceeds N Mbps.",
    unit: "Mbps",
  },
  new_device: {
    label: "New Unknown Device",
    description: "Alert when an unknown device is detected on the network.",
    unit: "",
  },
};

const DAYS_OF_WEEK = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SortableRuleCard({
  rule,
  savingId,
  onUpdate,
  onDelete,
}: {
  rule: AlertRule;
  savingId: string | null;
  onUpdate: (id: string, updates: Partial<AlertRule>) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = RULE_TYPE_LABELS[rule.rule_type];
  const days = parseDays(rule.schedule_days);

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="cursor-grab touch-none text-slate-600 hover:text-slate-400"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-5 w-5" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <Bell className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  {meta?.label ?? rule.rule_type}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  {meta?.description ?? ""}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1 bg-slate-800 text-slate-400">
                <Activity className="h-3 w-3" />
                {rule.hit_count.toLocaleString()} hits
              </Badge>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) =>
                  onUpdate(rule.id, { enabled: checked })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(rule.id)}
                disabled={savingId === rule.id}
                className="h-8 w-8 text-slate-500 hover:text-rose-400"
              >
                {savingId === rule.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Threshold */}
          {meta?.unit && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">
                Threshold ({meta.unit})
              </Label>
              <Input
                type="number"
                min={1}
                value={rule.threshold_value ?? ""}
                onChange={(e) => {
                  const val = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  onUpdate(rule.id, { threshold_value: val });
                }}
                className="w-32 border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={
                  rule.rule_type === "device_offline" ? "5" : "100"
                }
              />
            </div>
          )}

          {/* Connection limit */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Connection limit (0 = unlimited)
            </Label>
            <Input
              type="number"
              min={0}
              value={rule.connection_limit ?? ""}
              onChange={(e) => {
                const val = e.target.value
                  ? parseInt(e.target.value, 10)
                  : null;
                onUpdate(rule.id, { connection_limit: val });
              }}
              className="w-32 border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="0"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <Label className="text-xs text-slate-400">Schedule (optional)</Label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((d) => {
                const active = days.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? days.filter((x) => x !== d.key)
                        : [...days, d.key];
                      onUpdate(rule.id, {
                        schedule_days: next.length > 0 ? JSON.stringify(next) : null,
                      } as Partial<AlertRule>);
                    }}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-sky-500/20 text-sky-400"
                        : "bg-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {days.length > 0 && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={rule.schedule_start_time ?? ""}
                  onChange={(e) =>
                    onUpdate(rule.id, {
                      schedule_start_time: e.target.value || null,
                    } as Partial<AlertRule>)
                  }
                  className="w-28 border-slate-800 bg-slate-950 text-white"
                />
                <span className="text-xs text-slate-500">to</span>
                <Input
                  type="time"
                  value={rule.schedule_end_time ?? ""}
                  onChange={(e) =>
                    onUpdate(rule.id, {
                      schedule_end_time: e.target.value || null,
                    } as Partial<AlertRule>)
                  }
                  className="w-28 border-slate-800 bg-slate-950 text-white"
                />
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id={`telegram-${rule.id}`}
                checked={rule.notify_telegram}
                onCheckedChange={(checked) =>
                  onUpdate(rule.id, { notify_telegram: checked })
                }
              />
              <Label
                htmlFor={`telegram-${rule.id}`}
                className="text-xs text-slate-400"
              >
                Telegram webhook
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`inapp-${rule.id}`}
                checked={rule.notify_in_app}
                onCheckedChange={(checked) =>
                  onUpdate(rule.id, { notify_in_app: checked })
                }
              />
              <Label
                htmlFor={`inapp-${rule.id}`}
                className="text-xs text-slate-400"
              >
                In-app notification
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AlertRulesPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [statusMsg, setStatusMsg] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setStatus("loading");
    try {
      const data = await fetchAlertRules();
      setRules(data);
      setStatus("idle");
    } catch {
      setStatus("error");
      setStatusMsg("Failed to load alert rules.");
    }
  }

  async function handleCreate(ruleType: string) {
    setStatus("loading");
    setStatusMsg("");
    try {
      const defaults: Record<string, number | undefined> = {
        device_offline: 5,
        bandwidth_threshold: 100,
        new_device: undefined,
      };
      const rule = await createAlertRule({
        rule_type: ruleType as AlertRule["rule_type"],
        threshold_value: defaults[ruleType] ?? null,
      });
      setRules((prev) => [...prev, rule]);
      setStatus("success");
      setStatusMsg(`${RULE_TYPE_LABELS[ruleType]?.label ?? ruleType} rule created.`);
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setStatusMsg("Failed to create rule.");
    }
  }

  // Debounce timer for field-level updates
  const [debounceTimers, setDebounceTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleUpdate = useCallback(
    (id: string, updates: Partial<AlertRule>) => {
      // Immediately update local state
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      );

      // Debounce the API call for text/number fields
      const timerKey = `${id}-${Object.keys(updates).join(",")}`;
      setDebounceTimers((prev) => {
        if (prev[timerKey]) clearTimeout(prev[timerKey]);
        const timer = setTimeout(async () => {
          setSavingId(id);
          try {
            await updateAlertRule(id, updates);
          } catch {
            setStatusMsg("Failed to save changes.");
            setStatus("error");
            setTimeout(() => setStatus("idle"), 3000);
          }
          setSavingId(null);
        }, 400);
        return { ...prev, [timerKey]: timer };
      });
    },
    []
  );

  async function handleDelete(id: string) {
    setSavingId(id);
    try {
      await deleteAlertRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setStatus("success");
      setStatusMsg("Rule deleted.");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setStatusMsg("Failed to delete rule.");
      setTimeout(() => setStatus("idle"), 3000);
    }
    setSavingId(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(rules, oldIndex, newIndex);
    setRules(reordered);

    try {
      await reorderAlertRules(reordered.map((r) => r.id));
    } catch {
      setStatusMsg("Failed to save order.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  async function handleExport() {
    try {
      const data = await exportAlertRules();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "alert-rules.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatusMsg("Failed to export rules.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as CreateAlertRuleRequest[];
        const imported = await importAlertRules(parsed);
        setRules(imported);
        setStatus("success");
        setStatusMsg(`Imported ${imported.length} rule(s).`);
        setTimeout(() => setStatus("idle"), 3000);
      } catch {
        setStatusMsg("Failed to import rules. Check file format.");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    };
    input.click();
  }

  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules;
    const q = searchQuery.toLowerCase();
    return rules.filter((r) => {
      const meta = RULE_TYPE_LABELS[r.rule_type];
      const label = (meta?.label ?? r.rule_type).toLowerCase();
      const desc = (meta?.description ?? "").toLowerCase();
      return label.includes(q) || desc.includes(q) || r.rule_type.includes(q);
    });
  }, [rules, searchQuery]);

  const existingTypes = new Set<string>(rules.map((r) => r.rule_type));
  const availableTypes = Object.keys(RULE_TYPE_LABELS).filter(
    (t) => !existingTypes.has(t)
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Alert Rules</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
          </div>
        </div>

        {/* Search / filter */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-slate-800 bg-slate-900 pl-9 text-white placeholder:text-slate-600"
          />
        </div>

        {status === "success" && statusMsg && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
            <p className="text-xs text-emerald-400">{statusMsg}</p>
          </div>
        )}
        {status === "error" && statusMsg && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{statusMsg}</p>
          </div>
        )}

        {status === "loading" && rules.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </CardContent>
          </Card>
        ) : (
          <>
            {rules.length === 0 && (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    No alert rules configured. Add a rule below.
                  </p>
                </CardContent>
              </Card>
            )}

            {filteredRules.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredRules.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {filteredRules.map((rule) => (
                      <SortableRuleCard
                        key={rule.id}
                        rule={rule}
                        savingId={savingId}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {searchQuery && filteredRules.length === 0 && rules.length > 0 && (
              <Card className="border-slate-800 bg-slate-900">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    No rules match &quot;{searchQuery}&quot;.
                  </p>
                </CardContent>
              </Card>
            )}

            {availableTypes.length > 0 && (
              <Card className="border-dashed border-slate-800 bg-slate-900/50">
                <CardContent className="py-4">
                  <p className="mb-3 text-xs font-medium text-slate-500">
                    Add a rule
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTypes.map((type_key) => (
                      <Button
                        key={type_key}
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreate(type_key)}
                        className="border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {RULE_TYPE_LABELS[type_key]?.label ?? type_key}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
