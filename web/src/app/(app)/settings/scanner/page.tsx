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

export default function ScannerSettingsPage() {
  const [scanInterval, setScanInterval] = useState("60");
  const [savedScanInterval, setSavedScanInterval] = useState("60");
  const [scanSubnets, setScanSubnets] = useState("");
  const [savedScanSubnets, setSavedScanSubnets] = useState("");
  const [pingSweepEnabled, setPingSweepEnabled] = useState(true);
  const [savedPingSweepEnabled, setSavedPingSweepEnabled] = useState(true);
  const [scannerStatus, setScannerStatus] = useState<Status>("idle");
  const [scannerMsg, setScannerMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          scan_interval_seconds: number | null;
          scan_subnets: string | null;
          ping_sweep_enabled: boolean | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          const interval = String(data.scan_interval_seconds ?? 60);
          setScanInterval(interval);
          setSavedScanInterval(interval);
          const subnets = data.scan_subnets ?? "";
          setScanSubnets(subnets);
          setSavedScanSubnets(subnets);
          const ping = data.ping_sweep_enabled ?? true;
          setPingSweepEnabled(ping);
          setSavedPingSweepEnabled(ping);
        }
      )
      .catch(() => {});
  }, []);

  const scannerDirty =
    scanInterval !== savedScanInterval ||
    scanSubnets !== savedScanSubnets ||
    pingSweepEnabled !== savedPingSweepEnabled;

  async function handleScannerSave() {
    settingsLoadTokenRef.current++;
    setScannerStatus("loading");
    setScannerMsg("");
    try {
      const interval = parseInt(scanInterval, 10);
      if (isNaN(interval) || interval < 10) {
        setScannerStatus("error");
        setScannerMsg("Scan interval must be at least 10 seconds.");
        return;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_interval_seconds: interval,
          scan_subnets: scanSubnets,
          ping_sweep_enabled: pingSweepEnabled,
        }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const newInterval = String(data.scan_interval_seconds ?? interval);
        setScanInterval(newInterval);
        setSavedScanInterval(newInterval);
        const newSubnets = data.scan_subnets ?? scanSubnets;
        setScanSubnets(newSubnets);
        setSavedScanSubnets(newSubnets);
        const newPing = data.ping_sweep_enabled ?? pingSweepEnabled;
        setPingSweepEnabled(newPing);
        setSavedPingSweepEnabled(newPing);
        setScannerStatus("success");
        setScannerMsg("Scanner settings saved.");
        setTimeout(() => setScannerStatus("idle"), 3000);
      } else {
        setScannerStatus("error");
        setScannerMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setScannerStatus("error");
      setScannerMsg("Network error.");
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
          <h1 className="text-2xl font-semibold text-white">Network Scanner</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                <Radar className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Scanner Configuration
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Configure ARP scanning interval, target subnets, and ping sweep.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scan-interval" className="text-xs text-slate-400">
                Scan interval (seconds)
              </Label>
              <Input
                id="scan-interval"
                type="number"
                min={10}
                value={scanInterval}
                onChange={(e) => setScanInterval(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="60"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scan-subnets" className="text-xs text-slate-400">
                Subnets to scan (comma-separated CIDR)
              </Label>
              <Input
                id="scan-subnets"
                type="text"
                value={scanSubnets}
                onChange={(e) => setScanSubnets(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="10.0.0.0/24, 192.168.1.0/24"
              />
              <p className="text-[10px] text-slate-600">
                Leave empty to auto-detect from VyOS interfaces.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={pingSweepEnabled}
                onClick={() => setPingSweepEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  pingSweepEnabled ? "bg-cyan-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    pingSweepEnabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <Label className="text-xs text-slate-400 cursor-pointer" onClick={() => setPingSweepEnabled((v) => !v)}>
                Active ping sweep
              </Label>
            </div>

            {scannerStatus === "success" && scannerMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{scannerMsg}</p>
              </div>
            )}
            {scannerStatus === "error" && scannerMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{scannerMsg}</p>
              </div>
            )}

            <Button
              onClick={handleScannerSave}
              disabled={!scannerDirty || scannerStatus === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {scannerStatus === "loading" ? (
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
