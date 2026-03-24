"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Radio,
  Plus,
  Trash2,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import Link from "next/link";

interface SnmpConfig {
  id: string;
  device_name: string;
  host: string;
  port: number;
  community: string;
  version: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

type Status = "idle" | "loading" | "success" | "error";

export default function SnmpSettingsPage() {
  const [configs, setConfigs] = useState<SnmpConfig[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState("161");
  const [newCommunity, setNewCommunity] = useState("public");
  const [newVersion, setNewVersion] = useState("v2c");
  const [newEnabled, setNewEnabled] = useState(true);
  const [createStatus, setCreateStatus] = useState<Status>("idle");
  const [createMsg, setCreateMsg] = useState("");

  const loadConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/snmp-configs", { credentials: "include" });
      if (res.ok) {
        const data: SnmpConfig[] = await res.json();
        setConfigs(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  async function handleCreate() {
    setCreateStatus("loading");
    setCreateMsg("");
    try {
      const res = await fetch("/api/v1/snmp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_name: newDeviceName,
          host: newHost,
          port: parseInt(newPort) || 161,
          community: newCommunity,
          version: newVersion,
          enabled: newEnabled,
        }),
        credentials: "include",
      });
      if (res.ok || res.status === 201) {
        setCreateStatus("success");
        setCreateMsg("SNMP configuration created.");
        setNewDeviceName("");
        setNewHost("");
        setNewPort("161");
        setNewCommunity("public");
        setNewVersion("v2c");
        setNewEnabled(true);
        setShowForm(false);
        loadConfigs();
        setTimeout(() => setCreateStatus("idle"), 3000);
      } else {
        const err = await res.text();
        setCreateStatus("error");
        setCreateMsg(err || `Failed (${res.status}).`);
      }
    } catch {
      setCreateStatus("error");
      setCreateMsg("Network error.");
    }
  }

  async function handleDelete(id: string, name: string) {
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch(`/api/v1/snmp-configs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok || res.status === 204) {
        setStatus("success");
        setMsg(`SNMP config "${name}" deleted.`);
        loadConfigs();
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setMsg(`Failed (${res.status}).`);
      }
    } catch {
      setStatus("error");
      setMsg("Network error.");
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await fetch(`/api/v1/snmp-configs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
        credentials: "include",
      });
      loadConfigs();
    } catch {
      // silent
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
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
          icon={<Radio className="h-4 w-4 text-teal-400" />}
          iconBg="bg-teal-500/10"
          title="SNMP Managed Devices"
          description="Configure SNMP agent settings for monitored routers and switches."
        >
          {/* Status messages */}
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
          {createStatus === "success" && createMsg && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-400">{createMsg}</p>
            </div>
          )}
          {createStatus === "error" && createMsg && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{createMsg}</p>
            </div>
          )}

          {/* Config list */}
          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{cfg.device_name}</span>
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-teal-400">
                      {cfg.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {cfg.host}:{cfg.port} — community: {cfg.community}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(val) => handleToggle(cfg.id, val)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(cfg.id, cfg.device_name)}
                    disabled={status === "loading"}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {configs.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-600">No SNMP configurations.</p>
            )}
          </div>

          {/* Add config form */}
          {showForm ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs font-medium text-slate-400">New SNMP Configuration</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-device-name" className="text-xs text-slate-400">Device Name</Label>
                  <Input id="snmp-device-name" value={newDeviceName} onChange={(e) => setNewDeviceName(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="Core Router" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-host" className="text-xs text-slate-400">Host / IP</Label>
                  <Input id="snmp-host" value={newHost} onChange={(e) => setNewHost(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="10.0.0.1" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-port" className="text-xs text-slate-400">Port</Label>
                  <Input id="snmp-port" type="number" value={newPort} onChange={(e) => setNewPort(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="161" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-community" className="text-xs text-slate-400">Community</Label>
                  <Input id="snmp-community" value={newCommunity} onChange={(e) => setNewCommunity(e.target.value)} className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600" placeholder="public" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="snmp-version" className="text-xs text-slate-400">SNMP Version</Label>
                  <select
                    id="snmp-version"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    <option value="v1">v1</option>
                    <option value="v2c">v2c</option>
                    <option value="v3">v3</option>
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <div className="flex items-center gap-2">
                    <Switch id="snmp-enabled" checked={newEnabled} onCheckedChange={setNewEnabled} />
                    <Label htmlFor="snmp-enabled" className="text-xs text-slate-400">Enabled</Label>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreate}
                  disabled={!newDeviceName || !newHost || createStatus === "loading"}
                  className="bg-teal-600 text-white hover:bg-teal-700"
                >
                  {createStatus === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Add Configuration
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)} className="border-slate-800 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)} className="bg-teal-600 text-white hover:bg-teal-700">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add SNMP Device
            </Button>
          )}
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
