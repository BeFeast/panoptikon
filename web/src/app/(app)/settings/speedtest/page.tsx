"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radar,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/settings-section";
import { ValidatedInput } from "@/components/settings/validated-input";
import { SaveButton } from "@/components/settings/save-button";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function SpeedtestSettingsPage() {
  const [speedtestRetDays, setSpeedtestRetDays] = useState("90");
  const [savedSpeedtestRetDays, setSavedSpeedtestRetDays] = useState("90");
  const [speedtestAutoHours, setSpeedtestAutoHours] = useState("0");
  const [savedSpeedtestAutoHours, setSavedSpeedtestAutoHours] = useState("0");
  const [speedtestStatus, setSpeedtestStatus] = useState<Status>("idle");
  const [speedtestMsg, setSpeedtestMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          speedtest_retention_days: number | null;
          speedtest_auto_interval_hours: number | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          const stRetDays = String(data.speedtest_retention_days ?? 90);
          setSpeedtestRetDays(stRetDays);
          setSavedSpeedtestRetDays(stRetDays);
          const stAutoHours = String(data.speedtest_auto_interval_hours ?? 0);
          setSpeedtestAutoHours(stAutoHours);
          setSavedSpeedtestAutoHours(stAutoHours);
        }
      )
      .catch(() => {});
  }, []);

  const speedtestDirty =
    speedtestRetDays !== savedSpeedtestRetDays ||
    speedtestAutoHours !== savedSpeedtestAutoHours;

  const autoNum = parseInt(speedtestAutoHours, 10);
  const autoValid =
    speedtestAutoHours === "" ? "idle" : !isNaN(autoNum) && autoNum >= 0 ? "valid" : "invalid";
  const retNum = parseInt(speedtestRetDays, 10);
  const retValid =
    speedtestRetDays === "" ? "idle" : !isNaN(retNum) && retNum >= 1 ? "valid" : "invalid";

  async function handleSpeedtestSave() {
    settingsLoadTokenRef.current++;
    setSpeedtestStatus("loading");
    setSpeedtestMsg("");
    try {
      const retDays = parseInt(speedtestRetDays, 10);
      const autoHours = parseInt(speedtestAutoHours, 10);

      if (isNaN(retDays) || retDays < 1) {
        setSpeedtestStatus("error");
        setSpeedtestMsg("Retention must be at least 1 day.");
        return;
      }
      if (isNaN(autoHours) || autoHours < 0) {
        setSpeedtestStatus("error");
        setSpeedtestMsg("Auto-run interval must be 0 or more hours.");
        return;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speedtest_retention_days: retDays,
          speedtest_auto_interval_hours: autoHours,
        }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const newRetDays = String(data.speedtest_retention_days ?? retDays);
        setSpeedtestRetDays(newRetDays);
        setSavedSpeedtestRetDays(newRetDays);
        const newAutoHours = String(data.speedtest_auto_interval_hours ?? autoHours);
        setSpeedtestAutoHours(newAutoHours);
        setSavedSpeedtestAutoHours(newAutoHours);
        setSpeedtestStatus("success");
        setSpeedtestMsg("Speed test settings saved.");
        setTimeout(() => setSpeedtestStatus("idle"), 3000);
      } else {
        setSpeedtestStatus("error");
        setSpeedtestMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setSpeedtestStatus("error");
      setSpeedtestMsg("Network error.");
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
          <h1 className="text-2xl font-semibold text-white">Speed Test</h1>
        </div>

        <SettingsSection
          icon={<Radar className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Speed Test Configuration"
          description="Configure automatic speed tests and result retention."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ValidatedInput
              inputId="speedtest-auto"
              label="Auto-run interval (hours)"
              type="number"
              min={0}
              value={speedtestAutoHours}
              onChange={(e) => setSpeedtestAutoHours(e.target.value)}
              placeholder="0 = disabled"
              hint="Set to 0 to disable. E.g. 6 = every 6 hours."
              validationState={autoValid as "idle" | "valid" | "invalid"}
              error="Must be 0 or more hours"
            />
            <ValidatedInput
              inputId="speedtest-ret"
              label="History retention (days)"
              type="number"
              min={1}
              value={speedtestRetDays}
              onChange={(e) => setSpeedtestRetDays(e.target.value)}
              placeholder="90"
              validationState={retValid as "idle" | "valid" | "invalid"}
              error="Must be at least 1 day"
            />
          </div>

          {speedtestStatus === "success" && speedtestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{speedtestMsg}</p>
            </div>
          )}
          {speedtestStatus === "error" && speedtestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{speedtestMsg}</p>
            </div>
          )}

          <SaveButton
            status={speedtestStatus}
            disabled={!speedtestDirty}
            onClick={handleSpeedtestSave}
          />
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
