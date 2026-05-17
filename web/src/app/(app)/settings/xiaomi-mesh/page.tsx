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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { testXiaomiMeshConnection } from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
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
  const [proxyHost, setProxyHost] = useState("");
  const [savedProxyHost, setSavedProxyHost] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [testDetails, setTestDetails] = useState<{
    router_model?: string | null;
    hardware?: string | null;
    firmware?: string | null;
    router_name?: string | null;
  } | null>(null);

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          xiaomi_mesh_enabled: boolean;
          xiaomi_mesh_ip: string | null;
          xiaomi_mesh_password_set: boolean;
          xiaomi_mesh_poll_interval: number | null;
          xiaomi_mesh_proxy_host: string | null;
        }) => {
          if (loadToken !== loadTokenRef.current) return;
          setEnabled(data.xiaomi_mesh_enabled);
          setSavedEnabled(data.xiaomi_mesh_enabled);
          if (data.xiaomi_mesh_ip) {
            setIp(data.xiaomi_mesh_ip);
            setSavedIp(data.xiaomi_mesh_ip);
          }
          setPasswordSet(data.xiaomi_mesh_password_set);
          if (data.xiaomi_mesh_poll_interval !== null) {
            setPollInterval(String(data.xiaomi_mesh_poll_interval));
            setSavedPollInterval(String(data.xiaomi_mesh_poll_interval));
          }
          if (data.xiaomi_mesh_proxy_host) {
            setProxyHost(data.xiaomi_mesh_proxy_host);
            setSavedProxyHost(data.xiaomi_mesh_proxy_host);
          }
        }
      )
      .catch(() => {});
  }, []);

  const dirty =
    enabled !== savedEnabled ||
    ip !== (savedIp ?? "10.10.0.199") ||
    password.length > 0 ||
    pollInterval !== (savedPollInterval ?? "30") ||
    proxyHost !== (savedProxyHost ?? "");

  // Validate IPv4
  function isValidIpv4(value: string): boolean {
    const parts = value.split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = Number(p);
      return /^\d{1,3}$/.test(p) && n >= 0 && n <= 255;
    });
  }

  const ipValid = isValidIpv4(ip);
  const intervalNum = Number(pollInterval);
  const intervalValid =
    !isNaN(intervalNum) && intervalNum >= 10 && intervalNum <= 300;
  const passwordRequired = enabled && !passwordSet && password.length === 0;
  const canSave = dirty && ipValid && intervalValid && !passwordRequired;

  // Inline validation states
  const ipValidation = ip.length === 0 ? "idle" : ipValid ? "valid" : "error";
  const intervalValidation =
    pollInterval.length === 0 ? "idle" : intervalValid ? "valid" : "error";

  async function handleSave() {
    // Validate
    if (!ipValid) {
      setSaveStatus("error");
      setSaveMsg("Invalid IPv4 address.");
      return;
    }
    if (passwordRequired) {
      setSaveStatus("error");
      setSaveMsg("Password is required when integration is enabled.");
      return;
    }
    if (!intervalValid) {
      setSaveStatus("error");
      setSaveMsg("Poll interval must be between 10 and 300 seconds.");
      return;
    }

    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, string | boolean | number> = {};
      if (enabled !== savedEnabled) body.xiaomi_mesh_enabled = enabled;
      if (ip !== savedIp) body.xiaomi_mesh_ip = ip;
      if (password.length > 0) body.xiaomi_mesh_password = password;
      if (pollInterval !== (savedPollInterval ?? "30"))
        body.xiaomi_mesh_poll_interval = intervalNum;
      if (proxyHost !== (savedProxyHost ?? ""))
        body.xiaomi_mesh_proxy_host = proxyHost;

      // Always send all changed fields
      if (Object.keys(body).length === 0 && dirty) {
        body.xiaomi_mesh_enabled = enabled;
        body.xiaomi_mesh_ip = ip;
        body.xiaomi_mesh_poll_interval = intervalNum;
        body.xiaomi_mesh_proxy_host = proxyHost;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedEnabled(data.xiaomi_mesh_enabled);
        setEnabled(data.xiaomi_mesh_enabled);
        if (data.xiaomi_mesh_ip) {
          setSavedIp(data.xiaomi_mesh_ip);
          setIp(data.xiaomi_mesh_ip);
        }
        setPasswordSet(data.xiaomi_mesh_password_set);
        setPassword("");
        if (data.xiaomi_mesh_poll_interval !== null) {
          setSavedPollInterval(String(data.xiaomi_mesh_poll_interval));
          setPollInterval(String(data.xiaomi_mesh_poll_interval));
        }
        setSavedProxyHost(data.xiaomi_mesh_proxy_host ?? "");
        setProxyHost(data.xiaomi_mesh_proxy_host ?? "");
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
    setTestDetails(null);
    try {
      const data = await testXiaomiMeshConnection(ip);
      if (data.success) {
        setTestStatus("success");
        setTestMsg(data.message);
        setTestDetails({
          router_model: data.router_model,
          hardware: data.hardware,
          firmware: data.firmware,
          router_name: data.router_name,
        });
        setTimeout(() => setTestStatus("idle"), 10000);
      } else {
        setTestStatus("error");
        setTestMsg(data.message);
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border-strong text-slate-400 transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Xiaomi Mesh</h1>
        </div>

        <SettingsSection
          icon={<Wifi className="h-4 w-4 text-orange-400" />}
          iconBg="bg-orange-500/10"
          title="Xiaomi Mesh Connection"
          description="Connect to your Xiaomi mesh router to fetch WiFi clients, mesh topology, and device info."
          headerRight={
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
          }
        >
          {/* Router IP */}
          <div className="space-y-1.5">
            <Label htmlFor="xiaomi-ip" className="text-xs text-slate-400">
              Router IP{" "}
              {savedIp && (
                <span className="text-emerald-500">(saved)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="xiaomi-ip"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                autoComplete="one-time-code"
                className={`border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  ipValidation === "valid"
                    ? "border-emerald-500/40"
                    : ipValidation === "error"
                      ? "border-rose-500/40"
                      : ""
                }`}
                placeholder="10.10.0.199"
              />
              {ipValidation === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </div>
            {ip && !ipValid && (
              <p className="animate-fade-in text-xs text-rose-400">
                Enter a valid IPv4 address.
              </p>
            )}
          </div>

          {/* Proxy Host */}
          <div className="space-y-1.5">
            <Label
              htmlFor="xiaomi-proxy-host"
              className="text-xs text-slate-400"
            >
              Proxy Host{" "}
              <span className="text-slate-600">(optional)</span>
              {savedProxyHost && (
                <span className="text-emerald-500"> (saved)</span>
              )}
            </Label>
            <Input
              id="xiaomi-proxy-host"
              type="text"
              value={proxyHost}
              onChange={(e) => setProxyHost(e.target.value)}
              autoComplete="one-time-code"
              className="border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="e.g. 10.10.0.14:9199"
            />
            <p className="text-xs text-slate-600">
              If the router blocks direct access, enter a proxy host (IP:port)
              that forwards TCP to the router. Leave empty for direct
              connection.
            </p>
          </div>

          {/* Password */}
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
              autoComplete="new-password"
              className="border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder={
                passwordSet
                  ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (leave blank to keep current)"
                  : "Enter router password"
              }
            />
            {passwordRequired && (
              <p className="animate-fade-in text-xs text-rose-400">
                Password is required when integration is enabled.
              </p>
            )}
          </div>

          {/* Poll interval */}
          <div className="space-y-1.5">
            <Label
              htmlFor="xiaomi-poll-interval"
              className="text-xs text-slate-400"
            >
              Poll Interval (seconds)
            </Label>
            <div className="relative">
              <Input
                id="xiaomi-poll-interval"
                type="number"
                min={10}
                max={300}
                value={pollInterval}
                onChange={(e) => setPollInterval(e.target.value)}
                className={`border-mesh-border-strong bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute ${
                  intervalValidation === "valid"
                    ? "border-emerald-500/40"
                    : intervalValidation === "error"
                      ? "border-rose-500/40"
                      : ""
                }`}
                placeholder="30"
              />
              {intervalValidation === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </div>
            {pollInterval && !intervalValid && (
              <p className="animate-fade-in text-xs text-rose-400">
                Must be between 10 and 300 seconds.
              </p>
            )}
          </div>

          {/* Save status messages */}
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

          {/* Test connection status */}
          {testStatus === "success" && testMsg && (
            <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{testMsg}</p>
              </div>
              {testDetails && (
                <div className="space-y-0.5 pl-6 text-xs text-emerald-400/80">
                  {testDetails.router_model && (
                    <p>Model: {testDetails.router_model}</p>
                  )}
                  {testDetails.hardware && (
                    <p>Hardware: {testDetails.hardware}</p>
                  )}
                  {testDetails.firmware && (
                    <p>Firmware: {testDetails.firmware}</p>
                  )}
                  {testDetails.router_name && (
                    <p>Name: {testDetails.router_name}</p>
                  )}
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

          {/* Buttons */}
          <div className="flex gap-2">
            <SaveButton
              status={saveStatus}
              disabled={!canSave}
              onClick={handleSave}
            />
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!ip || !ipValid || testStatus === "loading"}
              className="border-mesh-border-strong text-slate-300 hover:bg-mesh-surface-2/55 disabled:opacity-40"
            >
              {testStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </Button>
          </div>
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
