"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
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
  fetchNpmRedirectionHosts,
  createNpmRedirectionHost,
  updateNpmRedirectionHost,
  deleteNpmRedirectionHost,
} from "@/lib/api";
import type {
  NpmConnectionStatus,
  NpmProxyHost,
  NpmRedirectionHost,
} from "@/lib/types";

// ─── Proxy Hosts Table ──────────────────────────────────

function ProxyHostsTable({
  hosts,
  loading,
}: {
  hosts: NpmProxyHost[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-slate-800" />
        ))}
      </div>
    );
  }

  if (hosts.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        No proxy hosts found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase text-slate-500">
            <th className="px-4 py-2">Domain(s)</th>
            <th className="px-4 py-2">Forward To</th>
            <th className="px-4 py-2">SSL</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((h) => (
            <tr
              key={h.id}
              className="border-b border-slate-800/50 hover:bg-slate-800/30"
            >
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {h.domain_names.map((d) => (
                    <span key={d} className="font-mono text-xs text-white">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              <tr className="border-b border-slate-800 text-left text-xs uppercase text-slate-500">
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
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
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
        <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-lg">
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
                className="border-slate-800 bg-slate-950 text-white"
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
                  className="h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-2 text-sm text-white"
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
                  className="border-slate-800 bg-slate-950 text-white"
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
                className="h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-2 text-sm text-white"
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
        <AlertDialogContent className="border-slate-800 bg-slate-900">
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

// ─── Main Page ──────────────────────────────────────────

export default function NpmPage() {
  const [status, setStatus] = useState<NpmConnectionStatus | null>(null);
  const [proxyHosts, setProxyHosts] = useState<NpmProxyHost[]>([]);
  const [redirectionHosts, setRedirectionHosts] = useState<
    NpmRedirectionHost[]
  >([]);
  const [loadingProxy, setLoadingProxy] = useState(true);
  const [loadingRedir, setLoadingRedir] = useState(true);

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

  useEffect(() => {
    loadStatus();
    loadProxyHosts();
    loadRedirectionHosts();
  }, [loadStatus, loadProxyHosts, loadRedirectionHosts]);

  const configured = status?.configured ?? false;
  const reachable = status?.reachable ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
            <Globe className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Nginx Proxy Manager
            </h1>
            <p className="text-sm text-slate-400">
              Manage proxy hosts and HTTP redirections
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
        <Card className="border-slate-800 bg-slate-900/50">
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
        <Tabs defaultValue="redirections" className="w-full">
          <TabsList className="border-slate-800 bg-slate-900">
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
          </TabsList>

          <TabsContent value="redirections">
            <Card className="border-slate-800 bg-slate-900/50">
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
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                  <ExternalLink className="h-4 w-4 text-blue-400" />
                  Proxy Hosts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <ProxyHostsTable hosts={proxyHosts} loading={loadingProxy} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
