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
            aria-label="Back to settings"
            className="btn btn-ghost btn-sm h-8 w-8 justify-center px-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="t-h1 text-mesh-text">Xiaomi Mesh</h1>
        </div>

        <SettingsSection
          icon={<Wifi className="h-4 w-4 text-[#fbbf24]" />}
          iconBg="bg-[#fbbf24]/10"
          title="Xiaomi Mesh Connection"
          description="Connect to your Xiaomi mesh router to fetch WiFi clients, mesh topology, and device info."
          headerRight={
            <div className="flex items-center gap-2">
              <Label
                htmlFor="xiaomi-enabled"
                className="text-xs text-mesh-text-dim"
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
            <Label htmlFor="xiaomi-ip" className="text-xs text-mesh-text-dim">
              Router IP{" "}
              {savedIp && (
                <span className="text-[#4ade80]">(saved)</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="xiaomi-ip"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                autoComplete="one-time-code"
                className={
                  ipValidation === "valid"
                    ? "border-[#4ade80]/40"
                    : ipValidation === "error"
                      ? "border-[#fb7185]/40"
                      : undefined
                }
                placeholder="10.10.0.199"
              />
              {ipValidation === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {ip && !ipValid && (
              <p className="animate-fade-in text-xs text-[#fb7185]">
                Enter a valid IPv4 address.
              </p>
            )}
          </div>

          {/* Proxy Host */}
          <div className="space-y-1.5">
            <Label
              htmlFor="xiaomi-proxy-host"
              className="text-xs text-mesh-text-dim"
            >
              Proxy Host{" "}
              <span className="text-mesh-text-mute">(optional)</span>
              {savedProxyHost && (
                <span className="text-[#4ade80]"> (saved)</span>
              )}
            </Label>
            <Input
              id="xiaomi-proxy-host"
              type="text"
              value={proxyHost}
              onChange={(e) => setProxyHost(e.target.value)}
              autoComplete="one-time-code"
              placeholder="e.g. 10.10.0.14:9199"
            />
            <p className="text-xs text-mesh-text-mute">
              If the router blocks direct access, enter a proxy host (IP:port)
              that forwards TCP to the router. Leave empty for direct
              connection.
            </p>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label
              htmlFor="xiaomi-password"
              className="text-xs text-mesh-text-dim"
            >
              Password{" "}
              {passwordSet && (
                <span className="text-[#4ade80]">(saved)</span>
              )}
            </Label>
            <Input
              id="xiaomi-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={
                passwordSet
                  ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (leave blank to keep current)"
                  : "Enter router password"
              }
            />
            {passwordRequired && (
              <p className="animate-fade-in text-xs text-[#fb7185]">
                Password is required when integration is enabled.
              </p>
            )}
          </div>

          {/* Poll interval */}
          <div className="space-y-1.5">
            <Label
              htmlFor="xiaomi-poll-interval"
              className="text-xs text-mesh-text-dim"
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
                className={
                  intervalValidation === "valid"
                    ? "border-[#4ade80]/40"
                    : intervalValidation === "error"
                      ? "border-[#fb7185]/40"
                      : undefined
                }
                placeholder="30"
              />
              {intervalValidation === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-[#4ade80]" />
                </div>
              )}
            </div>
            {pollInterval && !intervalValid && (
              <p className="animate-fade-in text-xs text-[#fb7185]">
                Must be between 10 and 300 seconds.
              </p>
            )}
          </div>

          {/* Save status messages */}
          {saveStatus === "success" && saveMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
              <p className="text-xs text-[#4ade80]">{saveMsg}</p>
            </div>
          )}
          {saveStatus === "error" && saveMsg && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{saveMsg}</p>
            </div>
          )}

          {/* Test connection status */}
          {testStatus === "success" && testMsg && (
            <div className="space-y-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
                <p className="text-xs text-[#4ade80]">{testMsg}</p>
              </div>
              {testDetails && (
                <div className="space-y-0.5 pl-6 text-xs text-[#4ade80]/80">
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
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{testMsg}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <SaveButton
              status={saveStatus}
              disabled={!canSave}
              onClick={handleSave}
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={!ip || !ipValid || testStatus === "loading"}
              className="btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              {testStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </button>
          </div>
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
