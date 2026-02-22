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
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function VyosSettingsPage() {
  const [vyosUrl, setVyosUrl] = useState("");
  const [savedVyosUrl, setSavedVyosUrl] = useState<string | null>(null);
  const [vyosApiKey, setVyosApiKey] = useState("");
  const [vyosApiKeySet, setVyosApiKeySet] = useState(false);
  const [vyosStatus, setVyosStatus] = useState<Status>("idle");
  const [vyosMsg, setVyosMsg] = useState("");
  const [vyosTestStatus, setVyosTestStatus] = useState<Status>("idle");
  const [vyosTestMsg, setVyosTestMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: { vyos_url: string | null; vyos_api_key_set: boolean }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setVyosUrl(data.vyos_url ?? "");
          setSavedVyosUrl(data.vyos_url ?? null);
          setVyosApiKeySet(data.vyos_api_key_set);
        }
      )
      .catch(() => {});
  }, []);

  const vyosDirty =
    vyosUrl !== (savedVyosUrl ?? "") || vyosApiKey.length > 0;

  async function handleVyosSave() {
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
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-white">VyOS Router</h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Router className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Router Connection
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
      </div>
    </PageTransition>
  );
}
