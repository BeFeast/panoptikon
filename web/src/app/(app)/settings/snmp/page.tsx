"use client";

import { useEffect, useRef, useState } from "react";
import {
  Router,
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

interface SnmpSettings {
  snmp_community: string | null;
  snmp_version: string | null;
  snmp_port: number | null;
  snmp_trap_enabled: boolean;
  snmp_trap_target: string | null;
}

export default function SnmpSettingsPage() {
  const [community, setCommunity] = useState("public");
  const [version, setVersion] = useState("v2c");
  const [port, setPort] = useState("161");
  const [trapEnabled, setTrapEnabled] = useState(false);
  const [trapTarget, setTrapTarget] = useState("");

  const [savedCommunity, setSavedCommunity] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [savedPort, setSavedPort] = useState<string | null>(null);
  const [savedTrapEnabled, setSavedTrapEnabled] = useState<boolean | null>(null);
  const [savedTrapTarget, setSavedTrapTarget] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((data: SnmpSettings) => {
        if (loadToken !== loadTokenRef.current) return;
        setCommunity(data.snmp_community ?? "public");
        setVersion(data.snmp_version ?? "v2c");
        setPort(String(data.snmp_port ?? 161));
        setTrapEnabled(data.snmp_trap_enabled ?? false);
        setTrapTarget(data.snmp_trap_target ?? "");

        setSavedCommunity(data.snmp_community ?? "public");
        setSavedVersion(data.snmp_version ?? "v2c");
        setSavedPort(String(data.snmp_port ?? 161));
        setSavedTrapEnabled(data.snmp_trap_enabled ?? false);
        setSavedTrapTarget(data.snmp_trap_target ?? null);
      })
      .catch(() => {});
  }, []);

  const isDirty =
    community !== (savedCommunity ?? "public") ||
    version !== (savedVersion ?? "v2c") ||
    port !== (savedPort ?? "161") ||
    trapEnabled !== (savedTrapEnabled ?? false) ||
    trapTarget !== (savedTrapTarget ?? "");

  async function handleSave() {
    loadTokenRef.current++;
    setStatus("loading");
    setStatusMsg("");
    try {
      const body = {
        snmp_community: community,
        snmp_version: version,
        snmp_port: parseInt(port) || 161,
        snmp_trap_enabled: trapEnabled,
        snmp_trap_target: trapTarget,
      };

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data: SnmpSettings = await res.json();
        setSavedCommunity(data.snmp_community ?? "public");
        setSavedVersion(data.snmp_version ?? "v2c");
        setSavedPort(String(data.snmp_port ?? 161));
        setSavedTrapEnabled(data.snmp_trap_enabled ?? false);
        setSavedTrapTarget(data.snmp_trap_target ?? null);
        setCommunity(data.snmp_community ?? "public");
        setVersion(data.snmp_version ?? "v2c");
        setPort(String(data.snmp_port ?? 161));
        setTrapEnabled(data.snmp_trap_enabled ?? false);
        setTrapTarget(data.snmp_trap_target ?? "");
        setStatus("success");
        setStatusMsg("SNMP settings saved.");
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">SNMP Configuration</h1>
        </div>

        <SettingsSection
          icon={<Router className="h-4 w-4 text-teal-400" />}
          iconBg="bg-teal-500/10"
          title="SNMP Agent Settings"
          description="Configure SNMP community, version, and trap settings for managed routers."
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="snmp-community" className="text-xs text-slate-400">
                  Community String
                </Label>
                <Input
                  id="snmp-community"
                  value={community}
                  onChange={(e) => setCommunity(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="public"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snmp-version" className="text-xs text-slate-400">
                  SNMP Version
                </Label>
                <select
                  id="snmp-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="v1">v1</option>
                  <option value="v2c">v2c</option>
                  <option value="v3">v3</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="snmp-port" className="text-xs text-slate-400">
                SNMP Port
              </Label>
              <Input
                id="snmp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="161"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  id="snmp-trap-enabled"
                  type="checkbox"
                  checked={trapEnabled}
                  onChange={(e) => setTrapEnabled(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                Enable SNMP Traps
              </label>
              {trapEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-trap-target" className="text-xs text-slate-400">
                    Trap Target (IP:port)
                  </Label>
                  <Input
                    id="snmp-trap-target"
                    value={trapTarget}
                    onChange={(e) => setTrapTarget(e.target.value)}
                    className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                    placeholder="10.0.0.1:162"
                  />
                </div>
              )}
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
