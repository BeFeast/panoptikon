"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

interface SmtpSettings {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_set: boolean;
  smtp_tls: boolean;
  smtp_from: string | null;
  smtp_to: string | null;
}

export default function SmtpSettingsPage() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tls, setTls] = useState(true);
  const [fromAddr, setFromAddr] = useState("");
  const [toAddr, setToAddr] = useState("");

  const [savedHost, setSavedHost] = useState<string | null>(null);
  const [savedPort, setSavedPort] = useState<string | null>(null);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [savedTls, setSavedTls] = useState<boolean | null>(null);
  const [savedFrom, setSavedFrom] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [passwordSet, setPasswordSet] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data: SmtpSettings) => {
        if (loadToken !== loadTokenRef.current) return;
        setHost(data.smtp_host ?? "");
        setPort(String(data.smtp_port ?? 587));
        setUsername(data.smtp_username ?? "");
        setTls(data.smtp_tls ?? true);
        setFromAddr(data.smtp_from ?? "");
        setToAddr(data.smtp_to ?? "");
        setPasswordSet(data.smtp_password_set ?? false);

        setSavedHost(data.smtp_host ?? null);
        setSavedPort(String(data.smtp_port ?? 587));
        setSavedUsername(data.smtp_username ?? null);
        setSavedTls(data.smtp_tls ?? true);
        setSavedFrom(data.smtp_from ?? null);
        setSavedTo(data.smtp_to ?? null);
      })
      .catch(() => {});
  }, []);

  const isDirty =
    host !== (savedHost ?? "") ||
    port !== (savedPort ?? "587") ||
    username !== (savedUsername ?? "") ||
    password !== "" ||
    tls !== (savedTls ?? true) ||
    fromAddr !== (savedFrom ?? "") ||
    toAddr !== (savedTo ?? "");

  async function handleSave() {
    loadTokenRef.current++;
    setStatus("loading");
    setStatusMsg("");
    try {
      const body: Record<string, unknown> = {
        smtp_host: host,
        smtp_port: parseInt(port) || 587,
        smtp_username: username,
        smtp_tls: tls,
        smtp_from: fromAddr,
        smtp_to: toAddr,
      };
      if (password) {
        body.smtp_password = password;
      }

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: SmtpSettings = await res.json();
        setSavedHost(data.smtp_host ?? null);
        setSavedPort(String(data.smtp_port ?? 587));
        setSavedUsername(data.smtp_username ?? null);
        setSavedTls(data.smtp_tls ?? true);
        setSavedFrom(data.smtp_from ?? null);
        setSavedTo(data.smtp_to ?? null);
        setPasswordSet(data.smtp_password_set ?? false);
        setHost(data.smtp_host ?? "");
        setPort(String(data.smtp_port ?? 587));
        setUsername(data.smtp_username ?? "");
        setTls(data.smtp_tls ?? true);
        setFromAddr(data.smtp_from ?? "");
        setToAddr(data.smtp_to ?? "");
        setPassword("");
        setStatus("success");
        setStatusMsg("SMTP settings saved.");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setStatusMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setStatusMsg("Network error.");
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
          icon={<Mail className="h-4 w-4 text-pink-400" />}
          iconBg="bg-pink-500/10"
          title="SMTP Configuration"
          description="Configure email alerts via SMTP. Alerts can be sent alongside Telegram/webhook notifications."
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-host" className="text-xs text-slate-400">
                SMTP Host
              </Label>
              <Input
                id="smtp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port" className="text-xs text-slate-400">
                Port
              </Label>
              <Input
                id="smtp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="587"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  id="smtp-tls"
                  type="checkbox"
                  checked={tls}
                  onChange={(e) => setTls(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                Use TLS
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-username" className="text-xs text-slate-400">
                Username
              </Label>
              <Input
                id="smtp-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-password" className="text-xs text-slate-400">
                Password{passwordSet ? " (saved)" : ""}
              </Label>
              <Input
                id="smtp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={passwordSet ? "••••••••" : "SMTP password"}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-from" className="text-xs text-slate-400">
                From Address
              </Label>
              <Input
                id="smtp-from"
                value={fromAddr}
                onChange={(e) => setFromAddr(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="panoptikon@example.com"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp-to" className="text-xs text-slate-400">
                To Address (recipient)
              </Label>
              <Input
                id="smtp-to"
                value={toAddr}
                onChange={(e) => setToAddr(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {status === "success" && statusMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{statusMsg}</p>
            </div>
          )}
          {status === "error" && statusMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{statusMsg}</p>
            </div>
          )}

          <SaveButton
            status={status}
            disabled={!isDirty}
            onClick={handleSave}
          />
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
