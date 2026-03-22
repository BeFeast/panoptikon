"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
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

  // Inline validation for hex account ID
  const accountValid =
    accountId.length === 0
      ? "idle"
      : /^[0-9a-fA-F]{32}$/.test(accountId)
        ? "valid"
        : "error";
  // UUID validation for tunnel ID
  const tunnelValid =
    tunnelId.length === 0
      ? "idle"
      : /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(tunnelId)
        ? "valid"
        : "error";

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
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Cloudflare Tunnel
          </h1>
        </div>

        <SettingsSection
          icon={<Cloud className="h-4 w-4 text-orange-400" />}
          iconBg="bg-orange-500/10"
          title="Tunnel Configuration"
          description="Connect to your Cloudflare Tunnel to expose services securely."
        >
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
            <div className="relative">
              <Input
                id="cf-account-id"
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={`border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 ${
                  accountValid === "valid"
                    ? "border-emerald-500/40"
                    : accountValid === "error"
                      ? "border-rose-500/40"
                      : ""
                }`}
                placeholder="e.g. 1a2b3c4d5e6f..."
              />
              {accountValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-600">
              Found at: dash.cloudflare.com → any domain → right sidebar →
              Account ID. Format: 32-character hex string.
            </p>
            {accountValid === "error" && (
              <p className="animate-fade-in text-xs text-rose-400">
                Must be a 32-character hex string.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-tunnel-id" className="text-xs text-slate-400">
              Tunnel ID
            </Label>
            <div className="relative">
              <Input
                id="cf-tunnel-id"
                type="text"
                value={tunnelId}
                onChange={(e) => setTunnelId(e.target.value)}
                className={`border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 ${
                  tunnelValid === "valid"
                    ? "border-emerald-500/40"
                    : tunnelValid === "error"
                      ? "border-rose-500/40"
                      : ""
                }`}
                placeholder="e.g. a1b2c3d4-e5f6-..."
              />
              {tunnelValid === "valid" && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-check-scale">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-600">
              Found at: dash.cloudflare.com → Zero Trust → Networks →
              Tunnels → your tunnel → Overview. Format: UUID.
            </p>
            {tunnelValid === "error" && (
              <p className="animate-fade-in text-xs text-rose-400">
                Must be a valid UUID format.
              </p>
            )}
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

          <SaveButton
            status={status}
            disabled={!dirty}
            onClick={handleSave}
          />
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
