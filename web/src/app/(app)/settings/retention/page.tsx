"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Clock,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
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

  // Inline validation
  const trafficValid =
    retTrafficHours.length === 0
      ? "idle"
      : !isNaN(parseInt(retTrafficHours, 10)) && parseInt(retTrafficHours, 10) >= 1
        ? "valid"
        : "error";
  const alertsValid =
    retAlertsDays.length === 0
      ? "idle"
      : !isNaN(parseInt(retAlertsDays, 10)) && parseInt(retAlertsDays, 10) >= 1
        ? "valid"
        : "error";
  const agentValid =
    retAgentDays.length === 0
      ? "idle"
      : !isNaN(parseInt(retAgentDays, 10)) && parseInt(retAgentDays, 10) >= 1
        ? "valid"
        : "error";

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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Data Retention</h1>
        </div>

        {/* Retention Policies Section */}
        <SettingsSection
          icon={<Clock className="h-4 w-4 text-[#fbbf24]" />}
          iconBg="bg-[#fbbf24]/10"
          title="Retention Policies"
          description="Configure how long different types of data are kept."
        >
          <div className="space-y-1.5">
            <Label htmlFor="ret-traffic" className="text-xs text-mesh-text-dim">
              Traffic samples retention (hours)
            </Label>
            <div className="relative">
              <Input
                id="ret-traffic"
                type="number"
                min={1}
                value={retTrafficHours}
                onChange={(e) => setRetTrafficHours(e.target.value)}
                className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  trafficValid === "valid"
                    ? "border-[#4ade80]/40"
                    : trafficValid === "error"
                      ? "border-[#fb7185]/40"
                      : ""
                }`}
                placeholder="48"
              />
              {trafficValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {trafficValid === "error" && (
              <p className="animate-fade-in text-xs text-[#fb7185]">Must be at least 1 hour.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret-alerts" className="text-xs text-mesh-text-dim">
              Acknowledged alerts retention (days)
            </Label>
            <div className="relative">
              <Input
                id="ret-alerts"
                type="number"
                min={1}
                value={retAlertsDays}
                onChange={(e) => setRetAlertsDays(e.target.value)}
                className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  alertsValid === "valid"
                    ? "border-[#4ade80]/40"
                    : alertsValid === "error"
                      ? "border-[#fb7185]/40"
                      : ""
                }`}
                placeholder="90"
              />
              {alertsValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {alertsValid === "error" && (
              <p className="animate-fade-in text-xs text-[#fb7185]">Must be at least 1 day.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret-agent" className="text-xs text-mesh-text-dim">
              Agent reports retention (days)
            </Label>
            <div className="relative">
              <Input
                id="ret-agent"
                type="number"
                min={1}
                value={retAgentDays}
                onChange={(e) => setRetAgentDays(e.target.value)}
                className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  agentValid === "valid"
                    ? "border-[#4ade80]/40"
                    : agentValid === "error"
                      ? "border-[#fb7185]/40"
                      : ""
                }`}
                placeholder="7"
              />
              {agentValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {agentValid === "error" && (
              <p className="animate-fade-in text-xs text-[#fb7185]">Must be at least 1 day.</p>
            )}
          </div>

          {retentionStatus === "success" && retentionMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{retentionMsg}</p>
            </div>
          )}
          {retentionStatus === "error" && retentionMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{retentionMsg}</p>
            </div>
          )}

          <SaveButton
            status={retentionStatus}
            disabled={!retentionDirty}
            onClick={handleRetentionSave}
          />
        </SettingsSection>

        {/* Database Maintenance Section */}
        <SettingsSection
          icon={<HardDrive className="h-4 w-4 text-mesh-text-dim" />}
          iconBg="bg-mesh-text-mute/10"
          title="Database Maintenance"
          description="Monitor database size and reclaim unused space."
        >
          <div className="flex items-center justify-between rounded-md border border-mesh-border bg-mesh-surface-1 px-3 py-2">
            <span className="text-xs text-mesh-text-dim">Current DB size</span>
            <span className="text-sm font-medium text-white">
              {dbSizeBytes !== null ? formatBytes(dbSizeBytes) : "..."}
            </span>
          </div>

          {vacuumStatus === "success" && vacuumMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{vacuumMsg}</p>
            </div>
          )}
          {vacuumStatus === "error" && vacuumMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{vacuumMsg}</p>
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleVacuum}
            disabled={vacuumStatus === "loading"}
            className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 disabled:opacity-40"
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
