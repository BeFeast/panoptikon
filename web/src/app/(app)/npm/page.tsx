"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  ArrowRightLeft,
  ExternalLink,
  FileX2,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Radio,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchNpmStatus,
  fetchNpmProxyHosts,
  createNpmProxyHost,
  updateNpmProxyHost,
  deleteNpmProxyHost,
  toggleNpmProxyHost,
  fetchNpmRedirectionHosts,
  createNpmRedirectionHost,
  updateNpmRedirectionHost,
  deleteNpmRedirectionHost,
  fetchNpmAccessLists,
  createNpmAccessList,
  updateNpmAccessList,
  deleteNpmAccessList,
  fetchNpmStreams,
  createNpmStream,
  updateNpmStream,
  deleteNpmStream,
  toggleNpmStream,
  fetchNpmDeadHosts,
  createNpmDeadHost,
  deleteNpmDeadHost,
} from "@/lib/api";
import type {
  NpmAccessList,
  NpmAccessListClient,
  NpmConnectionStatus,
  NpmProxyHost,
  NpmProxyHostRequest,
  NpmRedirectionHost,
  NpmStream,
  NpmDeadHost,
} from "@/lib/types";

// ─── Proxy Hosts Table ──────────────────────────────────

interface ProxyHostFormData {
  domain_names: string;
  forward_host: string;
  forward_port: number;
  forward_scheme: string;
  ssl_forced: boolean;
  block_exploits: boolean;
  allow_websocket_upgrade: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  access_list_id: number | string;
  advanced_config: string;
}

const emptyProxyForm: ProxyHostFormData = {
  domain_names: "",
  forward_host: "",
  forward_port: 80,
  forward_scheme: "http",
  ssl_forced: false,
  block_exploits: false,
  allow_websocket_upgrade: false,
  http2_support: false,
  hsts_enabled: false,
  access_list_id: 0,
  advanced_config: "",
};

function ProxyHostsTable({
  hosts,
  loading,
  accessLists,
  onReload,
}: {
  hosts: NpmProxyHost[];
  loading: boolean;
  accessLists: NpmAccessList[];
  onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editHost, setEditHost] = useState<NpmProxyHost | null>(null);
  const [form, setForm] = useState<ProxyHostFormData>(emptyProxyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NpmProxyHost | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return hosts;
    const q = search.toLowerCase();
    return hosts.filter(
      (h) =>
        h.domain_names.some((d) => d.toLowerCase().includes(q)) ||
        h.forward_host?.toLowerCase().includes(q) ||
        String(h.forward_port).includes(q),
    );
  }, [hosts, search]);

  const getAccessListName = (id: number | string | null) => {
    if (!id || id === 0 || id === "0") return null;
    const al = accessLists.find((a) => a.id === Number(id));
    return al?.name ?? null;
  };

  const openCreate = () => {
    setEditHost(null);
    setForm(emptyProxyForm);
    setShowForm(true);
  };

  const openEdit = (h: NpmProxyHost) => {
    setEditHost(h);
    setForm({
      domain_names: h.domain_names.join(", "),
      forward_host: h.forward_host,
      forward_port: h.forward_port,
      forward_scheme: h.forward_scheme,
      ssl_forced: h.ssl_forced,
      block_exploits: h.block_exploits,
      allow_websocket_upgrade: h.allow_websocket_upgrade,
      http2_support: h.http2_support,
      hsts_enabled: h.hsts_enabled,
      access_list_id: h.access_list_id ?? 0,
      advanced_config: h.advanced_config ?? "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const domainNames = form.domain_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domainNames.length === 0) {
      toast.error("At least one domain name is required");
      return;
    }
    if (!form.forward_host.trim()) {
      toast.error("Forward host is required");
      return;
    }
    if (form.forward_port <= 0 || form.forward_port > 65535) {
      toast.error("Port must be between 1 and 65535");
      return;
    }

    setSaving(true);
    try {
      const payload: NpmProxyHostRequest = {
        domain_names: domainNames,
        forward_host: form.forward_host.trim(),
        forward_port: form.forward_port,
        forward_scheme: form.forward_scheme,
        certificate_id: 0,
        access_list_id: form.access_list_id,
        ssl_forced: form.ssl_forced,
        hsts_enabled: form.hsts_enabled,
        http2_support: form.http2_support,
        block_exploits: form.block_exploits,
        allow_websocket_upgrade: form.allow_websocket_upgrade,
        advanced_config: form.advanced_config,
      };

      if (editHost) {
        if (editHost.certificate_id) {
          payload.certificate_id = editHost.certificate_id;
        }
        await updateNpmProxyHost(editHost.id, payload);
        toast.success("Proxy host updated");
      } else {
        await createNpmProxyHost(payload);
        toast.success("Proxy host created");
      }

      setShowForm(false);
      setEditHost(null);
      setForm(emptyProxyForm);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(id);
    try {
      await deleteNpmProxyHost(id);
      toast.success("Proxy host deleted");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (h: NpmProxyHost) => {
    setToggling(h.id);
    try {
      await toggleNpmProxyHost(h.id, !h.enabled);
      toast.success(h.enabled ? "Proxy host disabled" : "Proxy host enabled");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter by domain, host, or port…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-slate-700 bg-slate-800/50 pl-9 pr-8 text-sm text-white placeholder:text-slate-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {search ? (
          <span className="text-xs text-slate-500">
            Showing {filtered.length} of {hosts.length} hosts
          </span>
        ) : (
          <p className="text-xs text-slate-500">
            {hosts.length} proxy host{hosts.length !== 1 ? "s" : ""}
          </p>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Proxy Host
        </Button>
      </div>

      {hosts.length === 0 && !search ? (
        <p className="px-4 pb-6 text-center text-sm text-slate-500">
          No proxy hosts found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Domain(s)</th>
                <th className="px-4 py-2">Forward To</th>
                <th className="px-4 py-2">SSL</th>
                <th className="px-4 py-2">Access List</th>
                <th className="px-4 py-2">Enabled</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    No hosts match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              ) : (
              filtered.map((h) => {
                const alName = getAccessListName(h.access_list_id);
                return (
                  <tr
                    key={h.id}
                    className="border-b border-mesh-border hover:bg-mesh-surface-2/55"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {h.domain_names.map((d) => (
                          <span
                            key={d}
                            className="font-mono text-xs text-white"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                      {h.forward_scheme}://{h.forward_host}:{h.forward_port}
                    </td>
                    <td className="px-4 py-2.5">
                      {h.ssl_forced ? (
                        <Lock className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {alName ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-amber-400"
                        >
                          <Shield className="mr-1 h-3 w-3" />
                          {alName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Switch
                        checked={h.enabled}
                        disabled={toggling === h.id}
                        onCheckedChange={() => handleToggle(h)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                          onClick={() => openEdit(h)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                          disabled={deleting === h.id}
                          onClick={() => setConfirmDelete(h)}
                        >
                          {deleting === h.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditHost(null);
          }
        }}
      >
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editHost ? "Edit Proxy Host" : "New Proxy Host"}
            </DialogTitle>
            <DialogDescription>
              {editHost
                ? "Update the proxy host rule."
                : "Create a new reverse proxy host."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Domain Names */}
            <div className="space-y-1.5">
              <Label htmlFor="proxy-domains">
                Domain Name(s){" "}
                <span className="text-xs text-slate-500">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="proxy-domains"
                className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                placeholder="app.example.com, www.example.com"
                value={form.domain_names}
                onChange={(e) =>
                  setForm({ ...form, domain_names: e.target.value })
                }
              />
            </div>

            {/* Forward Host + Scheme + Port */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="proxy-fwd-host">Forward Host</Label>
                <Input
                  id="proxy-fwd-host"
                  className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                  placeholder="192.168.1.100"
                  value={form.forward_host}
                  onChange={(e) =>
                    setForm({ ...form, forward_host: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proxy-scheme">Scheme</Label>
                <select
                  id="proxy-scheme"
                  className="h-9 rounded-md border border-mesh-border-strong bg-mesh-surface-1/95 px-2 text-sm text-white"
                  value={form.forward_scheme}
                  onChange={(e) =>
                    setForm({ ...form, forward_scheme: e.target.value })
                  }
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proxy-port">Port</Label>
                <Input
                  id="proxy-port"
                  type="number"
                  className="w-24 border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                  placeholder="80"
                  value={form.forward_port || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      forward_port: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
            </div>

            {/* Access List */}
            <div className="space-y-1.5">
              <Label htmlFor="proxy-access-list">Access List</Label>
              <select
                id="proxy-access-list"
                className="h-9 w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1/95 px-2 text-sm text-white"
                value={String(form.access_list_id)}
                onChange={(e) =>
                  setForm({ ...form, access_list_id: Number(e.target.value) })
                }
              >
                <option value="0">Publicly Accessible</option>
                {accessLists.map((al) => (
                  <option key={al.id} value={String(al.id)}>
                    {al.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="proxy-ssl" className="cursor-pointer">
                  Force SSL
                </Label>
                <Switch
                  id="proxy-ssl"
                  checked={form.ssl_forced}
                  onCheckedChange={(v) => setForm({ ...form, ssl_forced: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="proxy-http2" className="cursor-pointer">
                  HTTP/2 Support
                </Label>
                <Switch
                  id="proxy-http2"
                  checked={form.http2_support}
                  onCheckedChange={(v) =>
                    setForm({ ...form, http2_support: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="proxy-exploits" className="cursor-pointer">
                  Block Exploits
                </Label>
                <Switch
                  id="proxy-exploits"
                  checked={form.block_exploits}
                  onCheckedChange={(v) =>
                    setForm({ ...form, block_exploits: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="proxy-websocket" className="cursor-pointer">
                  WebSocket Support
                </Label>
                <Switch
                  id="proxy-websocket"
                  checked={form.allow_websocket_upgrade}
                  onCheckedChange={(v) =>
                    setForm({ ...form, allow_websocket_upgrade: v })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditHost(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editHost ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Proxy Host?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The proxy host for{" "}
              <span className="font-mono text-white">
                {confirmDelete?.domain_names.join(", ")}
              </span>{" "}
              will be permanently removed from Nginx Proxy Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Redirection Hosts Table ─────────────────────────────

interface RedirectionFormData {
  domain_names: string;
  forward_http_code: number;
  forward_scheme: string;
  forward_domain_name: string;
  preserve_path: boolean;
  ssl_forced: boolean;
  block_exploits: boolean;
}

const emptyForm: RedirectionFormData = {
  domain_names: "",
  forward_http_code: 301,
  forward_scheme: "https",
  forward_domain_name: "",
  preserve_path: true,
  ssl_forced: false,
  block_exploits: false,
};

function RedirectionHostsTable({
  hosts,
  loading,
  onReload,
}: {
  hosts: NpmRedirectionHost[];
  loading: boolean;
  onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editHost, setEditHost] = useState<NpmRedirectionHost | null>(null);
  const [form, setForm] = useState<RedirectionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NpmRedirectionHost | null>(
    null
  );
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const openCreate = () => {
    setEditHost(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (h: NpmRedirectionHost) => {
    setEditHost(h);
    setForm({
      domain_names: h.domain_names.join(", "),
      forward_http_code: h.forward_http_code,
      forward_scheme: h.forward_scheme,
      forward_domain_name: h.forward_domain_name,
      preserve_path: h.preserve_path,
      ssl_forced: h.ssl_forced,
      block_exploits: h.block_exploits,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const domainNames = form.domain_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domainNames.length === 0) {
      toast.error("At least one domain name is required");
      return;
    }
    if (!form.forward_domain_name.trim()) {
      toast.error("Forward domain is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        domain_names: domainNames,
        forward_http_code: form.forward_http_code,
        forward_scheme: form.forward_scheme,
        forward_domain_name: form.forward_domain_name.trim(),
        preserve_path: form.preserve_path,
        ssl_forced: form.ssl_forced,
        block_exploits: form.block_exploits,
      };

      if (editHost) {
        await updateNpmRedirectionHost(editHost.id, {
          ...payload,
          enabled: editHost.enabled,
        });
        toast.success("Redirection updated");
      } else {
        await createNpmRedirectionHost(payload);
        toast.success("Redirection created");
      }

      setShowForm(false);
      setEditHost(null);
      setForm(emptyForm);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(id);
    try {
      await deleteNpmRedirectionHost(id);
      toast.success("Redirection deleted");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (h: NpmRedirectionHost) => {
    setToggling(h.id);
    try {
      await updateNpmRedirectionHost(h.id, {
        domain_names: h.domain_names,
        forward_http_code: h.forward_http_code,
        forward_scheme: h.forward_scheme,
        forward_domain_name: h.forward_domain_name,
        preserve_path: h.preserve_path,
        ssl_forced: h.ssl_forced,
        block_exploits: h.block_exploits,
        enabled: !h.enabled,
      });
      toast.success(h.enabled ? "Redirection disabled" : "Redirection enabled");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-slate-500">
          {hosts.length} redirection{hosts.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Redirection
        </Button>
      </div>

      {hosts.length === 0 ? (
        <p className="px-4 pb-6 text-center text-sm text-slate-500">
          No redirection hosts found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Source Domain(s)</th>
                <th className="px-4 py-2">Forward To</th>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">SSL</th>
                <th className="px-4 py-2">Enabled</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-mesh-border hover:bg-mesh-surface-2/55"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {h.domain_names.map((d) => (
                        <span
                          key={d}
                          className="font-mono text-xs text-white"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                    {h.forward_scheme}://{h.forward_domain_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={
                        h.forward_http_code === 301
                          ? "border-blue-500/30 text-blue-400"
                          : "border-amber-500/30 text-amber-400"
                      }
                    >
                      {h.forward_http_code}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {h.ssl_forced ? (
                      <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Switch
                      checked={h.enabled}
                      disabled={toggling === h.id}
                      onCheckedChange={() => handleToggle(h)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                        onClick={() => openEdit(h)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                        disabled={deleting === h.id}
                        onClick={() => setConfirmDelete(h)}
                      >
                        {deleting === h.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditHost(null);
          }
        }}
      >
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editHost ? "Edit Redirection" : "New Redirection"}
            </DialogTitle>
            <DialogDescription>
              {editHost
                ? "Update the redirect rule."
                : "Create a new HTTP redirect rule."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Domain Names */}
            <div className="space-y-1.5">
              <Label htmlFor="redir-domains">
                Source Domain(s){" "}
                <span className="text-xs text-slate-500">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="redir-domains"
                className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                placeholder="old.example.com, legacy.example.com"
                value={form.domain_names}
                onChange={(e) =>
                  setForm({ ...form, domain_names: e.target.value })
                }
              />
            </div>

            {/* Forward Scheme + Domain */}
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="redir-scheme">Scheme</Label>
                <select
                  id="redir-scheme"
                  className="h-9 w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1/95 px-2 text-sm text-white"
                  value={form.forward_scheme}
                  onChange={(e) =>
                    setForm({ ...form, forward_scheme: e.target.value })
                  }
                >
                  <option value="https">https</option>
                  <option value="http">http</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="redir-domain">Forward Domain</Label>
                <Input
                  id="redir-domain"
                  className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                  placeholder="new.example.com"
                  value={form.forward_domain_name}
                  onChange={(e) =>
                    setForm({ ...form, forward_domain_name: e.target.value })
                  }
                />
              </div>
            </div>

            {/* HTTP Code */}
            <div className="space-y-1.5">
              <Label htmlFor="redir-code">HTTP Code</Label>
              <select
                id="redir-code"
                className="h-9 w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1/95 px-2 text-sm text-white"
                value={form.forward_http_code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    forward_http_code: Number(e.target.value),
                  })
                }
              >
                <option value={301}>301 — Permanent Redirect</option>
                <option value={302}>302 — Temporary Redirect</option>
              </select>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="redir-preserve" className="cursor-pointer">
                  Preserve Path
                </Label>
                <Switch
                  id="redir-preserve"
                  checked={form.preserve_path}
                  onCheckedChange={(v) =>
                    setForm({ ...form, preserve_path: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="redir-ssl" className="cursor-pointer">
                  Force SSL
                </Label>
                <Switch
                  id="redir-ssl"
                  checked={form.ssl_forced}
                  onCheckedChange={(v) => setForm({ ...form, ssl_forced: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="redir-exploits" className="cursor-pointer">
                  Block Exploits
                </Label>
                <Switch
                  id="redir-exploits"
                  checked={form.block_exploits}
                  onCheckedChange={(v) =>
                    setForm({ ...form, block_exploits: v })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditHost(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editHost ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Redirection?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The redirect for{" "}
              <span className="font-mono text-white">
                {confirmDelete?.domain_names.join(", ")}
              </span>{" "}
              will be permanently removed from Nginx Proxy Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Streams Table ──────────────────────────────────────

interface StreamFormData {
  incoming_port: number;
  forwarding_host: string;
  forwarding_port: number;
  tcp_forwarding: boolean;
  udp_forwarding: boolean;
}

const emptyStreamForm: StreamFormData = {
  incoming_port: 0,
  forwarding_host: "",
  forwarding_port: 0,
  tcp_forwarding: true,
  udp_forwarding: false,
};

function StreamsTable({
  streams,
  loading,
  onReload,
}: {
  streams: NpmStream[];
  loading: boolean;
  onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editStream, setEditStream] = useState<NpmStream | null>(null);
  const [form, setForm] = useState<StreamFormData>(emptyStreamForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NpmStream | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const openCreate = () => {
    setEditStream(null);
    setForm(emptyStreamForm);
    setShowForm(true);
  };

  const openEdit = (s: NpmStream) => {
    setEditStream(s);
    setForm({
      incoming_port: s.incoming_port,
      forwarding_host: s.forwarding_host,
      forwarding_port: s.forwarding_port,
      tcp_forwarding: s.tcp_forwarding,
      udp_forwarding: s.udp_forwarding,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.forwarding_host.trim()) {
      toast.error("Forwarding host is required");
      return;
    }
    if (form.incoming_port <= 0 || form.incoming_port > 65535) {
      toast.error("Incoming port must be between 1 and 65535");
      return;
    }
    if (form.forwarding_port <= 0 || form.forwarding_port > 65535) {
      toast.error("Forwarding port must be between 1 and 65535");
      return;
    }
    if (!form.tcp_forwarding && !form.udp_forwarding) {
      toast.error("At least one protocol (TCP or UDP) must be enabled");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        incoming_port: form.incoming_port,
        forwarding_host: form.forwarding_host.trim(),
        forwarding_port: form.forwarding_port,
        tcp_forwarding: form.tcp_forwarding,
        udp_forwarding: form.udp_forwarding,
      };

      if (editStream) {
        await updateNpmStream(editStream.id, payload);
        toast.success("Stream updated");
      } else {
        await createNpmStream(payload);
        toast.success("Stream created");
      }

      setShowForm(false);
      setEditStream(null);
      setForm(emptyStreamForm);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(id);
    try {
      await deleteNpmStream(id);
      toast.success("Stream deleted");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (s: NpmStream) => {
    setToggling(s.id);
    try {
      await toggleNpmStream(s.id, !s.enabled);
      toast.success(s.enabled ? "Stream disabled" : "Stream enabled");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-slate-500">
          {streams.length} stream{streams.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Stream
        </Button>
      </div>

      {streams.length === 0 ? (
        <p className="px-4 pb-6 text-center text-sm text-slate-500">
          No streams found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Incoming Port</th>
                <th className="px-4 py-2">Forward To</th>
                <th className="px-4 py-2">Protocol</th>
                <th className="px-4 py-2">Enabled</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-mesh-border hover:bg-mesh-surface-2/55"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-white">
                    :{s.incoming_port}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                    {s.forwarding_host}:{s.forwarding_port}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {s.tcp_forwarding && (
                        <Badge
                          variant="outline"
                          className="border-blue-500/30 text-blue-400"
                        >
                          TCP
                        </Badge>
                      )}
                      {s.udp_forwarding && (
                        <Badge
                          variant="outline"
                          className="border-purple-500/30 text-purple-400"
                        >
                          UDP
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Switch
                      checked={s.enabled}
                      disabled={toggling === s.id}
                      onCheckedChange={() => handleToggle(s)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                        disabled={deleting === s.id}
                        onClick={() => setConfirmDelete(s)}
                      >
                        {deleting === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditStream(null);
          }
        }}
      >
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editStream ? "Edit Stream" : "New Stream"}
            </DialogTitle>
            <DialogDescription>
              {editStream
                ? "Update the TCP/UDP stream proxy."
                : "Create a new TCP/UDP stream proxy."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Incoming Port */}
            <div className="space-y-1.5">
              <Label htmlFor="stream-incoming-port">Incoming Port</Label>
              <Input
                id="stream-incoming-port"
                type="number"
                className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                placeholder="8080"
                value={form.incoming_port || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    incoming_port: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>

            {/* Forwarding Host + Port */}
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="stream-fwd-host">Forwarding Host</Label>
                <Input
                  id="stream-fwd-host"
                  className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                  placeholder="192.168.1.100"
                  value={form.forwarding_host}
                  onChange={(e) =>
                    setForm({ ...form, forwarding_host: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stream-fwd-port">Port</Label>
                <Input
                  id="stream-fwd-port"
                  type="number"
                  className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                  placeholder="8080"
                  value={form.forwarding_port || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      forwarding_port: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
            </div>

            {/* Protocol toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="stream-tcp" className="cursor-pointer">
                  TCP Forwarding
                </Label>
                <Switch
                  id="stream-tcp"
                  checked={form.tcp_forwarding}
                  onCheckedChange={(v) =>
                    setForm({ ...form, tcp_forwarding: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="stream-udp" className="cursor-pointer">
                  UDP Forwarding
                </Label>
                <Switch
                  id="stream-udp"
                  checked={form.udp_forwarding}
                  onCheckedChange={(v) =>
                    setForm({ ...form, udp_forwarding: v })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditStream(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editStream ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Stream?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The stream on port{" "}
              <span className="font-mono text-white">
                :{confirmDelete?.incoming_port}
              </span>{" "}
              forwarding to{" "}
              <span className="font-mono text-white">
                {confirmDelete?.forwarding_host}:
                {confirmDelete?.forwarding_port}
              </span>{" "}
              will be permanently removed from Nginx Proxy Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Dead Hosts Table ────────────────────────────────────

interface DeadHostFormData {
  domain_names: string;
  ssl_forced: boolean;
}

const emptyDeadForm: DeadHostFormData = {
  domain_names: "",
  ssl_forced: false,
};

function DeadHostsTable({
  hosts,
  loading,
  onReload,
}: {
  hosts: NpmDeadHost[];
  loading: boolean;
  onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DeadHostFormData>(emptyDeadForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NpmDeadHost | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const openCreate = () => {
    setForm(emptyDeadForm);
    setShowForm(true);
  };

  const handleSave = async () => {
    const domainNames = form.domain_names
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domainNames.length === 0) {
      toast.error("At least one domain name is required");
      return;
    }

    setSaving(true);
    try {
      await createNpmDeadHost({
        domain_names: domainNames,
        ssl_forced: form.ssl_forced,
      });
      toast.success("Dead host created");
      setShowForm(false);
      setForm(emptyDeadForm);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(id);
    try {
      await deleteNpmDeadHost(id);
      toast.success("Dead host deleted");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-slate-500">
          {hosts.length} dead host{hosts.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Dead Host
        </Button>
      </div>

      {hosts.length === 0 ? (
        <p className="px-4 pb-6 text-center text-sm text-slate-500">
          No dead hosts found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Domain(s)</th>
                <th className="px-4 py-2">SSL</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-mesh-border hover:bg-mesh-surface-2/55"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {h.domain_names.map((d) => (
                        <span
                          key={d}
                          className="font-mono text-xs text-white"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {h.ssl_forced ? (
                      <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={
                        h.enabled
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-slate-700 text-slate-500"
                      }
                    >
                      {h.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                      disabled={deleting === h.id}
                      onClick={() => setConfirmDelete(h)}
                    >
                      {deleting === h.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) setShowForm(false);
        }}
      >
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">New Dead Host</DialogTitle>
            <DialogDescription>
              Create a 404 catch-all page for one or more domains.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dead-domains">
                Domain(s){" "}
                <span className="text-xs text-slate-500">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="dead-domains"
                className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                placeholder="expired.example.com, old.example.com"
                value={form.domain_names}
                onChange={(e) =>
                  setForm({ ...form, domain_names: e.target.value })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="dead-ssl" className="cursor-pointer">
                Force SSL
              </Label>
              <Switch
                id="dead-ssl"
                checked={form.ssl_forced}
                onCheckedChange={(v) => setForm({ ...form, ssl_forced: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Dead Host?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The dead host for{" "}
              <span className="font-mono text-white">
                {confirmDelete?.domain_names.join(", ")}
              </span>{" "}
              will be permanently removed from Nginx Proxy Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Access Lists Table ──────────────────────────────────

interface AccessListFormData {
  name: string;
  satisfy_any: boolean;
  pass_auth: boolean;
  clients: NpmAccessListClient[];
}

const emptyAccessListForm: AccessListFormData = {
  name: "",
  satisfy_any: true,
  pass_auth: false,
  clients: [{ address: "", directive: "allow" }],
};

function AccessListsTable({
  accessLists,
  loading,
  onReload,
}: {
  accessLists: NpmAccessList[];
  loading: boolean;
  onReload: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editList, setEditList] = useState<NpmAccessList | null>(null);
  const [form, setForm] = useState<AccessListFormData>(emptyAccessListForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NpmAccessList | null>(
    null
  );
  const [deleting, setDeleting] = useState<number | null>(null);

  const openCreate = () => {
    setEditList(null);
    setForm(emptyAccessListForm);
    setShowForm(true);
  };

  const openEdit = (al: NpmAccessList) => {
    setEditList(al);
    setForm({
      name: al.name,
      satisfy_any: al.satisfy_any,
      pass_auth: al.pass_auth,
      clients:
        al.clients.length > 0
          ? al.clients.map((c) => ({ address: c.address, directive: c.directive }))
          : [{ address: "", directive: "allow" }],
    });
    setShowForm(true);
  };

  const addClient = () => {
    setForm({
      ...form,
      clients: [...form.clients, { address: "", directive: "allow" }],
    });
  };

  const removeClient = (idx: number) => {
    setForm({
      ...form,
      clients: form.clients.filter((_, i) => i !== idx),
    });
  };

  const updateClient = (
    idx: number,
    field: keyof NpmAccessListClient,
    value: string
  ) => {
    const updated = form.clients.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
    setForm({ ...form, clients: updated });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const clients = form.clients.filter((c) => c.address.trim() !== "");
    if (clients.length === 0) {
      toast.error("At least one IP address/range is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        satisfy_any: form.satisfy_any,
        pass_auth: form.pass_auth,
        clients: clients.map((c) => ({
          address: c.address.trim(),
          directive: c.directive,
        })),
      };

      if (editList) {
        await updateNpmAccessList(editList.id, payload);
        toast.success("Access list updated");
      } else {
        await createNpmAccessList(payload);
        toast.success("Access list created");
      }

      setShowForm(false);
      setEditList(null);
      setForm(emptyAccessListForm);
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setDeleting(id);
    try {
      await deleteNpmAccessList(id);
      toast.success("Access list deleted");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-slate-500">
          {accessLists.length} access list{accessLists.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Access List
        </Button>
      </div>

      {accessLists.length === 0 ? (
        <p className="px-4 pb-6 text-center text-sm text-slate-500">
          No access lists found.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Clients</th>
                <th className="px-4 py-2">Rules</th>
                <th className="px-4 py-2">Satisfy</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accessLists.map((al) => (
                <tr
                  key={al.id}
                  className="border-b border-mesh-border hover:bg-mesh-surface-2/55"
                >
                  <td className="px-4 py-2.5 font-medium text-white">
                    {al.name}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-slate-300"
                    >
                      {al.client_count} rule{al.client_count !== 1 ? "s" : ""}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {al.clients.slice(0, 3).map((c, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={
                            c.directive === "allow"
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-rose-500/30 text-rose-400"
                          }
                        >
                          {c.directive === "allow" ? "allow" : "deny"}{" "}
                          {c.address}
                        </Badge>
                      ))}
                      {al.clients.length > 3 && (
                        <span className="text-xs text-slate-500">
                          +{al.clients.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {al.satisfy_any ? "Any" : "All"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                        onClick={() => openEdit(al)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                        disabled={deleting === al.id}
                        onClick={() => setConfirmDelete(al)}
                      >
                        {deleting === al.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            setEditList(null);
          }
        }}
      >
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editList ? "Edit Access List" : "New Access List"}
            </DialogTitle>
            <DialogDescription>
              {editList
                ? "Update IP-based access rules."
                : "Create a new IP-based access list for proxy hosts."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="al-name">Name</Label>
              <Input
                id="al-name"
                className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                placeholder="e.g. Office IPs Only"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Satisfy Any */}
            <div className="flex items-center justify-between">
              <Label htmlFor="al-satisfy" className="cursor-pointer">
                Satisfy Any{" "}
                <span className="text-xs text-slate-500">
                  (any rule match grants access)
                </span>
              </Label>
              <Switch
                id="al-satisfy"
                checked={form.satisfy_any}
                onCheckedChange={(v) => setForm({ ...form, satisfy_any: v })}
              />
            </div>

            {/* Client Rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>IP Rules</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addClient}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Rule
                </Button>
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {form.clients.map((client, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      className="h-9 w-24 shrink-0 rounded-md border border-mesh-border-strong bg-mesh-surface-1/95 px-2 text-sm text-white"
                      value={client.directive}
                      onChange={(e) =>
                        updateClient(idx, "directive", e.target.value)
                      }
                    >
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </select>
                    <Input
                      className="border-mesh-border-strong bg-mesh-surface-1/95 text-white"
                      placeholder="192.168.1.0/24"
                      value={client.address}
                      onChange={(e) =>
                        updateClient(idx, "address", e.target.value)
                      }
                    />
                    {form.clients.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0 text-slate-400 hover:text-rose-400"
                        onClick={() => removeClient(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditList(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editList ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete Access List?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The access list{" "}
              <span className="font-mono text-white">
                {confirmDelete?.name}
              </span>{" "}
              will be permanently removed from Nginx Proxy Manager. Any proxy
              hosts using it will lose their access restrictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function NpmPage() {
  const [npmTab, setNpmTab] = useHashTab("redirections", ["redirections", "proxy-hosts", "streams", "dead-hosts", "access-lists"]);
  const [status, setStatus] = useState<NpmConnectionStatus | null>(null);
  const [proxyHosts, setProxyHosts] = useState<NpmProxyHost[]>([]);
  const [redirectionHosts, setRedirectionHosts] = useState<
    NpmRedirectionHost[]
  >([]);
  const [streams, setStreams] = useState<NpmStream[]>([]);
  const [deadHosts, setDeadHosts] = useState<NpmDeadHost[]>([]);
  const [accessLists, setAccessLists] = useState<NpmAccessList[]>([]);
  const [loadingProxy, setLoadingProxy] = useState(true);
  const [loadingRedir, setLoadingRedir] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(true);
  const [loadingDead, setLoadingDead] = useState(true);
  const [loadingAccessLists, setLoadingAccessLists] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchNpmStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, []);

  const loadProxyHosts = useCallback(async () => {
    setLoadingProxy(true);
    try {
      const hosts = await fetchNpmProxyHosts();
      setProxyHosts(hosts);
    } catch {
      setProxyHosts([]);
    } finally {
      setLoadingProxy(false);
    }
  }, []);

  const loadRedirectionHosts = useCallback(async () => {
    setLoadingRedir(true);
    try {
      const hosts = await fetchNpmRedirectionHosts();
      setRedirectionHosts(hosts);
    } catch {
      setRedirectionHosts([]);
    } finally {
      setLoadingRedir(false);
    }
  }, []);

  const loadStreams = useCallback(async () => {
    setLoadingStreams(true);
    try {
      const data = await fetchNpmStreams();
      setStreams(data);
    } catch {
      setStreams([]);
    } finally {
      setLoadingStreams(false);
    }
  }, []);

  const loadDeadHosts = useCallback(async () => {
    setLoadingDead(true);
    try {
      const data = await fetchNpmDeadHosts();
      setDeadHosts(data);
    } catch {
      setDeadHosts([]);
    } finally {
      setLoadingDead(false);
    }
  }, []);

  const loadAccessLists = useCallback(async () => {
    setLoadingAccessLists(true);
    try {
      const data = await fetchNpmAccessLists();
      setAccessLists(data);
    } catch {
      setAccessLists([]);
    } finally {
      setLoadingAccessLists(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadProxyHosts();
    loadRedirectionHosts();
    loadStreams();
    loadDeadHosts();
    loadAccessLists();
  }, [loadStatus, loadProxyHosts, loadRedirectionHosts, loadStreams, loadDeadHosts, loadAccessLists]);

  const configured = status?.configured ?? false;
  const reachable = status?.reachable ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
            <Globe className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Nginx Proxy Manager
            </h1>
            <p className="text-sm text-slate-400">
              Manage proxy hosts, redirections, streams, and dead hosts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status !== null && (
            <Badge
              variant="outline"
              className={
                !configured
                  ? "border-slate-700 text-slate-500"
                  : reachable
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-rose-500/30 text-rose-400"
              }
            >
              <span
                className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                  !configured
                    ? "bg-slate-500"
                    : reachable
                      ? "bg-emerald-400"
                      : "bg-rose-400"
                }`}
              />
              {!configured
                ? "Not Configured"
                : reachable
                  ? "Connected"
                  : "Unreachable"}
            </Badge>
          )}
        </div>
      </div>

      {!configured && (
        <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
          <CardContent className="py-8 text-center">
            <Globe className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">
              NPM is not configured. Go to{" "}
              <a href="/settings" className="text-blue-400 hover:underline">
                Settings
              </a>{" "}
              to add your NPM URL and credentials.
            </p>
          </CardContent>
        </Card>
      )}

      {configured && (
        <Tabs value={npmTab} onValueChange={setNpmTab} className="w-full">
          <TabsList className="border-mesh-border-strong bg-mesh-surface-1/95">
            <TabsTrigger value="redirections" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Redirections
              {redirectionHosts.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 bg-slate-800 px-1.5 text-[10px]"
                >
                  {redirectionHosts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="proxy-hosts" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Proxy Hosts
              {proxyHosts.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 bg-slate-800 px-1.5 text-[10px]"
                >
                  {proxyHosts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="streams" className="gap-1.5">
              <Radio className="h-3.5 w-3.5" />
              Streams
              {streams.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 bg-slate-800 px-1.5 text-[10px]"
                >
                  {streams.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dead-hosts" className="gap-1.5">
              <FileX2 className="h-3.5 w-3.5" />
              404 Hosts
              {deadHosts.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 bg-slate-800 px-1.5 text-[10px]"
                >
                  {deadHosts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="access-lists" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Access Lists
              {accessLists.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 bg-slate-800 px-1.5 text-[10px]"
                >
                  {accessLists.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="redirections">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <ArrowRightLeft className="h-4 w-4 text-orange-400" />
                  Redirection Hosts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <RedirectionHostsTable
                  hosts={redirectionHosts}
                  loading={loadingRedir}
                  onReload={loadRedirectionHosts}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="proxy-hosts">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <ExternalLink className="h-4 w-4 text-blue-400" />
                  Proxy Hosts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <ProxyHostsTable hosts={proxyHosts} loading={loadingProxy} accessLists={accessLists} onReload={loadProxyHosts} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="streams">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <Radio className="h-4 w-4 text-violet-400" />
                  TCP/UDP Streams
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <StreamsTable
                  streams={streams}
                  loading={loadingStreams}
                  onReload={loadStreams}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dead-hosts">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <FileX2 className="h-4 w-4 text-rose-400" />
                  Dead Hosts (404 Pages)
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <DeadHostsTable
                  hosts={deadHosts}
                  loading={loadingDead}
                  onReload={loadDeadHosts}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access-lists">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <Shield className="h-4 w-4 text-amber-400" />
                  Access Lists
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <AccessListsTable
                  accessLists={accessLists}
                  loading={loadingAccessLists}
                  onReload={loadAccessLists}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
