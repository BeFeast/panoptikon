"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Zap,
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
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
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { EmptyState } from "@/components/EmptyState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchCaddyStatus,
  fetchCaddyProxyHosts,
  createCaddyProxyHost,
  updateCaddyProxyHost,
  deleteCaddyProxyHost,
  toggleCaddyProxyHost,
  syncCaddyConfig,
  testCaddyConnection,
  fetchSettings,
  updateSettings,
} from "@/lib/api";
import type { CaddyProxyHost, CaddyStatus } from "@/lib/types";
import { toast } from "sonner";

export default function CaddyPage() {
  const [hosts, setHosts] = useState<CaddyProxyHost[] | null>(null);
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null);
  const [search, setSearch] = useState("");
  const [editHost, setEditHost] = useState<CaddyProxyHost | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaddyProxyHost | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [adminUrl, setAdminUrl] = useState("http://localhost:2019");
  const [savedAdminUrl, setSavedAdminUrl] = useState("http://localhost:2019");
  const [savingUrl, setSavingUrl] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statusData, hostsData, settingsData] = await Promise.all([
        fetchCaddyStatus(),
        fetchCaddyProxyHosts(),
        fetchSettings(),
      ]);
      setCaddyStatus(statusData);
      setHosts(hostsData);
      const url = settingsData.caddy_admin_url || "http://localhost:2019";
      setAdminUrl(url);
      setSavedAdminUrl(url);
    } catch {
      toast.error("Failed to load proxy hosts");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!hosts) return null;
    if (!search.trim()) return hosts;
    const q = search.toLowerCase();
    return hosts.filter(
      (h) =>
        h.domain.toLowerCase().includes(q) ||
        h.forward_host.toLowerCase().includes(q)
    );
  }, [hosts, search]);

  async function handleToggle(host: CaddyProxyHost) {
    try {
      const updated = await toggleCaddyProxyHost(host.id, !host.enabled);
      setHosts(
        (prev) => prev?.map((h) => (h.id === updated.id ? updated : h)) ?? null
      );
      toast.success(
        `${host.domain} ${updated.enabled ? "enabled" : "disabled"}`
      );
    } catch {
      toast.error("Failed to toggle proxy host");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteCaddyProxyHost(pendingDelete.id);
      setHosts(
        (prev) => prev?.filter((h) => h.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.domain}`);
    } catch {
      toast.error("Failed to delete proxy host");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncCaddyConfig();
      toast.success("Caddy config synced");
    } catch {
      toast.error("Failed to sync config to Caddy");
    } finally {
      setSyncing(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testCaddyConnection();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      // Refresh status after test.
      const statusData = await fetchCaddyStatus();
      setCaddyStatus(statusData);
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveUrl() {
    setSavingUrl(true);
    try {
      await updateSettings({ caddy_admin_url: adminUrl.trim() });
      setSavedAdminUrl(adminUrl.trim());
      toast.success("Caddy admin URL saved");
    } catch {
      toast.error("Failed to save admin URL");
    } finally {
      setSavingUrl(false);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditHost(null);
    load();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Caddy Reverse Proxy
            </h1>
            <HelpTooltip text="Manage reverse-proxy hosts that Caddy serves. Add domains, point them to internal services, and enable automatic HTTPS." />
          </div>
          <div className="flex items-center gap-2">
            {caddyStatus && (
              <Badge
                variant="outline"
                className={
                  caddyStatus.reachable
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-rose-500/30 text-rose-400"
                }
              >
                {caddyStatus.reachable ? (
                  <CheckCircle className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {caddyStatus.reachable ? "Connected" : "Unreachable"}
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="border-slate-800 text-slate-300 hover:bg-cyan-950/35"
                >
                  {testing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test Connection
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Verify that Panoptikon can reach the Caddy admin API
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className="border-slate-800 text-slate-300 hover:bg-cyan-950/35"
                >
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync to Caddy
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
                Push current proxy host configuration to the Caddy reverse proxy
              </TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Host
            </Button>
          </div>
        </div>

        {/* Admin URL Configuration */}
        <Card className="border-cyan-900/45 bg-[#0b1220]/72">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white">
              Caddy Admin API
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              URL of the Caddy admin endpoint used to push proxy config.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="admin-url" className="text-xs text-slate-400">
                  Admin URL
                </Label>
                <Input
                  id="admin-url"
                  value={adminUrl}
                  onChange={(e) => setAdminUrl(e.target.value)}
                  className="border-cyan-900/45 bg-[#0b1220]/72 text-white placeholder:text-slate-600"
                  placeholder="http://localhost:2019"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveUrl}
                disabled={savingUrl || adminUrl.trim() === savedAdminUrl}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {savingUrl && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter by domain or upstream..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-cyan-900/45 bg-[#0b1220]/72 pl-10 text-white placeholder:text-slate-600"
          />
        </div>

        {/* Table */}
        <Card className="border-cyan-900/45 bg-[#0b1220]/72">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Domain</TableHead>
                  <TableHead className="text-slate-400">Upstream</TableHead>
                  <TableHead className="text-slate-400">TLS</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered === null ? (
                  // Loading skeleton
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell>
                        <Skeleton className="h-4 w-40 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="py-12 text-center"
                    >
                      {search ? (
                        <span className="text-slate-500">No hosts match your filter.</span>
                      ) : (
                        <EmptyState
                          icon={Globe}
                          title="No proxy hosts configured yet"
                          description="Click &quot;Add Host&quot; to create your first reverse-proxy entry. Make sure the Caddy admin URL is set above."
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((host) => (
                    <TableRow
                      key={host.id}
                      className="border-slate-800 hover:bg-cyan-950/35"
                    >
                      <TableCell className="font-medium text-white">
                        <a
                          href={`https://${host.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-blue-400"
                        >
                          {host.domain}
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            host.tls_enabled
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-slate-700 text-slate-500"
                          }
                        >
                          {host.tls_enabled ? "HTTPS" : "HTTP"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={host.enabled}
                          onCheckedChange={() => handleToggle(host)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditHost(host)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(host)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <ProxyHostFormDialog
          open={showAdd || editHost !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAdd(false);
              setEditHost(null);
            }
          }}
          existing={editHost}
          onSaved={handleSaved}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Proxy Host
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.domain}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-cyan-950/35">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Add/Edit Form Dialog ───────────────────────────────────

function ProxyHostFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: CaddyProxyHost | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [domain, setDomain] = useState("");
  const [forwardHost, setForwardHost] = useState("");
  const [forwardPort, setForwardPort] = useState("80");
  const [forwardScheme, setForwardScheme] = useState("http");
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setDomain(existing.domain);
        setForwardHost(existing.forward_host);
        setForwardPort(String(existing.forward_port));
        setForwardScheme(existing.forward_scheme);
        setTlsEnabled(existing.tls_enabled);
      } else {
        setDomain("");
        setForwardHost("");
        setForwardPort("80");
        setForwardScheme("http");
        setTlsEnabled(false);
      }
      setFormError(null);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!domain.trim()) {
      setFormError("Domain is required");
      return;
    }
    if (!forwardHost.trim()) {
      setFormError("Forward host is required");
      return;
    }
    const port = parseInt(forwardPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setFormError("Port must be between 1 and 65535");
      return;
    }

    setLoading(true);
    try {
      const body = {
        domain: domain.trim(),
        forward_host: forwardHost.trim(),
        forward_port: port,
        forward_scheme: forwardScheme,
        tls_enabled: tlsEnabled,
      };
      if (isEdit) {
        await updateCaddyProxyHost(existing.id, body);
        toast.success(`Updated ${body.domain}`);
      } else {
        await createCaddyProxyHost(body);
        toast.success(`Created ${body.domain}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save proxy host"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-cyan-900/45 bg-[#0b1220]/72 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Proxy Host" : "Add Proxy Host"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs text-slate-400">
              Domain
            </Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="border-cyan-900/45 bg-[#0b1220]/72 text-white placeholder:text-slate-600"
              placeholder="app.example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-scheme"
                className="text-xs text-slate-400"
              >
                Scheme
              </Label>
              <select
                id="forward-scheme"
                value={forwardScheme}
                onChange={(e) => setForwardScheme(e.target.value)}
                className="flex h-9 w-full rounded-md border border-cyan-900/45 bg-[#0b1220]/72 px-3 py-1 text-sm text-white"
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-host"
                className="text-xs text-slate-400"
              >
                Host
              </Label>
              <Input
                id="forward-host"
                value={forwardHost}
                onChange={(e) => setForwardHost(e.target.value)}
                className="border-cyan-900/45 bg-[#0b1220]/72 text-white placeholder:text-slate-600"
                placeholder="10.0.0.5"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-port"
                className="text-xs text-slate-400"
              >
                Port
              </Label>
              <Input
                id="forward-port"
                type="number"
                min={1}
                max={65535}
                value={forwardPort}
                onChange={(e) => setForwardPort(e.target.value)}
                className="border-cyan-900/45 bg-[#0b1220]/72 text-white placeholder:text-slate-600"
                placeholder="80"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="tls-enabled"
              checked={tlsEnabled}
              onCheckedChange={setTlsEnabled}
            />
            <Label htmlFor="tls-enabled" className="text-sm text-slate-300">
              Enable TLS (auto HTTPS via Caddy)
            </Label>
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-800 text-slate-300 hover:bg-cyan-950/35"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {loading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
