"use client";

import { useEffect, useRef, useState } from "react";
import {
  Globe,
  Plug,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
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
import { fetchNpmStatus } from "@/lib/api";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function NpmSettingsPage() {
  const [npmUrl, setNpmUrl] = useState("");
  const [savedNpmUrl, setSavedNpmUrl] = useState<string | null>(null);
  const [npmEmail, setNpmEmail] = useState("");
  const [savedNpmEmail, setSavedNpmEmail] = useState<string | null>(null);
  const [npmPassword, setNpmPassword] = useState("");
  const [npmPasswordSet, setNpmPasswordSet] = useState(false);
  const [npmStatus, setNpmStatus] = useState<Status>("idle");
  const [npmMsg, setNpmMsg] = useState("");
  const [npmTestStatus, setNpmTestStatus] = useState<Status>("idle");
  const [npmTestMsg, setNpmTestMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          npm_url: string | null;
          npm_email: string | null;
          npm_password_set: boolean;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setNpmUrl(data.npm_url ?? "");
          setSavedNpmUrl(data.npm_url ?? null);
          setNpmEmail(data.npm_email ?? "");
          setSavedNpmEmail(data.npm_email ?? null);
          setNpmPasswordSet(data.npm_password_set);
        }
      )
      .catch(() => {});
  }, []);

  const npmDirty =
    npmUrl !== (savedNpmUrl ?? "") ||
    npmEmail !== (savedNpmEmail ?? "") ||
    npmPassword.length > 0;

  async function handleNpmSave() {
    settingsLoadTokenRef.current++;
    setNpmStatus("loading");
    setNpmMsg("");
    try {
      const body: Record<string, string> = {};
      if (npmUrl !== (savedNpmUrl ?? "")) body.npm_url = npmUrl;
      if (npmEmail !== (savedNpmEmail ?? "")) body.npm_email = npmEmail;
      if (npmPassword.length > 0) body.npm_password = npmPassword;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedNpmUrl(data.npm_url ?? null);
        setNpmUrl(data.npm_url ?? "");
        setSavedNpmEmail(data.npm_email ?? null);
        setNpmEmail(data.npm_email ?? "");
        setNpmPasswordSet(data.npm_password_set);
        setNpmPassword("");
        setNpmStatus("success");
        setNpmMsg("NPM settings saved.");
        setTimeout(() => setNpmStatus("idle"), 3000);
      } else {
        setNpmStatus("error");
        setNpmMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setNpmStatus("error");
      setNpmMsg("Network error.");
    }
  }

  async function handleNpmTest() {
    setNpmTestStatus("loading");
    setNpmTestMsg("");
    try {
      const data = await fetchNpmStatus();
      if (data.reachable) {
        setNpmTestStatus("success");
        setNpmTestMsg(
          `Connected! ${data.host_count !== null ? `${data.host_count} proxy host${data.host_count !== 1 ? "s" : ""}` : ""}`
        );
        setTimeout(() => setNpmTestStatus("idle"), 5000);
      } else if (data.configured) {
        setNpmTestStatus("error");
        setNpmTestMsg("NPM configured but unreachable. Check URL and credentials.");
      } else {
        setNpmTestStatus("error");
        setNpmTestMsg("NPM not configured. Save URL, email, and password first.");
      }
    } catch {
      setNpmTestStatus("error");
      setNpmTestMsg("Failed to test connection.");
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
          <h1 className="text-2xl font-semibold text-white">Nginx Proxy Manager</h1>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-400">
            Legacy — consider migrating to{" "}
            <Link
              href="/settings/caddy"
              className="font-medium underline hover:text-amber-300"
            >
              Caddy
            </Link>
            , the primary reverse proxy.
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                <Globe className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  NPM Connection
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Connect to your NPM instance to manage reverse proxy hosts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="npm-url" className="text-xs text-slate-400">
                NPM URL
              </Label>
              <Input
                id="npm-url"
                type="url"
                value={npmUrl}
                onChange={(e) => setNpmUrl(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="http://10.10.0.20:81"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="npm-email" className="text-xs text-slate-400">
                Email
              </Label>
              <Input
                id="npm-email"
                type="email"
                value={npmEmail}
                onChange={(e) => setNpmEmail(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="admin@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="npm-password" className="text-xs text-slate-400">
                Password{" "}
                {npmPasswordSet && (
                  <span className="text-emerald-500">(saved)</span>
                )}
              </Label>
              <Input
                id="npm-password"
                type="password"
                value={npmPassword}
                onChange={(e) => setNpmPassword(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={
                  npmPasswordSet
                    ? "••••••••  (leave blank to keep current)"
                    : "Enter NPM password"
                }
              />
            </div>

            {npmStatus === "success" && npmMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{npmMsg}</p>
              </div>
            )}
            {npmStatus === "error" && npmMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{npmMsg}</p>
              </div>
            )}
            {npmTestStatus === "success" && npmTestMsg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{npmTestMsg}</p>
              </div>
            )}
            {npmTestStatus === "error" && npmTestMsg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{npmTestMsg}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleNpmSave}
                disabled={!npmDirty || npmStatus === "loading"}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {npmStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={handleNpmTest}
                disabled={
                  (!savedNpmUrl && !npmUrl) || npmTestStatus === "loading"
                }
                className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                {npmTestStatus === "loading" ? (
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
