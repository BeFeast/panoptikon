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
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function EmailSettingsPage() {
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpToEmail, setSmtpToEmail] = useState("");
  const [smtpTlsEnabled, setSmtpTlsEnabled] = useState(true);

  const [savedHost, setSavedHost] = useState<string | null>(null);
  const [savedPasswordSet, setSavedPasswordSet] = useState(false);

  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (loadToken !== loadTokenRef.current) return;
        setSmtpHost(data.smtp_host ?? "");
        setSmtpPort(String(data.smtp_port ?? 587));
        setSmtpUsername(data.smtp_username ?? "");
        setSmtpFromEmail(data.smtp_from_email ?? "");
        setSmtpToEmail(data.smtp_to_email ?? "");
        setSmtpTlsEnabled(data.smtp_tls_enabled ?? true);
        setSavedHost(data.smtp_host ?? null);
        setSavedPasswordSet(data.smtp_password_set ?? false);
      })
      .catch(() => {});
  }, []);

  const dirty =
    smtpHost !== (savedHost ?? "") ||
    smtpPassword.length > 0 ||
    true; // Always allow save to update all fields

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, unknown> = {
        smtp_host: smtpHost,
        smtp_port: parseInt(smtpPort) || 587,
        smtp_username: smtpUsername,
        smtp_from_email: smtpFromEmail,
        smtp_to_email: smtpToEmail,
        smtp_tls_enabled: smtpTlsEnabled,
      };
      if (smtpPassword) {
        body.smtp_password = smtpPassword;
      }
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedHost(data.smtp_host ?? null);
        setSavedPasswordSet(data.smtp_password_set ?? false);
        setSmtpPassword("");
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
      const res = await fetch("/api/v1/settings/test-email", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 204) {
        setTestStatus("success");
        setTestMsg("Test email sent!");
        setTimeout(() => setTestStatus("idle"), 3000);
      } else if (res.status === 400) {
        setTestStatus("error");
        const text = await res.text();
        setTestMsg(text || "SMTP not configured. Save settings first.");
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-900/45 text-slate-400 transition-colors hover:bg-cyan-950/35 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Email Notifications</h1>
        </div>

        <SettingsSection
          icon={<Mail className="h-4 w-4 text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          title="SMTP Configuration"
          description="Configure SMTP to receive email alerts alongside webhook notifications."
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-host" className="text-xs text-slate-400">
                SMTP Host
              </Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port" className="text-xs text-slate-400">
                Port
              </Label>
              <Input
                id="smtp-port"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder="587"
              />
            </div>
            <div className="flex items-end space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={smtpTlsEnabled}
                  onChange={(e) => setSmtpTlsEnabled(e.target.checked)}
                  className="rounded border-cyan-900/45"
                />
                TLS / STARTTLS
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-username" className="text-xs text-slate-400">
                Username
              </Label>
              <Input
                id="smtp-username"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder="user@gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-password" className="text-xs text-slate-400">
                Password {savedPasswordSet && "(set)"}
              </Label>
              <Input
                id="smtp-password"
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder={savedPasswordSet ? "Leave blank to keep" : "App password"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from" className="text-xs text-slate-400">
                From Email
              </Label>
              <Input
                id="smtp-from"
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder="panoptikon@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-to" className="text-xs text-slate-400">
                To Email
              </Label>
              <Input
                id="smtp-to"
                type="email"
                value={smtpToEmail}
                onChange={(e) => setSmtpToEmail(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
                placeholder="admin@example.com"
              />
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
            <SaveButton
              status={saveStatus}
              disabled={false}
              onClick={handleSave}
            />
            <Button
              variant="outline"
              onClick={handleTestEmail}
              disabled={!savedHost || testStatus === "loading"}
              className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35 disabled:opacity-40"
            >
              {testStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Email
            </Button>
          </div>
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
