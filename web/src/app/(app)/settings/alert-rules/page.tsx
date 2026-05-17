"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
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
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";
import {
  fetchAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
} from "@/lib/api";
import type { AlertRule } from "@/lib/types";

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

export default function AlertRulesPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [statusMsg, setStatusMsg] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

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

  async function handleUpdate(id: string, updates: Partial<AlertRule>) {
    setSavingId(id);
    try {
      const updated = await updateAlertRule(id, updates);
      setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      setStatusMsg("Failed to save changes.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
    setSavingId(null);
  }

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

  const existingTypes = new Set<string>(rules.map((r) => r.rule_type));
  const availableTypes = Object.keys(RULE_TYPE_LABELS).filter(
    (t) => !existingTypes.has(t)
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-8 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border-strong text-slate-400 transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Alert Rules</h1>
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
          <Card className="border-mesh-border-strong bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </CardContent>
          </Card>
        ) : (
          <>
            {rules.length === 0 && (
              <Card className="border-mesh-border-strong bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    No alert rules configured. Add a rule below.
                  </p>
                </CardContent>
              </Card>
            )}

            {rules.map((rule) => {
              const meta = RULE_TYPE_LABELS[rule.rule_type];
              return (
                <Card key={rule.id} className="border-mesh-border-strong bg-mesh-surface-1/95">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                          <Bell className="h-4 w-4 text-amber-400" />
                        </div>
                        <div>
                          <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            {meta?.label ?? rule.rule_type}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-500">
                            {meta?.description ?? ""}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(checked) =>
                            handleUpdate(rule.id, { enabled: checked })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(rule.id)}
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
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id
                                  ? { ...r, threshold_value: val }
                                  : r
                              )
                            );
                          }}
                          onBlur={() =>
                            handleUpdate(rule.id, {
                              threshold_value: rule.threshold_value,
                            })
                          }
                          className="w-32 border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-slate-600"
                          placeholder={
                            rule.rule_type === "device_offline" ? "5" : "100"
                          }
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`telegram-${rule.id}`}
                          checked={rule.notify_telegram}
                          onCheckedChange={(checked) =>
                            handleUpdate(rule.id, { notify_telegram: checked })
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
                            handleUpdate(rule.id, { notify_in_app: checked })
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
              );
            })}

            {availableTypes.length > 0 && (
              <Card className="border-dashed border-mesh-border-strong bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
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
                        className="border-mesh-border-strong text-slate-300 hover:bg-mesh-surface-2/55"
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
