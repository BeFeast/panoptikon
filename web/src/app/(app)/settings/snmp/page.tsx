"use client";

import { useEffect, useRef, useState } from "react";
import {
  Radio,
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

export default function SnmpSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [community, setCommunity] = useState("public");
  const [version, setVersion] = useState("2c");
  const [port, setPort] = useState("161");
  const [timeout, setTimeout_] = useState("5");
  const [retries, setRetries] = useState("1");
  const [available, setAvailable] = useState(false);

  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const loadToken = ++loadTokenRef.current;
    fetch("/api/v1/snmp/config", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (loadToken !== loadTokenRef.current) return;
        setAvailable(data.available ?? false);
        setEnabled(data.config?.enabled ?? false);
        setCommunity(data.config?.community ?? "public");
        setVersion(data.config?.version ?? "2c");
        setPort(String(data.config?.port ?? 161));
        setTimeout_(String(data.config?.timeout_seconds ?? 5));
        setRetries(String(data.config?.retries ?? 1));
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    loadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const res = await fetch("/api/v1/snmp/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          community,
          version,
          port: parseInt(port) || 161,
          timeout_seconds: parseInt(timeout) || 5,
          retries: parseInt(retries) || 1,
        }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAvailable(data.available ?? false);
        setSaveStatus("success");
        setSaveMsg("SNMP settings saved.");
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">SNMP Management</h1>
        </div>

        <SettingsSection
          icon={<Radio className="h-4 w-4 text-[#fbbf24]" />}
          iconBg="bg-[#fbbf24]/10"
          title="SNMP Configuration"
          description="Configure SNMP scanning for managed routers and network devices."
        >
          {!available && (
            <div className="flex items-center gap-2 rounded-md border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fbbf24]" />
              <p className="text-xs text-[#fbbf24]">
                snmpget not found on the system. Install net-snmp to enable SNMP scanning.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-mesh-text">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-mesh-border-strong"
            />
            Enable SNMP scanning
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="snmp-community" className="text-xs text-mesh-text-dim">
                Community String
              </Label>
              <Input
                id="snmp-community"
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
                placeholder="public"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snmp-version" className="text-xs text-mesh-text-dim">
                SNMP Version
              </Label>
              <select
                id="snmp-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full mesh-card px-3 py-2 text-sm text-white"
              >
                <option value="1">v1</option>
                <option value="2c">v2c</option>
                <option value="3">v3</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snmp-port" className="text-xs text-mesh-text-dim">
                Port
              </Label>
              <Input
                id="snmp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
                placeholder="161"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snmp-timeout" className="text-xs text-mesh-text-dim">
                Timeout (seconds)
              </Label>
              <Input
                id="snmp-timeout"
                value={timeout}
                onChange={(e) => setTimeout_(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
                placeholder="5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snmp-retries" className="text-xs text-mesh-text-dim">
                Retries
              </Label>
              <Input
                id="snmp-retries"
                value={retries}
                onChange={(e) => setRetries(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
                placeholder="1"
              />
            </div>
          </div>

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

          <SaveButton
            status={saveStatus}
            disabled={false}
            onClick={handleSave}
          />
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
