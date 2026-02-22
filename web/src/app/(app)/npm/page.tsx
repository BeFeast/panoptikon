"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
  fetchNpmProxyHosts,
  fetchNpmStatus,
  createNpmProxyHost,
  updateNpmProxyHost,
  deleteNpmProxyHost,
  toggleNpmProxyHost,
} from "@/lib/api";
import type { NpmProxyHost, NpmProxyHostRequest } from "@/lib/types";

// ─── Default form values ────────────────────────────────

const EMPTY_FORM: NpmProxyHostRequest = {
  domain_names: [],
  forward_host: "",
  forward_port: 80,
  forward_scheme: "http",
  certificate_id: 0,
  ssl_forced: false,
  hsts_enabled: false,
  http2_support: false,
  block_exploits: false,
  allow_websocket_upgrade: false,
  advanced_config: "",
};

// ─── Page Component ─────────────────────────────────────

export default function NpmProxyHostsPage() {
  const [hosts, setHosts] = useState<NpmProxyHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [npmConfigured, setNpmConfigured] = useState<boolean | null>(null);

  // Dialog state
  const [showForm, setShowForm] = useState(false);
  const [editingHost, setEditingHost] = useState<NpmProxyHost | null>(null);
  const [form, setForm] = useState<NpmProxyHostRequest>(EMPTY_FORM);
  const [domainInput, setDomainInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<NpmProxyHost | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Toggle in-flight tracking
  const [toggling, setToggling] = useState<number | null>(null);

  const loadHosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusRes = await fetchNpmStatus();
      setNpmConfigured(statusRes.configured);
      if (!statusRes.configured) {
        setHosts([]);
        return;
      }
      if (!statusRes.reachable) {
        setError("NPM is configured but unreachable. Check connection settings.");
        setHosts([]);
        return;
      }
      const data = await fetchNpmProxyHosts();
      setHosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load proxy hosts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  // ─── Create / Edit ──────────────────────────────────

  function openCreate() {
    setEditingHost(null);
    setForm(EMPTY_FORM);
    setDomainInput("");
    setShowForm(true);
  }

  function openEdit(host: NpmProxyHost) {
    setEditingHost(host);
    setForm({
      domain_names: host.domain_names,
      forward_host: host.forward_host,
      forward_port: host.forward_port,
      forward_scheme: host.forward_scheme,
      certificate_id: host.certificate_id ?? 0,
      ssl_forced: host.ssl_forced,
      hsts_enabled: host.hsts_enabled,
      http2_support: host.http2_support,
      block_exploits: host.block_exploits,
      allow_websocket_upgrade: host.allow_websocket_upgrade,
      advanced_config: host.advanced_config ?? "",
    });
    setDomainInput(host.domain_names.join(", "));
    setShowForm(true);
  }

  async function handleSave() {
    // Parse domain names from comma-separated input
    const domains = domainInput
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    if (domains.length === 0) {
      toast.error("At least one domain name is required");
      return;
    }
    if (!form.forward_host.trim()) {
      toast.error("Forward host is required");
      return;
    }

    const payload: NpmProxyHostRequest = { ...form, domain_names: domains };
    setSaving(true);
    try {
      if (editingHost) {
        await updateNpmProxyHost(editingHost.id, payload);
        toast.success("Proxy host updated");
      } else {
        await createNpmProxyHost(payload);
        toast.success("Proxy host created");
      }
      setShowForm(false);
      loadHosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete ─────────────────────────────────────────

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    try {
      await deleteNpmProxyHost(confirmDelete.id);
      toast.success("Proxy host deleted");
      setConfirmDelete(null);
      loadHosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  // ─── Toggle ─────────────────────────────────────────

  async function handleToggle(host: NpmProxyHost) {
    setToggling(host.id);
    try {
      await toggleNpmProxyHost(host.id, !host.enabled);
      toast.success(host.enabled ? "Proxy host disabled" : "Proxy host enabled");
      loadHosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  }

  // ─── Not configured state ───────────────────────────

  if (!loading && npmConfigured === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-white">Proxy Hosts</h1>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
          <Globe className="mx-auto h-12 w-12 text-slate-600" />
          <p className="mt-4 text-slate-400">
            Nginx Proxy Manager is not configured.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Add your NPM credentials in{" "}
            <a href="/settings" className="text-blue-400 hover:underline">
              Settings
            </a>{" "}
            to manage proxy hosts.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Proxy Hosts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage Nginx Proxy Manager proxy hosts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadHosts}
            disabled={loading}
            className="border-slate-800 text-slate-300"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Proxy Host
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-left">
              <th className="px-4 py-3 font-medium text-slate-400">Domain(s)</th>
              <th className="px-4 py-3 font-medium text-slate-400">Backend</th>
              <th className="px-4 py-3 font-medium text-slate-400">SSL</th>
              <th className="px-4 py-3 font-medium text-slate-400">Features</th>
              <th className="px-4 py-3 font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : hosts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No proxy hosts found
                </td>
              </tr>
            ) : (
              hosts.map((host) => (
                <tr
                  key={host.id}
                  className="border-b border-slate-800 transition-colors hover:bg-slate-800/60"
                >
                  {/* Domains */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {host.domain_names.map((d) => (
                        <Badge
                          key={d}
                          variant="secondary"
                          className="bg-slate-800 text-slate-200"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </td>

                  {/* Backend */}
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">
                    {host.forward_scheme}://{host.forward_host}:{host.forward_port}
                  </td>

                  {/* SSL */}
                  <td className="px-4 py-3">
                    {host.ssl_forced ? (
                      <Badge className="bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/50">
                        <Shield className="mr-1 h-3 w-3" />
                        SSL
                      </Badge>
                    ) : (
                      <span className="text-slate-500">None</span>
                    )}
                  </td>

                  {/* Features */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {host.http2_support && (
                        <Badge variant="outline" className="border-slate-700 text-xs text-slate-400">
                          H2
                        </Badge>
                      )}
                      {host.hsts_enabled && (
                        <Badge variant="outline" className="border-slate-700 text-xs text-slate-400">
                          HSTS
                        </Badge>
                      )}
                      {host.allow_websocket_upgrade && (
                        <Badge variant="outline" className="border-slate-700 text-xs text-slate-400">
                          WS
                        </Badge>
                      )}
                      {host.block_exploits && (
                        <Badge variant="outline" className="border-slate-700 text-xs text-slate-400">
                          Block
                        </Badge>
                      )}
                      {!host.http2_support && !host.hsts_enabled && !host.allow_websocket_upgrade && !host.block_exploits && (
                        <span className="text-slate-600">—</span>
                      )}
                    </div>
                  </td>

                  {/* Enabled toggle */}
                  <td className="px-4 py-3">
                    {toggling === host.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Switch
                        checked={host.enabled}
                        onCheckedChange={() => handleToggle(host)}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(host)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {deleting === host.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(host)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingHost ? "Edit Proxy Host" : "New Proxy Host"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingHost
                ? "Update the proxy host configuration."
                : "Create a new reverse proxy host in Nginx Proxy Manager."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Domain names */}
            <div className="space-y-2">
              <Label className="text-slate-300">Domain Names</Label>
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com, www.example.com"
                className="border-slate-800 bg-slate-950 text-white"
              />
              <p className="text-xs text-slate-500">Comma-separated list of domain names</p>
            </div>

            {/* Forward host + port + scheme */}
            <div className="grid grid-cols-[1fr_auto_100px] gap-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Forward Host</Label>
                <Input
                  value={form.forward_host}
                  onChange={(e) => setForm({ ...form, forward_host: e.target.value })}
                  placeholder="192.168.1.100"
                  className="border-slate-800 bg-slate-950 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Scheme</Label>
                <select
                  value={form.forward_scheme}
                  onChange={(e) => setForm({ ...form, forward_scheme: e.target.value })}
                  className="h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white"
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Port</Label>
                <Input
                  type="number"
                  value={form.forward_port}
                  onChange={(e) =>
                    setForm({ ...form, forward_port: parseInt(e.target.value, 10) || 80 })
                  }
                  className="border-slate-800 bg-slate-950 text-white"
                />
              </div>
            </div>

            {/* SSL + toggles */}
            <div className="space-y-3 rounded-md border border-slate-800 p-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                SSL &amp; Security
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">Force SSL</Label>
                <Switch
                  checked={form.ssl_forced}
                  onCheckedChange={(v) => setForm({ ...form, ssl_forced: v })}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">HSTS Enabled</Label>
                <Switch
                  checked={form.hsts_enabled}
                  onCheckedChange={(v) => setForm({ ...form, hsts_enabled: v })}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">HTTP/2 Support</Label>
                <Switch
                  checked={form.http2_support}
                  onCheckedChange={(v) => setForm({ ...form, http2_support: v })}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">Block Exploits</Label>
                <Switch
                  checked={form.block_exploits}
                  onCheckedChange={(v) => setForm({ ...form, block_exploits: v })}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-slate-300">WebSocket Support</Label>
                <Switch
                  checked={form.allow_websocket_upgrade}
                  onCheckedChange={(v) => setForm({ ...form, allow_websocket_upgrade: v })}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            </div>

            {/* Advanced config */}
            <div className="space-y-2">
              <Label className="text-slate-300">Custom Nginx Configuration</Label>
              <textarea
                value={form.advanced_config}
                onChange={(e) => setForm({ ...form, advanced_config: e.target.value })}
                placeholder="# Custom Nginx directives..."
                rows={3}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              className="border-slate-800 text-slate-300"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingHost ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Proxy Host
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently remove the proxy host for{" "}
              <span className="font-mono text-white">
                {confirmDelete?.domain_names.join(", ")}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
