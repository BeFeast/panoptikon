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
                    ? "border-[#4ade80]/30 text-[#4ade80]"
                    : "border-[#fb7185]/30 text-[#fb7185]"
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
                  className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
                >
                  {testing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test Connection
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-mesh-border bg-mesh-surface-1 text-mesh-text">
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
                  className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
                >
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync to Caddy
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs border-mesh-border bg-mesh-surface-1 text-mesh-text">
                Push current proxy host configuration to the Caddy reverse proxy
              </TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-mesh-primary text-white hover:bg-mesh-primary"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Host
            </Button>
          </div>
        </div>

        {/* Admin URL Configuration */}
        <Card className="border-mesh-border bg-mesh-surface-1/95">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white">
              Caddy Admin API
            </CardTitle>
            <CardDescription className="text-xs text-mesh-text-mute">
              URL of the Caddy admin endpoint used to push proxy config.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="admin-url" className="text-xs text-mesh-text-dim">
                  Admin URL
                </Label>
                <Input
                  id="admin-url"
                  value={adminUrl}
                  onChange={(e) => setAdminUrl(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                  placeholder="http://localhost:2019"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveUrl}
                disabled={savingUrl || adminUrl.trim() === savedAdminUrl}
                className="bg-mesh-primary text-white hover:bg-mesh-primary"
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
          <Input
            placeholder="Filter by domain or upstream..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-mesh-border bg-mesh-surface-1/95 pl-10 text-white placeholder:text-mesh-text-mute"
          />
        </div>

        {/* Table */}
        <Card className="border-mesh-border bg-mesh-surface-1/95">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="text-mesh-text-dim">Domain</TableHead>
                  <TableHead className="text-mesh-text-dim">Upstream</TableHead>
                  <TableHead className="text-mesh-text-dim">TLS</TableHead>
                  <TableHead className="text-mesh-text-dim">Status</TableHead>
                  <TableHead className="text-right text-mesh-text-dim">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered === null ? (
                  // Loading skeleton
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-mesh-border-strong">
                      <TableCell>
                        <Skeleton className="h-4 w-40 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-mesh-surface-1" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow className="border-mesh-border-strong hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="py-12 text-center"
                    >
                      {search ? (
                        <span className="text-mesh-text-mute">No hosts match your filter.</span>
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
                      className="border-mesh-border hover:bg-mesh-surface-2/55"
                    >
                      <TableCell className="font-medium text-white">
                        <a
                          href={`https://${host.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-mesh-primary"
                        >
                          {host.domain}
                        </a>
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            host.tls_enabled
                              ? "border-[#4ade80]/30 text-[#4ade80]"
                              : "border-mesh-border-strong text-mesh-text-mute"
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
                            className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(host)}
                            className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
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
          <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Proxy Host
              </AlertDialogTitle>
              <AlertDialogDescription className="text-mesh-text-dim">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.domain}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
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
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Proxy Host" : "Add Proxy Host"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs text-mesh-text-dim">
              Domain
            </Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="app.example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-scheme"
                className="text-xs text-mesh-text-dim"
              >
                Scheme
              </Label>
              <select
                id="forward-scheme"
                value={forwardScheme}
                onChange={(e) => setForwardScheme(e.target.value)}
                className="flex h-9 w-full rounded-md border border-mesh-border bg-mesh-surface-1/95 px-3 py-1 text-sm text-white"
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-host"
                className="text-xs text-mesh-text-dim"
              >
                Host
              </Label>
              <Input
                id="forward-host"
                value={forwardHost}
                onChange={(e) => setForwardHost(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="10.0.0.5"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-port"
                className="text-xs text-mesh-text-dim"
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
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
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
            <Label htmlFor="tls-enabled" className="text-sm text-mesh-text">
              Enable TLS (auto HTTPS via Caddy)
            </Label>
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-mesh-primary text-white hover:bg-mesh-primary"
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
