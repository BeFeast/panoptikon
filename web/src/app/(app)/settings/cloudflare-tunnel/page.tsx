"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cloud,
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
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function CloudflareTunnelSettingsPage() {
  const [apiToken, setApiToken] = useState("");
  const [apiTokenSet, setApiTokenSet] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [savedAccountId, setSavedAccountId] = useState<string | null>(null);
  const [tunnelId, setTunnelId] = useState("");
  const [savedTunnelId, setSavedTunnelId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: {
          cloudflare_api_token_set: boolean;
          cloudflare_account_id: string | null;
          cloudflare_tunnel_id: string | null;
        }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setApiTokenSet(data.cloudflare_api_token_set);
          setAccountId(data.cloudflare_account_id ?? "");
          setSavedAccountId(data.cloudflare_account_id ?? null);
          setTunnelId(data.cloudflare_tunnel_id ?? "");
          setSavedTunnelId(data.cloudflare_tunnel_id ?? null);
        },
      )
      .catch(() => {});
  }, []);

  const dirty =
    apiToken.length > 0 ||
    accountId !== (savedAccountId ?? "") ||
    tunnelId !== (savedTunnelId ?? "");

  async function handleSave() {
    settingsLoadTokenRef.current++;
    setStatus("loading");
    setMsg("");
    try {
      const body: Record<string, string> = {};
      if (apiToken.length > 0) body.cloudflare_api_token = apiToken;
      if (accountId !== (savedAccountId ?? ""))
        body.cloudflare_account_id = accountId;
      if (tunnelId !== (savedTunnelId ?? ""))
        body.cloudflare_tunnel_id = tunnelId;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setApiTokenSet(data.cloudflare_api_token_set);
        setApiToken("");
        setSavedAccountId(data.cloudflare_account_id ?? null);
        setAccountId(data.cloudflare_account_id ?? "");
        setSavedTunnelId(data.cloudflare_tunnel_id ?? null);
        setTunnelId(data.cloudflare_tunnel_id ?? "");
        setStatus("success");
        setMsg("Cloudflare Tunnel settings saved.");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setMsg(`Failed to save (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setMsg("Network error.");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg space-y-8 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight font-display text-white">
            Cloudflare Tunnel
          </h1>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
                <Cloud className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Tunnel Configuration
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Connect to your Cloudflare Tunnel to expose services securely.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-api-token" className="text-xs text-slate-400">
                API Token{" "}
                {apiTokenSet && (
                  <span className="text-emerald-500">(saved)</span>
                )}
              </Label>
              <Input
                id="cf-api-token"
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={
                  apiTokenSet
                    ? "••••••••  (leave blank to keep current)"
                    : "Enter Cloudflare API token"
                }
              />
              <p className="text-[10px] text-slate-600">
                Create at: dash.cloudflare.com → My Profile → API Tokens →
                Create Token. Required permissions:{" "}
                <code className="text-slate-500">
                  Account:Cloudflare Tunnel:Edit
                </code>
                ,{" "}
                <code className="text-slate-500">Zone:DNS:Edit</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-account-id" className="text-xs text-slate-400">
                Account ID
              </Label>
              <Input
                id="cf-account-id"
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="e.g. 1a2b3c4d5e6f..."
              />
              <p className="text-[10px] text-slate-600">
                Found at: dash.cloudflare.com → any domain → right sidebar →
                Account ID. Format: 32-character hex string.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-tunnel-id" className="text-xs text-slate-400">
                Tunnel ID
              </Label>
              <Input
                id="cf-tunnel-id"
                type="text"
                value={tunnelId}
                onChange={(e) => setTunnelId(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="e.g. a1b2c3d4-e5f6-..."
              />
              <p className="text-[10px] text-slate-600">
                Found at: dash.cloudflare.com → Zero Trust → Networks →
                Tunnels → your tunnel → Overview. Format: UUID.
              </p>
            </div>

            {status === "success" && msg && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-xs text-emerald-400">{msg}</p>
              </div>
            )}
            {status === "error" && msg && (
              <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <p className="text-xs text-rose-400">{msg}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!dirty || status === "loading"}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {status === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
