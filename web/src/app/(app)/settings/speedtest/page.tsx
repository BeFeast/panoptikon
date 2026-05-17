"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radar,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
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

  // Inline validation
  const retValid =
    speedtestRetDays.length === 0
      ? "idle"
      : !isNaN(parseInt(speedtestRetDays, 10)) && parseInt(speedtestRetDays, 10) >= 1
        ? "valid"
        : "error";
  const autoValid =
    speedtestAutoHours.length === 0
      ? "idle"
      : !isNaN(parseInt(speedtestAutoHours, 10)) && parseInt(speedtestAutoHours, 10) >= 0
        ? "valid"
        : "error";

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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Speed Test</h1>
        </div>

        <SettingsSection
          icon={<Radar className="h-4 w-4 text-mesh-primary" />}
          iconBg="bg-mesh-primary/10"
          title="Speed Test Configuration"
          description="Configure automatic speed tests and result retention."
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="speedtest-auto" className="text-xs text-mesh-text-dim">
                Auto-run interval (hours)
              </Label>
              <div className="relative">
                <Input
                  id="speedtest-auto"
                  type="number"
                  min={0}
                  value={speedtestAutoHours}
                  onChange={(e) => setSpeedtestAutoHours(e.target.value)}
                  className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                    autoValid === "valid"
                      ? "border-[#4ade80]/40"
                      : autoValid === "error"
                        ? "border-[#fb7185]/40"
                        : ""
                  }`}
                  placeholder="0 = disabled"
                />
                {autoValid === "valid" && (
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                    <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-mesh-text-mute">
                Set to 0 to disable. E.g. 6 = every 6 hours.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="speedtest-ret" className="text-xs text-mesh-text-dim">
                History retention (days)
              </Label>
              <div className="relative">
                <Input
                  id="speedtest-ret"
                  type="number"
                  min={1}
                  value={speedtestRetDays}
                  onChange={(e) => setSpeedtestRetDays(e.target.value)}
                  className={`border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                    retValid === "valid"
                      ? "border-[#4ade80]/40"
                      : retValid === "error"
                        ? "border-[#fb7185]/40"
                        : ""
                  }`}
                  placeholder="90"
                />
                {retValid === "valid" && (
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                    <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                  </div>
                )}
              </div>
              {retValid === "error" && (
                <p className="animate-fade-in text-xs text-[#fb7185]">Must be at least 1 day.</p>
              )}
            </div>
          </div>

          {speedtestStatus === "success" && speedtestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{speedtestMsg}</p>
            </div>
          )}
          {speedtestStatus === "error" && speedtestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{speedtestMsg}</p>
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
