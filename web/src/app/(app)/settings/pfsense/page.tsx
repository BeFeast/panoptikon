"use client";

import { useEffect, useRef, useState } from "react";
import {
  Shield,
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
import { testPfsenseConnection } from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

// ── pfSense settings panel ──────────────────────────────

function PfsensePanel() {
  const [host, setHost] = useState("");
  const [savedHost, setSavedHost] = useState<string | null>(null);
  const [port, setPort] = useState(22);
  const [savedPort, setSavedPort] = useState(22);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [savedAuthType, setSavedAuthType] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [savedPrivateKey, setSavedPrivateKey] = useState<string | null>(null);
  const [privateKeySet, setPrivateKeySet] = useState(false);
  const [enabled, setEnabled] = useState(false);
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
          pfsense_host: string | null;
          pfsense_port: number | null;
          pfsense_username: string | null;
          pfsense_auth_type: string | null;
          pfsense_password_set: boolean;
          pfsense_private_key_set: boolean;
          pfsense_enabled: boolean;
        }) => {
          if (loadToken !== loadTokenRef.current) return;
          setHost(data.pfsense_host ?? "");
          setSavedHost(data.pfsense_host ?? null);
          setPort(data.pfsense_port ?? 22);
          setSavedPort(data.pfsense_port ?? 22);
          setUsername(data.pfsense_username ?? "");
          setSavedUsername(data.pfsense_username ?? null);
          const at = (data.pfsense_auth_type === "key" ? "key" : "password") as "password" | "key";
          setAuthType(at);
          setSavedAuthType(at);
          setPasswordSet(data.pfsense_password_set);
          setPrivateKeySet(data.pfsense_private_key_set);
          setEnabled(data.pfsense_enabled);
          setSavedEnabled(data.pfsense_enabled);
        }
      )
      .catch(() => {});
  }, []);

  const dirty =
    host !== (savedHost ?? "") ||
    port !== savedPort ||
    username !== (savedUsername ?? "") ||
    authType !== savedAuthType ||
    password.length > 0 ||
    (authType === "key" && privateKey !== (savedPrivateKey ?? "")) ||
    enabled !== savedEnabled;

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, string | number | boolean> = {};
      if (host !== (savedHost ?? "")) body.pfsense_host = host;
      if (port !== savedPort) body.pfsense_port = port;
      if (username !== (savedUsername ?? "")) body.pfsense_username = username;
      if (authType !== savedAuthType) body.pfsense_auth_type = authType;
      if (password.length > 0) body.pfsense_password = password;
      if (authType === "key" && privateKey !== (savedPrivateKey ?? ""))
        body.pfsense_private_key = privateKey;
      if (enabled !== savedEnabled) body.pfsense_enabled = enabled;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: {
          pfsense_host: string | null;
          pfsense_port: number | null;
          pfsense_username: string | null;
          pfsense_auth_type: string | null;
          pfsense_password_set: boolean;
          pfsense_private_key_set: boolean;
          pfsense_enabled: boolean;
        } = await res.json();
        setSavedHost(data.pfsense_host ?? null);
        setHost(data.pfsense_host ?? "");
        setSavedPort(data.pfsense_port ?? 22);
        setPort(data.pfsense_port ?? 22);
        setSavedUsername(data.pfsense_username ?? null);
        setUsername(data.pfsense_username ?? "");
        const at = (data.pfsense_auth_type === "key" ? "key" : "password") as "password" | "key";
        setSavedAuthType(at);
        setAuthType(at);
        setPasswordSet(data.pfsense_password_set);
        setPrivateKeySet(data.pfsense_private_key_set);
        setEnabled(data.pfsense_enabled);
        setSavedEnabled(data.pfsense_enabled);
        setPassword("");
        setPrivateKey("");
        setSavedPrivateKey(null);
        setSaveStatus("success");
        setSaveMsg("pfSense settings saved.");
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
      const data = await testPfsenseConnection(
        host || undefined,
        port,
        username || undefined,
        authType,
        password.length > 0 ? password : undefined,
        authType === "key" && privateKey.length > 0 ? privateKey : undefined,
      );
      if (data.reachable) {
        setTestStatus("success");
        setTestMsg(
          `Connected! ${data.hostname ? data.hostname : ""}${data.version ? ` · pfSense ${data.version}` : ""}`
        );
        if (!enabled) {
          setEnabled(true);
        }
        setTimeout(() => setTestStatus("idle"), 5000);
      } else if (data.configured) {
        setTestStatus("error");
        setTestMsg(
          "pfSense configured but unreachable. Check host, port, and credentials."
        );
      } else {
        setTestStatus("error");
        setTestMsg("pfSense host is required.");
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Failed to test connection.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="pf-enabled" className="text-xs text-mesh-text-dim">
          Enable pfSense integration
        </Label>
        <Switch
          id="pf-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-host" className="text-xs text-mesh-text-dim">
          Host
        </Label>
        <Input
          id="pf-host"
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
          placeholder="10.10.0.1"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-port" className="text-xs text-mesh-text-dim">
          Port
        </Label>
        <Input
          id="pf-port"
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value) || 22)}
          className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
          placeholder="22"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-username" className="text-xs text-mesh-text-dim">
          Username
        </Label>
        <Input
          id="pf-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
          placeholder="root"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-mesh-text-dim">Authentication</Label>
        <div className="flex gap-1 rounded-md border border-mesh-border bg-mesh-surface-1 p-1">
          <button
            type="button"
            onClick={() => setAuthType("password")}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              authType === "password"
                ? "bg-mesh-primary text-white"
                : "text-mesh-text-dim hover:text-white"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setAuthType("key")}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              authType === "key"
                ? "bg-mesh-primary text-white"
                : "text-mesh-text-dim hover:text-white"
            }`}
          >
            SSH Key
          </button>
        </div>
      </div>

      {authType === "password" ? (
        <div className="space-y-1.5">
          <Label htmlFor="pf-password" className="text-xs text-mesh-text-dim">
            Password{" "}
            {passwordSet && <span className="text-[#4ade80]">(saved)</span>}
          </Label>
          <Input
            id="pf-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
            placeholder={
              passwordSet
                ? "••••••••  (leave blank to keep current)"
                : "Enter password"
            }
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="pf-key" className="text-xs text-mesh-text-dim">
            Private key path{" "}
            {privateKeySet && <span className="text-[#4ade80]">(saved)</span>}
          </Label>
          <Input
            id="pf-key"
            type="text"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
            placeholder={
              privateKeySet
                ? "(leave blank to keep current)"
                : "/root/.ssh/id_rsa"
            }
          />
        </div>
      )}

      <StatusMessages
        saveStatus={saveStatus}
        saveMsg={saveMsg}
        testStatus={testStatus}
        testMsg={testMsg}
      />

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || saveStatus === "loading"}
          className="bg-mesh-primary text-white hover:bg-mesh-primary disabled:opacity-40"
        >
          {saveStatus === "loading" && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Save
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!host || testStatus === "loading"}
          className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 disabled:opacity-40"
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
      {testStatus === "success" && testMsg && (
        <div className="flex items-center gap-2 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2">
          <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
          <p className="text-xs text-[#4ade80]">{testMsg}</p>
        </div>
      )}
      {testStatus === "error" && testMsg && (
        <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
          <p className="text-xs text-[#fb7185]">{testMsg}</p>
        </div>
      )}
    </>
  );
}

// ── Main page ────────────────────────────────────────────

export default function PfsenseSettingsPage() {
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
          <h1 className="text-2xl font-semibold text-white">
            pfSense Settings
          </h1>
        </div>

        <Card className="border-mesh-border bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mesh-primary/10">
                <Shield className="h-4 w-4 text-mesh-primary" />
              </div>
              <div>
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                  pfSense Connection
                </CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Configure pfSense router integration via SSH.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <PfsensePanel />
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
