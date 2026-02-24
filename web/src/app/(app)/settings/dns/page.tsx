"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  ShieldOff,
  Download,
  Search,
  FileText,
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
import {
  fetchDnsBlocklists,
  createDnsBlocklist,
  updateDnsBlocklist,
  deleteDnsBlocklist,
  syncDnsBlocklist,
  fetchDnsBlocklistStats,
  fetchDnsBlocklistConfig,
  fetchDnsDomainOverrides,
  createDnsDomainOverride,
  deleteDnsBlocklistOverride,
} from "@/lib/api";
import type {
  DnsBlocklist,
  DnsBlocklistStats,
  DnsDomainOverrideEntry,
} from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function DnsBlocklistsPage() {
  const [blocklists, setBlocklists] = useState<DnsBlocklist[] | null>(null);
  const [stats, setStats] = useState<DnsBlocklistStats | null>(null);
  const [overrides, setOverrides] = useState<DnsDomainOverrideEntry[] | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DnsBlocklist | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configText, setConfigText] = useState("");
  const [configCount, setConfigCount] = useState(0);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [pendingDeleteOverride, setPendingDeleteOverride] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    try {
      const [blocklistData, statsData, overrideData] = await Promise.all([
        fetchDnsBlocklists(),
        fetchDnsBlocklistStats(),
        fetchDnsDomainOverrides(),
      ]);
      setBlocklists(blocklistData);
      setStats(statsData);
      setOverrides(overrideData);
    } catch {
      toast.error("Failed to load DNS blocklist data");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!blocklists) return null;
    if (!search.trim()) return blocklists;
    const q = search.toLowerCase();
    return blocklists.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    );
  }, [blocklists, search]);

  async function handleToggle(bl: DnsBlocklist) {
    try {
      const updated = await updateDnsBlocklist(bl.id, {
        enabled: !bl.enabled,
      });
      setBlocklists(
        (prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? null
      );
      toast.success(`${bl.name} ${updated.enabled ? "enabled" : "disabled"}`);
      // Refresh stats.
      const s = await fetchDnsBlocklistStats();
      setStats(s);
    } catch {
      toast.error("Failed to toggle blocklist");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteDnsBlocklist(pendingDelete.id);
      setBlocklists(
        (prev) => prev?.filter((b) => b.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.name}`);
      const s = await fetchDnsBlocklistStats();
      setStats(s);
    } catch {
      toast.error("Failed to delete blocklist");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleSync(bl: DnsBlocklist) {
    setSyncingId(bl.id);
    try {
      const result = await syncDnsBlocklist(bl.id);
      toast.success(result.message);
      // Reload to get updated domain_count.
      await load();
    } catch {
      toast.error(`Failed to sync ${bl.name}`);
    } finally {
      setSyncingId(null);
    }
  }

  async function handleShowConfig() {
    setShowConfig(true);
    try {
      const data = await fetchDnsBlocklistConfig();
      setConfigText(data.config);
      setConfigCount(data.domain_count);
    } catch {
      toast.error("Failed to generate config");
      setShowConfig(false);
    }
  }

  async function handleDeleteOverride() {
    if (!pendingDeleteOverride) return;
    try {
      await deleteDnsBlocklistOverride(pendingDeleteOverride);
      setOverrides(
        (prev) =>
          prev?.filter((o) => o.domain !== pendingDeleteOverride) ?? null
      );
      toast.success(`Removed override for ${pendingDeleteOverride}`);
      const s = await fetchDnsBlocklistStats();
      setStats(s);
    } catch {
      toast.error("Failed to delete override");
    } finally {
      setPendingDeleteOverride(null);
    }
  }

  function handleBlocklistSaved() {
    setShowAdd(false);
    load();
  }

  function handleOverrideSaved() {
    setShowOverrideDialog(false);
    load();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-white">
              DNS Blocklists
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowConfig}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              View Config
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOverrideDialog(true)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Add Override
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Blocklist
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Total Blocklists</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {stats ? stats.total_blocklists : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Blocked Domains</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {stats ? stats.total_blocked_domains.toLocaleString() : <Skeleton className="h-7 w-20 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Whitelisted</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {stats ? stats.whitelist_count : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400">Blacklisted</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {stats ? stats.blacklist_count : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter by name or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
          />
        </div>

        {/* Blocklists Table */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">Blocklists</CardTitle>
            <CardDescription className="text-slate-400">
              Manage DNS blocklist sources for ad and tracker blocking via
              Unbound local-zone.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Name</TableHead>
                  <TableHead className="text-slate-400">Domains</TableHead>
                  <TableHead className="text-slate-400">
                    Last Updated
                  </TableHead>
                  <TableHead className="text-slate-400">
                    Auto-Refresh
                  </TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-slate-800" />
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
                      colSpan={6}
                      className="py-12 text-center text-slate-500"
                    >
                      {search
                        ? "No blocklists match your filter."
                        : "No blocklists configured yet. Add one to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((bl) => (
                    <TableRow
                      key={bl.id}
                      className="border-slate-800 hover:bg-slate-800/30"
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-white">{bl.name}</p>
                          <p className="truncate text-xs text-slate-500 max-w-[280px]">
                            {bl.url}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {bl.domain_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {bl.last_updated_at
                          ? new Date(bl.last_updated_at + "Z").toLocaleString()
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">
                        {bl.auto_refresh_hours
                          ? `${bl.auto_refresh_hours}h`
                          : "Manual"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={bl.enabled}
                          onCheckedChange={() => handleToggle(bl)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSync(bl)}
                            disabled={syncingId === bl.id}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            title="Download & sync"
                          >
                            {syncingId === bl.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(bl)}
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

        {/* Domain Overrides */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">Domain Overrides</CardTitle>
            <CardDescription className="text-slate-400">
              Whitelist or blacklist specific domains to override blocklist
              rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Domain</TableHead>
                  <TableHead className="text-slate-400">Action</TableHead>
                  <TableHead className="text-slate-400">Added</TableHead>
                  <TableHead className="text-right text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides === null ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell>
                        <Skeleton className="h-4 w-40 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-10 bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : overrides.length === 0 ? (
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-slate-500"
                    >
                      No domain overrides configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  overrides.map((o) => (
                    <TableRow
                      key={o.domain}
                      className="border-slate-800 hover:bg-slate-800/30"
                    >
                      <TableCell className="font-mono text-sm text-white">
                        {o.domain}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            o.action === "whitelist"
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-rose-500/30 text-rose-400"
                          }
                        >
                          {o.action === "whitelist" ? (
                            <ShieldOff className="mr-1 h-3 w-3" />
                          ) : (
                            <Shield className="mr-1 h-3 w-3" />
                          )}
                          {o.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">
                        {new Date(o.created_at + "Z").toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteOverride(o.domain)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Blocklist Dialog */}
        <AddBlocklistDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          onSaved={handleBlocklistSaved}
        />

        {/* Add Override Dialog */}
        <AddOverrideDialog
          open={showOverrideDialog}
          onOpenChange={setShowOverrideDialog}
          onSaved={handleOverrideSaved}
        />

        {/* Config Preview Dialog */}
        <Dialog open={showConfig} onOpenChange={setShowConfig}>
          <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="text-white">
                Generated Unbound Config ({configCount.toLocaleString()} domains)
              </DialogTitle>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 font-mono">
              {configText || "Loading..."}
            </pre>
          </DialogContent>
        </Dialog>

        {/* Delete Blocklist Confirmation */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Blocklist
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.name}
                </span>
                ? This will remove all associated blocked domains.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
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

        {/* Delete Override Confirmation */}
        <AlertDialog
          open={pendingDeleteOverride !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteOverride(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Remove Override
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Remove the override for{" "}
                <span className="font-mono font-medium text-white">
                  {pendingDeleteOverride}
                </span>
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteOverride}
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Add Blocklist Dialog ────────────────────────────────

function AddBlocklistDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [autoRefresh, setAutoRefresh] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setAutoRefresh("");
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!url.trim()) {
      setFormError("URL is required");
      return;
    }

    setLoading(true);
    try {
      const hours = autoRefresh ? parseInt(autoRefresh, 10) : null;
      if (autoRefresh && (isNaN(hours!) || hours! < 1)) {
        setFormError("Auto-refresh must be a positive number of hours");
        setLoading(false);
        return;
      }
      await createDnsBlocklist({
        name: name.trim(),
        url: url.trim(),
        auto_refresh_hours: hours,
      });
      toast.success(`Created blocklist "${name.trim()}"`);
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create blocklist"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Blocklist</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bl-name" className="text-xs text-slate-400">
              Name
            </Label>
            <Input
              id="bl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="StevenBlack Hosts"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bl-url" className="text-xs text-slate-400">
              URL
            </Label>
            <Input
              id="bl-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bl-refresh" className="text-xs text-slate-400">
              Auto-Refresh Interval (hours, optional)
            </Label>
            <Input
              id="bl-refresh"
              type="number"
              min={1}
              value={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="24"
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <p className="text-xs text-rose-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
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
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Override Dialog ─────────────────────────────────

function AddOverrideDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [action, setAction] = useState<"whitelist" | "blacklist">("whitelist");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDomain("");
      setAction("whitelist");
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!domain.trim()) {
      setFormError("Domain is required");
      return;
    }

    setLoading(true);
    try {
      await createDnsDomainOverride({
        domain: domain.trim().toLowerCase(),
        action,
      });
      toast.success(
        `${action === "whitelist" ? "Whitelisted" : "Blacklisted"} ${domain.trim()}`
      );
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create override"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Domain Override</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="or-domain" className="text-xs text-slate-400">
              Domain
            </Label>
            <Input
              id="or-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Action</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={action === "whitelist" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("whitelist")}
                className={
                  action === "whitelist"
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border-slate-800 text-slate-300 hover:bg-slate-800"
                }
              >
                <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                Whitelist
              </Button>
              <Button
                type="button"
                variant={action === "blacklist" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("blacklist")}
                className={
                  action === "blacklist"
                    ? "bg-rose-600 text-white hover:bg-rose-500"
                    : "border-slate-800 text-slate-300 hover:bg-slate-800"
                }
              >
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Blacklist
              </Button>
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <p className="text-xs text-rose-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
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
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
