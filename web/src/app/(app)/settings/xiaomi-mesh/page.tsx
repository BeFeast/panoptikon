"use client";

import { useEffect, useRef, useState } from "react";
import {
  Wifi,
  Plug,
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
import { Switch } from "@/components/ui/switch";
import { testXiaomiMeshConnection } from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function XiaomiMeshSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [ip, setIp] = useState("10.10.0.199");
  const [savedIp, setSavedIp] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [pollInterval, setPollInterval] = useState("30");
  const [savedPollInterval, setSavedPollInterval] = useState<string | null>(
    null
  );

  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [testDetails, setTestDetails] = useState<string[]>([]);

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          xiaomi_mesh_ip: string | null;
          xiaomi_mesh_password_set: boolean;
          xiaomi_mesh_enabled: boolean;
          xiaomi_mesh_poll_interval: number | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setIp(data.xiaomi_mesh_ip ?? "10.10.0.199");
          setSavedIp(data.xiaomi_mesh_ip ?? null);
          setPasswordSet(data.xiaomi_mesh_password_set);
          setEnabled(data.xiaomi_mesh_enabled);
          setSavedEnabled(data.xiaomi_mesh_enabled);
          const interval = String(data.xiaomi_mesh_poll_interval ?? 30);
          setPollInterval(interval);
          setSavedPollInterval(interval);
        }
      )
      .catch(() => {});
  }, []);

  const dirty =
    ip !== (savedIp ?? "10.10.0.199") ||
    password.length > 0 ||
    enabled !== savedEnabled ||
    pollInterval !== (savedPollInterval ?? "30");

  // Validation
  const ipValid = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  const intervalNum = Number(pollInterval);
  const intervalValid =
    !isNaN(intervalNum) && intervalNum >= 10 && intervalNum <= 300;
  const passwordRequired = enabled && !passwordSet && password.length === 0;
  const canSave = dirty && ipValid && intervalValid && !passwordRequired;

  async function handleSave() {
    settingsLoadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, string | boolean | number> = {};
      if (ip !== (savedIp ?? "10.10.0.199")) body.xiaomi_mesh_ip = ip;
      if (password.length > 0) body.xiaomi_mesh_password = password;
      if (enabled !== savedEnabled) body.xiaomi_mesh_enabled = enabled;
      if (pollInterval !== (savedPollInterval ?? "30"))
        body.xiaomi_mesh_poll_interval = intervalNum;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedIp(data.xiaomi_mesh_ip ?? null);
        setIp(data.xiaomi_mesh_ip ?? "10.10.0.199");
        setPasswordSet(data.xiaomi_mesh_password_set);
        setPassword("");
        setSavedEnabled(data.xiaomi_mesh_enabled);
        setEnabled(data.xiaomi_mesh_enabled);
        const interval = String(data.xiaomi_mesh_poll_interval ?? 30);
        setPollInterval(interval);
        setSavedPollInterval(interval);
        setSaveStatus("success");
        setSaveMsg("Xiaomi Mesh settings saved.");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setSaveMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setSaveStatus("error");
      setSaveMsg("Network error.");
    }
  }

  async function handleTest() {
    setTestStatus("loading");
    setTestMsg("");
    setTestDetails([]);
    try {
      const data = await testXiaomiMeshConnection(ip || undefined);
      if (data.success) {
        setTestStatus("success");
        setTestMsg("Connection successful");
        const details: string[] = [];
        if (data.model) details.push(`Model: ${data.model}`);
        if (data.hardware) details.push(`Hardware: ${data.hardware}`);
        if (data.firmware) details.push(`Firmware: ${data.firmware}`);
        if (data.router_name) details.push(`Name: ${data.router_name}`);
        setTestDetails(details);
        setTimeout(() => setTestStatus("idle"), 8000);
      } else {
        setTestStatus("error");
        setTestMsg(data.message || "Connection failed.");
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Failed to test connection.");
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
          <h1 className="text-2xl font-semibold text-white">Xiaomi Mesh</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
                <Wifi className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base text-white">
                  Xiaomi Mesh Connection
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Connect to your Xiaomi mesh router for WiFi, topology, and
                  device data.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="xiaomi-enabled"
                  className="text-xs text-slate-400"
                >
                  {enabled ? "Enabled" : "Disabled"}
                </Label>
                <Switch
                  id="xiaomi-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="xiaomi-ip" className="text-xs text-slate-400">
                Router IP{" "}
                {savedIp && (
                  <span className="text-emerald-500">(saved)</span>
                )}
              </Label>
              <Input
                id="xiaomi-ip"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="10.10.0.199"
              />
              {ip && !ipValid && (
                <p className="text-xs text-rose-400">
                  Enter a valid IPv4 address.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="xiaomi-password"
                className="text-xs text-slate-400"
              >
                Password{" "}
                {passwordSet && (
                  <span className="text-emerald-500">(saved)</span>
                )}
              </Label>
              <Input
                id="xiaomi-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={
                  passwordSet
                    ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (leave blank to keep current)"
                    : "Enter router password"
                }
              />
              {passwordRequired && (
                <p className="text-xs text-rose-400">
                  Password is required when integration is enabled.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="xiaomi-poll-interval"
                className="text-xs text-slate-400"
              >
                Poll Interval (seconds)
              </Label>
              <Input
                id="xiaomi-poll-interval"
                type="number"
                min={10}
                max={300}
                value={pollInterval}
                onChange={(e) => setPollInterval(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="30"
              />
              {pollInterval && !intervalValid && (
                <p className="text-xs text-rose-400">
                  Must be between 10 and 300 seconds.
                </p>
              )}
            </div>

            {saveStatus === "success" && saveMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{saveMsg}</p>
              </div>
            )}
            {saveStatus === "error" && saveMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{saveMsg}</p>
              </div>
            )}
            {testStatus === "success" && testMsg && (
              <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                  <p className="text-xs text-emerald-400">{testMsg}</p>
                </div>
                {testDetails.length > 0 && (
                  <div className="ml-6 space-y-0.5">
                    {testDetails.map((d) => (
                      <p key={d} className="text-xs text-emerald-400/80">
                        {d}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {testStatus === "error" && testMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{testMsg}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!canSave || saveStatus === "loading"}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {saveStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!ip || !ipValid || testStatus === "loading"}
                className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                {testStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="mr-1.5 h-3.5 w-3.5" />
                )}
                Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
