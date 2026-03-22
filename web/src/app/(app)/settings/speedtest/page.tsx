"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radar,
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
      <div className="mx-auto max-w-lg space-y-8 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Speed Test</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Radar className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Speed Test Configuration
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure automatic speed tests and result retention.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="speedtest-auto" className="text-xs text-slate-400">
                  Auto-run interval (hours)
                </Label>
                <Input
                  id="speedtest-auto"
                  type="number"
                  min={0}
                  value={speedtestAutoHours}
                  onChange={(e) => setSpeedtestAutoHours(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="0 = disabled"
                />
                <p className="text-[10px] text-slate-600">
                  Set to 0 to disable. E.g. 6 = every 6 hours.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="speedtest-ret" className="text-xs text-slate-400">
                  History retention (days)
                </Label>
                <Input
                  id="speedtest-ret"
                  type="number"
                  min={1}
                  value={speedtestRetDays}
                  onChange={(e) => setSpeedtestRetDays(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="90"
                />
              </div>
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

            <Button
              onClick={handleSpeedtestSave}
              disabled={!speedtestDirty || speedtestStatus === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {speedtestStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
