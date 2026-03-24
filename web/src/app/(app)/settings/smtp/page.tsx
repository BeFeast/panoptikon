"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mail,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

interface SmtpSettings {
  smtp_enabled: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_set: boolean;
  smtp_from_email: string | null;
  smtp_tls: boolean;
}

export default function SmtpSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [tls, setTls] = useState(true);

  const [savedState, setSavedState] = useState<SmtpSettings | null>(null);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data: SmtpSettings) => {
        if (loadToken !== loadTokenRef.current) return;
        setEnabled(data.smtp_enabled);
        setHost(data.smtp_host ?? "");
        setPort(String(data.smtp_port ?? 587));
        setUsername(data.smtp_username ?? "");
        setFromEmail(data.smtp_from_email ?? "");
        setTls(data.smtp_tls);
        setSavedState(data);
      })
      .catch(() => {});
  }, []);

  const dirty =
    savedState !== null &&
    (enabled !== savedState.smtp_enabled ||
      host !== (savedState.smtp_host ?? "") ||
      port !== String(savedState.smtp_port ?? 587) ||
      username !== (savedState.smtp_username ?? "") ||
      fromEmail !== (savedState.smtp_from_email ?? "") ||
      tls !== savedState.smtp_tls ||
      password.length > 0);

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, unknown> = {
        smtp_enabled: enabled,
        smtp_host: host,
        smtp_port: parseInt(port) || 587,
        smtp_username: username,
        smtp_from_email: fromEmail,
        smtp_tls: tls,
      };
      if (password) body.smtp_password = password;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: SmtpSettings = await res.json();
        setSavedState(data);
        setEnabled(data.smtp_enabled);
        setHost(data.smtp_host ?? "");
        setPort(String(data.smtp_port ?? 587));
        setUsername(data.smtp_username ?? "");
        setFromEmail(data.smtp_from_email ?? "");
        setTls(data.smtp_tls);
        setPassword("");
        setSaveStatus("success");
        setSaveMsg("SMTP settings saved.");
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

  async function handleTestEmail() {
    setTestStatus("loading");
    setTestMsg("");
    try {
      const res = await fetch("/api/v1/settings/test-webhook", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 204) {
        setTestStatus("success");
        setTestMsg("Test notification sent!");
        setTimeout(() => setTestStatus("idle"), 3000);
      } else {
        setTestStatus("error");
        setTestMsg(`Failed (${res.status}).`);
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Network error.");
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">Email Notifications</h1>
        </div>

        <SettingsSection
          icon={<Mail className="h-4 w-4 text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          title="SMTP Configuration"
          description="Configure email notifications for alerts via SMTP."
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="smtp-enabled" className="text-xs text-slate-400">Enable Email Notifications</Label>
            <Switch id="smtp-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host" className="text-xs text-slate-400">SMTP Host</Label>
              <Input id="smtp-host" value={host} onChange={(e) => setHost(e.target.value)} className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600" placeholder="smtp.gmail.com" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port" className="text-xs text-slate-400">Port</Label>
                <Input id="smtp-port" type="number" value={port} onChange={(e) => setPort(e.target.value)} className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600" placeholder="587" />
              </div>
              <div className="flex items-end pb-0.5">
                <div className="flex items-center gap-2">
                  <Switch id="smtp-tls" checked={tls} onCheckedChange={setTls} />
                  <Label htmlFor="smtp-tls" className="text-xs text-slate-400">TLS / STARTTLS</Label>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-username" className="text-xs text-slate-400">Username</Label>
              <Input id="smtp-username" value={username} onChange={(e) => setUsername(e.target.value)} className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600" placeholder="user@example.com" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-password" className="text-xs text-slate-400">
                Password {savedState?.smtp_password_set && !password ? "(set)" : ""}
              </Label>
              <Input id="smtp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600" placeholder={savedState?.smtp_password_set ? "Leave empty to keep current" : "SMTP password"} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from" className="text-xs text-slate-400">From Email</Label>
              <Input id="smtp-from" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600" placeholder="alerts@example.com" />
            </div>
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
            <SaveButton status={saveStatus} disabled={!dirty} onClick={handleSave} />
            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={!savedState?.smtp_host || testStatus === "loading"}
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
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
