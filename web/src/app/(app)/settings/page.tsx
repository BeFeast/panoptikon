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

type Status = "idle" | "loading" | "success" | "error";

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
        }) => {
          // Ignore stale response if a newer local action (e.g. Save) already happened.
          if (loadToken !== settingsLoadTokenRef.current) return;

          setWebhookUrl(data.webhook_url ?? "");
          setSavedWebhookUrl(data.webhook_url ?? null);
          setVyosUrl(data.vyos_url ?? "");
          setSavedVyosUrl(data.vyos_url ?? null);
          setVyosApiKeySet(data.vyos_api_key_set);
        }
      )
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

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>

      {/* VyOS Router Connection */}
      <Card className="border-[#2a2a3a] bg-[#16161f]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Router className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                VyOS Router
              </CardTitle>
              <CardDescription className="text-xs text-gray-500">
                Connect to your VyOS router via its HTTP API.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vyos-url" className="text-xs text-gray-400">
              Router URL
            </Label>
            <Input
              id="vyos-url"
              type="url"
              value={vyosUrl}
              onChange={(e) => setVyosUrl(e.target.value)}
              className="border-[#2a2a3a] bg-[#0e0e16] text-white placeholder:text-gray-600"
              placeholder="https://10.10.0.50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vyos-key" className="text-xs text-gray-400">
              API Key{" "}
              {vyosApiKeySet && (
                <span className="text-green-500">(saved)</span>
              )}
            </Label>
            <Input
              id="vyos-key"
              type="password"
              value={vyosApiKey}
              onChange={(e) => setVyosApiKey(e.target.value)}
              className="border-[#2a2a3a] bg-[#0e0e16] text-white placeholder:text-gray-600"
              placeholder={
                vyosApiKeySet
                  ? "••••••••  (leave blank to keep current)"
                  : "Enter VyOS API key"
              }
            />
          </div>

          {/* Status messages */}
          {vyosStatus === "success" && vyosMsg && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
              <p className="text-xs text-green-400">{vyosMsg}</p>
            </div>
          )}
          {vyosStatus === "error" && vyosMsg && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{vyosMsg}</p>
            </div>
          )}
          {vyosTestStatus === "success" && vyosTestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
              <p className="text-xs text-green-400">{vyosTestMsg}</p>
            </div>
          )}
          {vyosTestStatus === "error" && vyosTestMsg && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{vyosTestMsg}</p>
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
              className="border-[#2a2a3a] text-gray-300 hover:bg-[#1e1e2e] disabled:opacity-40"
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

      {/* Webhook Notifications */}
      <Card className="border-[#2a2a3a] bg-[#16161f]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Bell className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Webhook Notifications
              </CardTitle>
              <CardDescription className="text-xs text-gray-500">
                POST alert payloads to Discord, Slack, ntfy.sh, or any URL.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url" className="text-xs text-gray-400">
              Webhook URL
            </Label>
            <Input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="border-[#2a2a3a] bg-[#0e0e16] text-white placeholder:text-gray-600"
              placeholder="https://ntfy.sh/my-topic or Discord webhook URL"
            />
          </div>

          {/* Status messages */}
          {webhookStatus === "success" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
              <p className="text-xs text-green-400">{webhookMsg}</p>
            </div>
          )}
          {webhookStatus === "error" && webhookMsg && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{webhookMsg}</p>
            </div>
          )}
          {testStatus === "success" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
              <p className="text-xs text-green-400">{testMsg}</p>
            </div>
          )}
          {testStatus === "error" && testMsg && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{testMsg}</p>
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
              className="border-[#2a2a3a] text-gray-300 hover:bg-[#1e1e2e] disabled:opacity-40"
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

      {/* Change Password */}
      <Card className="border-[#2a2a3a] bg-[#16161f]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Lock className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Change Password
              </CardTitle>
              <CardDescription className="text-xs text-gray-500">
                After changing, you&apos;ll be redirected to login again.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pwStatus === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-400" />
              <p className="text-sm text-green-400">
                Password changed! Redirecting to login…
              </p>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label htmlFor="current" className="text-xs text-gray-400">
                  Current password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={showCurrent ? "text" : "password"}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="border-[#2a2a3a] bg-[#0e0e16] pr-10 text-white placeholder:text-gray-600"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
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
                <Label htmlFor="new" className="text-xs text-gray-400">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={showNext ? "text" : "password"}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="border-[#2a2a3a] bg-[#0e0e16] pr-10 text-white placeholder:text-gray-600"
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
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
                              ? "bg-red-500"
                              : next.length < 12
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            : "bg-[#2a2a3a]"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs text-gray-400">
                  Confirm new password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="border-[#2a2a3a] bg-[#0e0e16] text-white placeholder:text-gray-600"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {(validationError || (pwStatus === "error" && pwError)) && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-xs text-red-400">
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
  );
}
