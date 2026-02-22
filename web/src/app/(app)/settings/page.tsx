"use client";

import { useEffect, useRef, useState } from "react";
import {
  Lock,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Bell,
  Send,
  Loader2,
  Router,
  Plug,
  Radar,
  Database,
  Trash2,
  FileText,
  ChevronRight,
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
import { fetchRouterStatus } from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";

type Status = "idle" | "loading" | "success" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPage() {
  // --- Password change state ---
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>("idle");
  const [pwError, setPwError] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  // --- Webhook state ---
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedWebhookUrl, setSavedWebhookUrl] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<Status>("idle");
  const [webhookMsg, setWebhookMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");

  // --- VyOS state ---
  const [vyosUrl, setVyosUrl] = useState("");
  const [savedVyosUrl, setSavedVyosUrl] = useState<string | null>(null);
  const [vyosApiKey, setVyosApiKey] = useState("");
  const [vyosApiKeySet, setVyosApiKeySet] = useState(false);
  const [vyosStatus, setVyosStatus] = useState<Status>("idle");
  const [vyosMsg, setVyosMsg] = useState("");
  const [vyosTestStatus, setVyosTestStatus] = useState<Status>("idle");
  const [vyosTestMsg, setVyosTestMsg] = useState("");

  // --- Network Scanner state ---
  const [scanInterval, setScanInterval] = useState("60");
  const [savedScanInterval, setSavedScanInterval] = useState("60");
  const [scanSubnets, setScanSubnets] = useState("");
  const [savedScanSubnets, setSavedScanSubnets] = useState("");
  const [pingSweepEnabled, setPingSweepEnabled] = useState(true);
  const [savedPingSweepEnabled, setSavedPingSweepEnabled] = useState(true);
  const [scannerStatus, setScannerStatus] = useState<Status>("idle");
  const [scannerMsg, setScannerMsg] = useState("");

  // --- Data Retention state ---
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

  // Guards against race: initial GET /settings resolving after user saves.
  const settingsLoadTokenRef = useRef(0);

  // Load current settings on mount
  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;

    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          webhook_url: string | null;
          vyos_url: string | null;
          vyos_api_key_set: boolean;
          scan_interval_seconds: number | null;
          scan_subnets: string | null;
          ping_sweep_enabled: boolean | null;
          retention_traffic_hours: number | null;
          retention_alerts_days: number | null;
          retention_agent_reports_days: number | null;
        }) => {
          // Ignore stale response if a newer local action (e.g. Save) already happened.
          if (loadToken !== settingsLoadTokenRef.current) return;

          setWebhookUrl(data.webhook_url ?? "");
          setSavedWebhookUrl(data.webhook_url ?? null);
          setVyosUrl(data.vyos_url ?? "");
          setSavedVyosUrl(data.vyos_url ?? null);
          setVyosApiKeySet(data.vyos_api_key_set);

          // Network Scanner
          const interval = String(data.scan_interval_seconds ?? 60);
          setScanInterval(interval);
          setSavedScanInterval(interval);
          const subnets = data.scan_subnets ?? "";
          setScanSubnets(subnets);
          setSavedScanSubnets(subnets);
          const ping = data.ping_sweep_enabled ?? true;
          setPingSweepEnabled(ping);
          setSavedPingSweepEnabled(ping);

          // Data Retention
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

    // Load DB size
    fetch("/api/v1/settings/db-size", { credentials: "include" })
      .then((res) => res.json())
      .then((data: { size_bytes: number }) => {
        setDbSizeBytes(data.size_bytes);
      })
      .catch(() => {});
  }, []);

  const validationError = (() => {
    if (next && next.length < 8)
      return "New password must be at least 8 characters.";
    if (confirm && next !== confirm) return "Passwords do not match.";
    return "";
  })();

  const canSubmitPw =
    current.length > 0 &&
    next.length >= 8 &&
    next === confirm &&
    pwStatus !== "loading";

  const webhookDirty = webhookUrl !== (savedWebhookUrl ?? "");
  const vyosDirty =
    vyosUrl !== (savedVyosUrl ?? "") || vyosApiKey.length > 0;
  const scannerDirty =
    scanInterval !== savedScanInterval ||
    scanSubnets !== savedScanSubnets ||
    pingSweepEnabled !== savedPingSweepEnabled;
  const retentionDirty =
    retTrafficHours !== savedRetTrafficHours ||
    retAlertsDays !== savedRetAlertsDays ||
    retAgentDays !== savedRetAgentDays;

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitPw) return;

    setPwStatus("loading");
    setPwError("");

    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
        credentials: "include",
      });

      if (res.status === 204) {
        setPwStatus("success");
        setCurrent("");
        setNext("");
        setConfirm("");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else if (res.status === 401) {
        setPwStatus("error");
        setPwError("Current password is incorrect.");
      } else if (res.status === 422) {
        setPwStatus("error");
        setPwError("New password must be at least 8 characters.");
      } else {
        setPwStatus("error");
        setPwError(`Unexpected error (${res.status}). Try again.`);
      }
    } catch {
      setPwStatus("error");
      setPwError("Network error. Is the server reachable?");
    }
  }

  async function handleWebhookSave() {
    // Invalidate any in-flight initial settings load.
    settingsLoadTokenRef.current++;

    setWebhookStatus("loading");
    setWebhookMsg("");
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl }),
        credentials: "include",
      });
      if (res.ok) {
        const data: {
          webhook_url: string | null;
          vyos_url: string | null;
          vyos_api_key_set: boolean;
        } = await res.json();
        setSavedWebhookUrl(data.webhook_url ?? null);
        setWebhookUrl(data.webhook_url ?? "");
        setWebhookStatus("success");
        setWebhookMsg("Webhook URL saved.");
        setTimeout(() => setWebhookStatus("idle"), 3000);
      } else {
        setWebhookStatus("error");
        setWebhookMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setWebhookStatus("error");
      setWebhookMsg("Network error.");
    }
  }

  async function handleWebhookTest() {
    setTestStatus("loading");
    setTestMsg("");
    try {
      const res = await fetch("/api/v1/settings/test-webhook", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 204) {
        setTestStatus("success");
        setTestMsg("Test webhook sent!");
        setTimeout(() => setTestStatus("idle"), 3000);
      } else if (res.status === 400) {
        setTestStatus("error");
        setTestMsg("No webhook URL configured. Save one first.");
      } else {
        setTestStatus("error");
        setTestMsg(`Failed (${res.status}).`);
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Network error.");
    }
  }

  async function handleVyosSave() {
    // Invalidate any in-flight initial settings load.
    settingsLoadTokenRef.current++;

    setVyosStatus("loading");
    setVyosMsg("");
    try {
      const body: Record<string, string> = {};
      if (vyosUrl !== (savedVyosUrl ?? "")) body.vyos_url = vyosUrl;
      if (vyosApiKey.length > 0) body.vyos_api_key = vyosApiKey;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: {
          webhook_url: string | null;
          vyos_url: string | null;
          vyos_api_key_set: boolean;
        } = await res.json();
        setSavedVyosUrl(data.vyos_url ?? null);
        setVyosUrl(data.vyos_url ?? "");
        setVyosApiKeySet(data.vyos_api_key_set);
        setVyosApiKey("");
        setVyosStatus("success");
        setVyosMsg("VyOS settings saved.");
        setTimeout(() => setVyosStatus("idle"), 3000);
      } else {
        setVyosStatus("error");
        setVyosMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setVyosStatus("error");
      setVyosMsg("Network error.");
    }
  }

  async function handleVyosTest() {
    setVyosTestStatus("loading");
    setVyosTestMsg("");
    try {
      const data = await fetchRouterStatus();
      if (data.reachable) {
        setVyosTestStatus("success");
        setVyosTestMsg(
          `Connected! ${data.version ? `Version: ${data.version}` : ""} ${data.uptime ? `· Uptime: ${data.uptime}` : ""}`
        );
        setTimeout(() => setVyosTestStatus("idle"), 5000);
      } else if (data.configured) {
        setVyosTestStatus("error");
        setVyosTestMsg("Router configured but unreachable. Check URL and network.");
      } else {
        setVyosTestStatus("error");
        setVyosTestMsg("Router not configured. Save URL and API key first.");
      }
    } catch {
      setVyosTestStatus("error");
      setVyosTestMsg("Failed to test connection.");
    }
  }

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
        // Refresh DB size.
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
      <h1 className="text-2xl font-semibold text-white">Settings</h1>

      {/* Audit Log link */}
      <a href="/settings/audit-log">
        <Card className="border-slate-800 bg-slate-900 transition-colors hover:border-slate-700">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
              <FileText className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Audit Log</p>
              <p className="text-xs text-slate-500">
                View all VyOS configuration changes made via Panoptikon.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </CardContent>
        </Card>
      </a>

      {/* VyOS Router Connection */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Router className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                VyOS Router
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Connect to your VyOS router via its HTTP API.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vyos-url" className="text-xs text-slate-400">
              Router URL
            </Label>
            <Input
              id="vyos-url"
              type="url"
              value={vyosUrl}
              onChange={(e) => setVyosUrl(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="https://10.10.0.50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vyos-key" className="text-xs text-slate-400">
              API Key{" "}
              {vyosApiKeySet && (
                <span className="text-emerald-500">(saved)</span>
              )}
            </Label>
            <Input
              id="vyos-key"
              type="password"
              value={vyosApiKey}
              onChange={(e) => setVyosApiKey(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder={
                vyosApiKeySet
                  ? "••••••••  (leave blank to keep current)"
                  : "Enter VyOS API key"
              }
            />
          </div>

          {/* Status messages */}
          {vyosStatus === "success" && vyosMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{vyosMsg}</p>
            </div>
          )}
          {vyosStatus === "error" && vyosMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{vyosMsg}</p>
            </div>
          )}
          {vyosTestStatus === "success" && vyosTestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{vyosTestMsg}</p>
            </div>
          )}
          {vyosTestStatus === "error" && vyosTestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{vyosTestMsg}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleVyosSave}
              disabled={!vyosDirty || vyosStatus === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {vyosStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={handleVyosTest}
              disabled={
                (!savedVyosUrl && !vyosUrl) || vyosTestStatus === "loading"
              }
              className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              {vyosTestStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Network Scanner */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
              <Radar className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Network Scanner
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

          {/* Status messages */}
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

      {/* Webhook Notifications */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Bell className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Webhook Notifications
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                POST alert payloads to Discord, Slack, ntfy.sh, or any URL.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url" className="text-xs text-slate-400">
              Webhook URL
            </Label>
            <Input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="https://ntfy.sh/my-topic or Discord webhook URL"
            />
          </div>

          {/* Status messages */}
          {webhookStatus === "success" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{webhookMsg}</p>
            </div>
          )}
          {webhookStatus === "error" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{webhookMsg}</p>
            </div>
          )}
          {testStatus === "success" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{testMsg}</p>
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
              onClick={handleWebhookSave}
              disabled={!webhookDirty || webhookStatus === "loading"}
              className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {webhookStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={handleWebhookTest}
              disabled={!savedWebhookUrl || testStatus === "loading"}
              className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              {testStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Database className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Data Retention
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configure how long data is kept and manage database size.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* DB size display */}
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

          {/* Status messages */}
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

      {/* Change Password */}
      <Card id="password" className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Lock className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Change Password
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                After changing, you&apos;ll be redirected to login again.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pwStatus === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
              <p className="text-sm text-emerald-400">
                Password changed! Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label htmlFor="current" className="text-xs text-slate-400">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="border-slate-800 bg-slate-950 pr-10 text-white placeholder:text-slate-600"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showCurrent ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="new" className="text-xs text-slate-400">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="border-slate-800 bg-slate-950 pr-10 text-white placeholder:text-slate-600"
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showNext ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {next.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-0.5 flex-1 rounded-full transition-colors ${
                          next.length >= i * 4
                            ? next.length < 8
                              ? "bg-rose-500"
                              : next.length < 12
                                ? "bg-yellow-500"
                                : "bg-emerald-500"
                            : "bg-slate-800"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs text-slate-400">
                  Confirm new password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {(validationError || (pwStatus === "error" && pwError)) && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <p className="text-xs text-rose-400">
                    {pwStatus === "error" && pwError ? pwError : validationError}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={!canSubmitPw}
                className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {pwStatus === "loading" ? "Changing…" : "Change Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  );
}
