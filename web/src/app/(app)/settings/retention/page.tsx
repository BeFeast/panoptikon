"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  Trash2,
  HardDrive,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import {
  SettingsSection,
  ValidatedInput,
  AnimatedSaveButton,
} from "@/components/settings";
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

  const trafficNum = parseInt(retTrafficHours, 10);
  const alertsNum = parseInt(retAlertsDays, 10);
  const agentNum = parseInt(retAgentDays, 10);
  const trafficInvalid = isNaN(trafficNum) || trafficNum < 1;
  const alertsInvalid = isNaN(alertsNum) || alertsNum < 1;
  const agentInvalid = isNaN(agentNum) || agentNum < 1;

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
          <h1 className="text-2xl font-semibold text-white">Data Retention</h1>
        </div>

        <SettingsSection
          icon={<Database className="h-4 w-4 text-amber-400" />}
          iconBg="bg-amber-500/10"
          title="Retention Policy"
          description="Configure how long data is kept before automatic cleanup."
        >
          <ValidatedInput
            id="ret-traffic"
            label="Traffic samples retention (hours)"
            type="number"
            min={1}
            value={retTrafficHours}
            onChange={(e) => setRetTrafficHours(e.target.value)}
            placeholder="48"
            validationState={
              retTrafficHours === ""
                ? "idle"
                : trafficInvalid
                  ? "invalid"
                  : "valid"
            }
            validationMessage={
              trafficInvalid && retTrafficHours !== ""
                ? "Must be at least 1 hour."
                : undefined
            }
          />

          <ValidatedInput
            id="ret-alerts"
            label="Acknowledged alerts retention (days)"
            type="number"
            min={1}
            value={retAlertsDays}
            onChange={(e) => setRetAlertsDays(e.target.value)}
            placeholder="90"
            validationState={
              retAlertsDays === ""
                ? "idle"
                : alertsInvalid
                  ? "invalid"
                  : "valid"
            }
            validationMessage={
              alertsInvalid && retAlertsDays !== ""
                ? "Must be at least 1 day."
                : undefined
            }
          />

          <ValidatedInput
            id="ret-agent"
            label="Agent reports retention (days)"
            type="number"
            min={1}
            value={retAgentDays}
            onChange={(e) => setRetAgentDays(e.target.value)}
            placeholder="7"
            validationState={
              retAgentDays === ""
                ? "idle"
                : agentInvalid
                  ? "invalid"
                  : "valid"
            }
            validationMessage={
              agentInvalid && retAgentDays !== ""
                ? "Must be at least 1 day."
                : undefined
            }
          />

          {retentionStatus === "error" && retentionMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{retentionMsg}</p>
            </div>
          )}

          <AnimatedSaveButton
            onClick={handleRetentionSave}
            status={retentionStatus}
            disabled={!retentionDirty || retentionStatus === "loading"}
          />
        </SettingsSection>

        <SettingsSection
          icon={<HardDrive className="h-4 w-4 text-amber-400" />}
          iconBg="bg-amber-500/10"
          title="Database"
          description="View database size and reclaim space."
        >
          <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <span className="text-xs text-slate-400">Current DB size</span>
            <span className="text-sm font-medium text-white">
              {dbSizeBytes !== null ? formatBytes(dbSizeBytes) : "..."}
            </span>
          </div>

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
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
