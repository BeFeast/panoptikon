"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Shield,
  Plug,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Power,
  RefreshCw,
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
import {
  fetchCaddyStatus,
  fetchCaddyProxyHosts,
  createCaddyProxyHost,
  updateCaddyProxyHost,
  deleteCaddyProxyHost,
  toggleCaddyProxyHost,
  syncCaddyConfig,
} from "@/lib/api";
import type { CaddyProxyHost } from "@/lib/types";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function CaddySettingsPage() {
  // ─── Settings state ────────────────────────────────────
  const [caddyUrl, setCaddyUrl] = useState("");
  const [savedCaddyUrl, setSavedCaddyUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [testStatus, setTestStatus] = useState<Status>("idle");
  const [testMsg, setTestMsg] = useState("");

  // ─── Proxy hosts state ─────────────────────────────────
  const [hosts, setHosts] = useState<CaddyProxyHost[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);

  // ─── Add/Edit form state ───────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDomain, setFormDomain] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("80");
  const [formScheme, setFormScheme] = useState("http");
  const [formSsl, setFormSsl] = useState(false);
  const [formStatus, setFormStatus] = useState<Status>("idle");
  const [formMsg, setFormMsg] = useState("");

  const settingsLoadTokenRef = useRef(0);

  // ─── Load settings on mount ────────────────────────────
  useEffect(() => {
    const loadToken = ++settingsLoadTokenRef.current;
    fetch("/api/v1/settings", { credentials: "include" })
      .then((res) => res.json())
      .then(
        (data: { caddy_url: string | null }) => {
          if (loadToken !== settingsLoadTokenRef.current) return;
          setCaddyUrl(data.caddy_url ?? "");
          setSavedCaddyUrl(data.caddy_url ?? null);
        }
      )
      .catch(() => {});
  }, []);

  // ─── Load hosts ────────────────────────────────────────
  const loadHosts = useCallback(async () => {
    setHostsLoading(true);
    try {
      const data = await fetchCaddyProxyHosts();
      setHosts(data);
    } catch {
      // ignore
    } finally {
      setHostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  const isDirty = caddyUrl !== (savedCaddyUrl ?? "");

  // ─── Save settings ─────────────────────────────────────
  async function handleSave() {
    settingsLoadTokenRef.current++;
    setSaveStatus("loading");
    setSaveMsg("");
    try {
      const body: Record<string, string> = {};
      if (caddyUrl !== (savedCaddyUrl ?? "")) body.caddy_url = caddyUrl;

      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSavedCaddyUrl(data.caddy_url ?? null);
        setCaddyUrl(data.caddy_url ?? "");
        setSaveStatus("success");
        setSaveMsg("Caddy settings saved.");
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

  // ─── Test connection ───────────────────────────────────
  async function handleTest() {
    setTestStatus("loading");
    setTestMsg("");
    try {
      const data = await fetchCaddyStatus();
      if (data.reachable) {
        setTestStatus("success");
        setTestMsg("Connected to Caddy Admin API!");
        setTimeout(() => setTestStatus("idle"), 5000);
      } else if (data.configured) {
        setTestStatus("error");
        setTestMsg("Caddy configured but unreachable. Check URL.");
      } else {
        setTestStatus("error");
        setTestMsg("Caddy not configured. Save URL first.");
      }
    } catch {
      setTestStatus("error");
      setTestMsg("Failed to test connection.");
    }
  }

  // ─── Form helpers ──────────────────────────────────────
  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormDomain("");
    setFormHost("");
    setFormPort("80");
    setFormScheme("http");
    setFormSsl(false);
    setFormStatus("idle");
    setFormMsg("");
  }

  function openEditForm(host: CaddyProxyHost) {
    setEditingId(host.id);
    setFormDomain(host.domain);
    setFormHost(host.forward_host);
    setFormPort(String(host.forward_port));
    setFormScheme(host.forward_scheme);
    setFormSsl(host.ssl_enabled);
    setShowForm(true);
    setFormStatus("idle");
    setFormMsg("");
  }

  async function handleFormSubmit() {
    setFormStatus("loading");
    setFormMsg("");
    const body = {
      domain: formDomain,
      forward_host: formHost,
      forward_port: parseInt(formPort, 10) || 80,
      forward_scheme: formScheme,
      ssl_enabled: formSsl,
    };

    try {
      if (editingId) {
        await updateCaddyProxyHost(editingId, body);
      } else {
        await createCaddyProxyHost(body);
      }
      setFormStatus("success");
      resetForm();
      loadHosts();
    } catch (e) {
      setFormStatus("error");
      setFormMsg(e instanceof Error ? e.message : "Failed to save host.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCaddyProxyHost(id);
      loadHosts();
    } catch {
      // ignore
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleCaddyProxyHost(id, enabled);
      loadHosts();
    } catch {
      // ignore
    }
  }

  async function handleSync() {
    try {
      await syncCaddyConfig();
      loadHosts();
    } catch {
      // ignore
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-white">Caddy Proxy</h1>
        </div>

        {/* Connection Settings Card */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Shield className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Caddy Admin API
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Connect to Caddy&apos;s JSON Admin API to manage reverse proxy hosts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="caddy-url" className="text-xs text-slate-400">
                Caddy Admin URL
              </Label>
              <Input
                id="caddy-url"
                type="url"
                value={caddyUrl}
                onChange={(e) => setCaddyUrl(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="http://localhost:2019"
              />
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
              <Button
                onClick={handleSave}
                disabled={!isDirty || saveStatus === "loading"}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {saveStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={
                  (!savedCaddyUrl && !caddyUrl) || testStatus === "loading"
                }
                className="border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                {testStatus === "loading" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="mr-1.5 h-3.5 w-3.5" />
                )}
                Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Proxy Hosts Card */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">
                Proxy Hosts
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Sync
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="bg-green-600 text-white hover:bg-green-500"
                >
                  <Plus className="mr-1.5 h-3 w-3" />
                  Add Host
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add/Edit form */}
            {showForm && (
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <p className="text-sm font-medium text-white">
                  {editingId ? "Edit Proxy Host" : "New Proxy Host"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Domain</Label>
                    <Input
                      value={formDomain}
                      onChange={(e) => setFormDomain(e.target.value)}
                      placeholder="app.example.com"
                      className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">
                      Forward Host
                    </Label>
                    <Input
                      value={formHost}
                      onChange={(e) => setFormHost(e.target.value)}
                      placeholder="10.10.0.50"
                      className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">
                      Forward Port
                    </Label>
                    <Input
                      type="number"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                      placeholder="80"
                      className="border-slate-800 bg-slate-900 text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Scheme</Label>
                    <select
                      value={formScheme}
                      onChange={(e) => setFormScheme(e.target.value)}
                      className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-white"
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                  </div>
                </div>
                {formStatus === "error" && formMsg && (
                  <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <p className="text-xs text-rose-400">{formMsg}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleFormSubmit}
                    disabled={
                      !formDomain || !formHost || formStatus === "loading"
                    }
                    className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    {formStatus === "loading" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {editingId ? "Update" : "Create"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetForm}
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Hosts list */}
            {hostsLoading && hosts.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : hosts.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No proxy hosts configured yet.
              </p>
            ) : (
              <div className="space-y-2">
                {hosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            host.enabled ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                        <p className="text-sm font-medium text-white">
                          {host.domain}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleToggle(host.id, !host.enabled)
                        }
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                        title={host.enabled ? "Disable" : "Enable"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditForm(host)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(host.id)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
