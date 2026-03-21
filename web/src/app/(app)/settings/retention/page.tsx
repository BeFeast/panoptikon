"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
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
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RetentionSettingsPage() {
  const [retTrafficHours, setRetTrafficHours] = useState("48");
  const [savedRetTrafficHours, setSavedRetTrafficHours] = useState("48");
  const [retAlertsDays, setRetAlertsDays] = useState("90");
  const [savedRetAlertsDays, setSavedRetAlertsDays] = useState("90");
  const [retAgentDays, setRetAgentDays] = useState("7");
  const [savedRetAgentDays, setSavedRetAgentDays] = useState("7");
  const [retentionStatus, setRetentionStatus] = useState<Status>("idle");
  const [retentionMsg, setRetentionMsg] = useState("");
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [vacuumStatus, setVacuumStatus] = useState<Status>("idle");
  const [vacuumMsg, setVacuumMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          retention_traffic_hours: number | null;
          retention_alerts_days: number | null;
          retention_agent_reports_days: number | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          const trafficH = String(data.retention_traffic_hours ?? 48);
          setRetTrafficHours(trafficH);
          setSavedRetTrafficHours(trafficH);
          const alertsD = String(data.retention_alerts_days ?? 90);
          setRetAlertsDays(alertsD);
          setSavedRetAlertsDays(alertsD);
          const agentD = String(data.retention_agent_reports_days ?? 7);
          setRetAgentDays(agentD);
          setSavedRetAgentDays(agentD);
        }
      )
      .catch(() => {});

    fetch("/api/v1/settings/db-size", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { size_bytes: number }) => {
        setDbSizeBytes(data.size_bytes);
      })
      .catch(() => {});
  }, []);

  const retentionDirty =
    retTrafficHours !== savedRetTrafficHours ||
    retAlertsDays !== savedRetAlertsDays ||
    retAgentDays !== savedRetAgentDays;

  async function handleRetentionSave() {
    settingsLoadTokenRef.current++;
    setRetentionStatus("loading");
    setRetentionMsg("");
    try {
      const trafficH = parseInt(retTrafficHours, 10);
      const alertsD = parseInt(retAlertsDays, 10);
      const agentD = parseInt(retAgentDays, 10);

      if (isNaN(trafficH) || trafficH < 1) {
        setRetentionStatus("error");
        setRetentionMsg("Traffic retention must be at least 1 hour.");
        return;
      }
      if (isNaN(alertsD) || alertsD < 1) {
        setRetentionStatus("error");
        setRetentionMsg("Alerts retention must be at least 1 day.");
        return;
      }
      if (isNaN(agentD) || agentD < 1) {
        setRetentionStatus("error");
        setRetentionMsg("Agent reports retention must be at least 1 day.");
        return;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retention_traffic_hours: trafficH,
          retention_alerts_days: alertsD,
          retention_agent_reports_days: agentD,
        }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const newTraffic = String(data.retention_traffic_hours ?? trafficH);
        setRetTrafficHours(newTraffic);
        setSavedRetTrafficHours(newTraffic);
        const newAlerts = String(data.retention_alerts_days ?? alertsD);
        setRetAlertsDays(newAlerts);
        setSavedRetAlertsDays(newAlerts);
        const newAgent = String(data.retention_agent_reports_days ?? agentD);
        setRetAgentDays(newAgent);
        setSavedRetAgentDays(newAgent);
        setRetentionStatus("success");
        setRetentionMsg("Retention settings saved.");
        setTimeout(() => setRetentionStatus("idle"), 3000);
      } else {
        setRetentionStatus("error");
        setRetentionMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setRetentionStatus("error");
      setRetentionMsg("Network error.");
    }
  }

  async function handleVacuum() {
    setVacuumStatus("loading");
    setVacuumMsg("");
    try {
      const res = await fetch("/api/v1/settings/vacuum", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 204) {
        setVacuumStatus("success");
        setVacuumMsg("VACUUM completed successfully.");
        fetch("/api/v1/settings/db-size", { credentials: "include" })
          .then((r) => r.json())
          .then((data: { size_bytes: number }) => setDbSizeBytes(data.size_bytes))
          .catch(() => {});
        setTimeout(() => setVacuumStatus("idle"), 3000);
      } else {
        setVacuumStatus("error");
        setVacuumMsg(`VACUUM failed (${res.status}).`);
      }
    } catch {
      setVacuumStatus("error");
      setVacuumMsg("Network error.");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight font-display text-white">Data Retention</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <Database className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Retention Configuration
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure how long data is kept and manage database size.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
              <span className="text-xs text-slate-400">Current DB size</span>
              <span className="text-sm font-medium text-white">
                {dbSizeBytes !== null ? formatBytes(dbSizeBytes) : "..."}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ret-traffic" className="text-xs text-slate-400">
                Traffic samples retention (hours)
              </Label>
              <Input
                id="ret-traffic"
                type="number"
                min={1}
                value={retTrafficHours}
                onChange={(e) => setRetTrafficHours(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="48"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ret-alerts" className="text-xs text-slate-400">
                Acknowledged alerts retention (days)
              </Label>
              <Input
                id="ret-alerts"
                type="number"
                min={1}
                value={retAlertsDays}
                onChange={(e) => setRetAlertsDays(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="90"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ret-agent" className="text-xs text-slate-400">
                Agent reports retention (days)
              </Label>
              <Input
                id="ret-agent"
                type="number"
                min={1}
                value={retAgentDays}
                onChange={(e) => setRetAgentDays(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="7"
              />
            </div>

            {retentionStatus === "success" && retentionMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{retentionMsg}</p>
              </div>
            )}
            {retentionStatus === "error" && retentionMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{retentionMsg}</p>
              </div>
            )}
            {vacuumStatus === "success" && vacuumMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{vacuumMsg}</p>
              </div>
            )}
            {vacuumStatus === "error" && vacuumMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{vacuumMsg}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleRetentionSave}
                disabled={!retentionDirty || retentionStatus === "loading"}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {retentionStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={handleVacuum}
                disabled={vacuumStatus === "loading"}
                className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                {vacuumStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                VACUUM
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
