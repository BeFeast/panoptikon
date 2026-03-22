"use client";

import { useEffect, useRef, useState } from "react";
import {
  Router,
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
import {
  testMikrotikConnection,
} from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/settings-section";
import { ValidatedInput } from "@/components/settings/validated-input";
import { SaveButton } from "@/components/settings/save-button";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

// ── MikroTik settings panel ──────────────────────────────

function MikrotikPanel() {
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [savedUser, setSavedUser] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          mikrotik_url: string | null;
          mikrotik_user: string | null;
          mikrotik_password_set: boolean;
          mikrotik_enabled: boolean;
        }) => {
          if (loadToken !== loadTokenRef.current) return;
          setUrl(data.mikrotik_url ?? "");
          setSavedUrl(data.mikrotik_url ?? null);
          setUser(data.mikrotik_user ?? "");
          setSavedUser(data.mikrotik_user ?? null);
          setPasswordSet(data.mikrotik_password_set);
          setEnabled(data.mikrotik_enabled);
          setSavedEnabled(data.mikrotik_enabled);
        }
      )
      .catch(() => {});
  }, []);

  const dirty =
    url !== (savedUrl ?? "") ||
    user !== (savedUser ?? "") ||
    password.length > 0 ||
    enabled !== savedEnabled;

  const urlValid = url === "" ? "idle" : /^https?:\/\/.+/.test(url) ? "valid" : "invalid";
  const userValid = user === "" ? "idle" : "valid";

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, string | boolean> = {};
      if (url !== (savedUrl ?? "")) body.mikrotik_url = url;
      if (user !== (savedUser ?? "")) body.mikrotik_user = user;
      if (password.length > 0) body.mikrotik_password = password;
      if (enabled !== savedEnabled) body.mikrotik_enabled = enabled;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: {
          mikrotik_url: string | null;
          mikrotik_user: string | null;
          mikrotik_password_set: boolean;
          mikrotik_enabled: boolean;
        } = await res.json();
        setSavedUrl(data.mikrotik_url ?? null);
        setUrl(data.mikrotik_url ?? "");
        setSavedUser(data.mikrotik_user ?? null);
        setUser(data.mikrotik_user ?? "");
        setPasswordSet(data.mikrotik_password_set);
        setEnabled(data.mikrotik_enabled);
        setSavedEnabled(data.mikrotik_enabled);
        setPassword("");
        setSaveStatus("success");
        setSaveMsg("MikroTik settings saved.");
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
    try {
      const data = await testMikrotikConnection(
        url,
        user,
        password.length > 0 ? password : undefined
      );
      if (data.reachable) {
        setTestStatus("success");
        setTestMsg(
          `Connected! ${data.version ? `RouterOS ${data.version}` : ""} ${data.uptime ? `· Uptime: ${data.uptime}` : ""}`
        );
        setTimeout(() => setTestStatus("idle"), 5000);
      } else if (data.configured) {
        setTestStatus("error");
        setTestMsg(
          "Router configured but unreachable. Check URL and credentials."
        );
      } else {
        setTestStatus("error");
        setTestMsg("Router URL is required.");
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Failed to test connection.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="mt-enabled" className="text-xs text-slate-400">
          Enable MikroTik integration
        </Label>
        <Switch
          id="mt-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <ValidatedInput
        inputId="mt-url"
        label="Router URL"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://10.10.0.125"
        validationState={urlValid as "idle" | "valid" | "invalid"}
        error="Enter a valid URL (http:// or https://)"
      />

      <ValidatedInput
        inputId="mt-user"
        label="Username"
        type="text"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        placeholder="admin"
        validationState={userValid as "idle" | "valid" | "invalid"}
      />

      <div className="space-y-1.5">
        <Label htmlFor="mt-password" className="text-xs text-slate-400">
          Password{" "}
          {passwordSet && <span className="text-emerald-500">(saved)</span>}
        </Label>
        <Input
          id="mt-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
          placeholder={
            passwordSet
              ? "••••••••  (leave blank to keep current)"
              : "Enter password"
          }
        />
      </div>

      <StatusMessages
        saveStatus={saveStatus}
        saveMsg={saveMsg}
        testStatus={testStatus}
        testMsg={testMsg}
      />

      <div className="flex gap-2">
        <SaveButton
          status={saveStatus}
          disabled={!dirty}
          onClick={handleSave}
          className="bg-pink-600 text-white hover:bg-pink-500 disabled:opacity-40"
        />
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!url || testStatus === "loading"}
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
    </div>
  );
}

// ── Shared status messages ───────────────────────────────

function StatusMessages({
  saveStatus,
  saveMsg,
  testStatus,
  testMsg,
}: {
  saveStatus: Status;
  saveMsg: string;
  testStatus: Status;
  testMsg: string;
}) {
  return (
    <>
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
    </>
  );
}

// ── Main page ────────────────────────────────────────────

export default function RouterSettingsPage() {
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
          <h1 className="text-2xl font-semibold text-white">
            Router Settings
          </h1>
        </div>

        <SettingsSection
          icon={<Router className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Router Connection"
          description="Configure MikroTik router integration."
        >
          <MikrotikPanel />
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
