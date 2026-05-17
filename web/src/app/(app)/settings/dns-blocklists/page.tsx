"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Download,
  Shield,
  ShieldOff,
  Clock,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  toggleDnsBlocklist,
  downloadDnsBlocklist,
  fetchDnsBlocklistStats,
  fetchDnsBlocklistOverrides,
  createDnsBlocklistOverride,
  deleteDnsBlocklistOverride,
  fetchDnsUnboundConfig,
} from "@/lib/api";
import type {
  DnsBlocklist,
  DnsBlocklistStats,
  DnsBlocklistDomainOverride,
} from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function DnsBlocklistsPage() {
  const [blocklistTab, setBlocklistTab] = useHashTab("blocklists", ["blocklists", "overrides"]);
  const [blocklists, setBlocklists] = useState<DnsBlocklist[] | null>(null);
  const [statsData, setStatsData] = useState<DnsBlocklistStats | null>(null);
  const [overrides, setOverrides] = useState<DnsBlocklistDomainOverride[] | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<DnsBlocklist | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DnsBlocklist | null>(null);
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [pendingDeleteOverride, setPendingDeleteOverride] = useState<DnsBlocklistDomainOverride | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [unboundConfig, setUnboundConfig] = useState<string | null>(null);

  const loadBlocklists = useCallback(async () => {
    try {
      const [lists, stats] = await Promise.all([
        fetchDnsBlocklists(),
        fetchDnsBlocklistStats(),
      ]);
      setBlocklists(lists);
      setStatsData(stats);
    } catch {
      toast.error("Failed to load blocklists");
    }
  }, []);

  const loadOverrides = useCallback(async () => {
    try {
      const data = await fetchDnsBlocklistOverrides();
      setOverrides(data);
    } catch {
      toast.error("Failed to load domain overrides");
    }
  }, []);

  useEffect(() => {
    loadBlocklists();
    loadOverrides();
    const interval = setInterval(() => {
      loadBlocklists();
      loadOverrides();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadBlocklists, loadOverrides]);

  const filteredLists = useMemo(() => {
    if (!blocklists) return null;
    if (!search.trim()) return blocklists;
    const q = search.toLowerCase();
    return blocklists.filter(
      (bl) =>
        bl.name.toLowerCase().includes(q) ||
        bl.url.toLowerCase().includes(q)
    );
  }, [blocklists, search]);

  const filteredOverrides = useMemo(() => {
    if (!overrides) return null;
    if (!search.trim()) return overrides;
    const q = search.toLowerCase();
    return overrides.filter((o) => o.domain.toLowerCase().includes(q));
  }, [overrides, search]);

  async function handleToggle(bl: DnsBlocklist) {
    try {
      const updated = await toggleDnsBlocklist(bl.id, !bl.enabled);
      setBlocklists(
        (prev) => prev?.map((b) => (b.id === updated.id ? updated : b)) ?? null
      );
      toast.success(`${bl.name} ${updated.enabled ? "enabled" : "disabled"}`);
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
      loadBlocklists();
    } catch {
      toast.error("Failed to delete blocklist");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleDownload(bl: DnsBlocklist) {
    setDownloading(bl.id);
    try {
      const result = await downloadDnsBlocklist(bl.id);
      if (result.success) {
        toast.success(`${bl.name}: ${result.message}`);
        loadBlocklists();
      } else {
        toast.error(`${bl.name}: ${result.message}`);
      }
    } catch {
      toast.error(`Failed to download ${bl.name}`);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadAll() {
    if (!blocklists) return;
    const enabled = blocklists.filter((bl) => bl.enabled);
    if (enabled.length === 0) {
      toast.error("No enabled blocklists to download");
      return;
    }
    for (const bl of enabled) {
      setDownloading(bl.id);
      try {
        const result = await downloadDnsBlocklist(bl.id);
        if (result.success) {
          toast.success(`${bl.name}: ${result.message}`);
        } else {
          toast.error(`${bl.name}: ${result.message}`);
        }
      } catch {
        toast.error(`Failed to download ${bl.name}`);
      }
    }
    setDownloading(null);
    loadBlocklists();
  }

  async function handleDeleteOverride() {
    if (!pendingDeleteOverride) return;
    try {
      await deleteDnsBlocklistOverride(pendingDeleteOverride.id);
      setOverrides(
        (prev) =>
          prev?.filter((o) => o.id !== pendingDeleteOverride.id) ?? null
      );
      toast.success(`Removed override for ${pendingDeleteOverride.domain}`);
    } catch {
      toast.error("Failed to delete override");
    } finally {
      setPendingDeleteOverride(null);
    }
  }

  async function handleShowConfig() {
    setShowConfig(true);
    try {
      const result = await fetchDnsUnboundConfig();
      setUnboundConfig(result.config);
    } catch {
      toast.error("Failed to generate Unbound config");
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditItem(null);
    loadBlocklists();
  }

  function handleOverrideSaved() {
    setShowAddOverride(false);
    loadOverrides();
    loadBlocklists();
  }

  function formatDate(date: string | null): string {
    if (!date) return "Never";
    return new Date(date + "Z").toLocaleString();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-900/45 text-slate-400 transition-colors hover:bg-cyan-950/35 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              DNS Blocklists
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowConfig}
              className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              View Config
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAll}
              disabled={downloading !== null}
              className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
            >
              {downloading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh All
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

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Blocked Domains</p>
              <p className="text-2xl font-semibold text-white">
                {statsData ? statsData.total_blocked_domains.toLocaleString() : <Skeleton className="h-7 w-20 bg-cyan-950/35" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Active Lists</p>
              <p className="text-2xl font-semibold text-white">
                {statsData ? `${statsData.enabled_blocklists} / ${statsData.total_blocklists}` : <Skeleton className="h-7 w-16 bg-cyan-950/35" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Whitelisted</p>
              <p className="text-2xl font-semibold text-white">
                {statsData ? statsData.whitelist_count : <Skeleton className="h-7 w-10 bg-cyan-950/35" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Last Updated</p>
              <p className="text-sm font-medium text-white">
                {statsData ? formatDate(statsData.last_updated) : <Skeleton className="h-5 w-32 bg-cyan-950/35" />}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter blocklists or domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-cyan-900/45 bg-[#08111e] pl-10 text-white placeholder:text-slate-600"
          />
        </div>

        {/* Tabs */}
        <Tabs value={blocklistTab} onValueChange={setBlocklistTab}>
          <TabsList className="border-cyan-900/45 bg-[#0b1220]/72">
            <TabsTrigger value="blocklists" className="data-[state=active]:bg-cyan-950/35">
              Blocklists
            </TabsTrigger>
            <TabsTrigger value="overrides" className="data-[state=active]:bg-cyan-950/35">
              Overrides
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blocklists" className="mt-4">
            <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-900/45 hover:bg-transparent">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">Domains</TableHead>
                      <TableHead className="text-slate-400">Last Updated</TableHead>
                      <TableHead className="text-slate-400">Refresh</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-right text-slate-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLists === null ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i} className="border-cyan-900/45">
                          <TableCell><Skeleton className="h-4 w-32 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20 bg-cyan-950/35" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredLists.length === 0 ? (
                      <TableRow className="border-cyan-900/45 hover:bg-transparent">
                        <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                          {search ? "No blocklists match your filter." : "No blocklists configured yet. Add one to start blocking ads and trackers."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLists.map((bl) => (
                        <TableRow key={bl.id} className="border-cyan-900/45 hover:bg-cyan-950/35">
                          <TableCell>
                            <div className="min-w-0">
                              <p className="font-medium text-white">{bl.name}</p>
                              <p className="truncate text-xs text-slate-500 max-w-[240px]">{bl.url}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {bl.domain_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            {formatDate(bl.last_downloaded_at)}
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {bl.refresh_interval_hours}h
                            </div>
                          </TableCell>
                          <TableCell>
                            {bl.last_error ? (
                              <Badge variant="outline" className="border-rose-500/30 text-rose-400">
                                <AlertCircle className="mr-1 h-3 w-3" />
                                Error
                              </Badge>
                            ) : (
                              <Switch
                                checked={bl.enabled}
                                onCheckedChange={() => handleToggle(bl)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(bl)}
                                disabled={downloading === bl.id}
                                className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                                title="Download / refresh"
                              >
                                {downloading === bl.id ? (
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
          </TabsContent>

          <TabsContent value="overrides" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setShowAddOverride(true)}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Override
              </Button>
            </div>
            <Card className="border-cyan-900/45 bg-[#0b1220]/72 shadow-[0_14px_34px_-24px_rgba(8,145,178,0.42)]">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-900/45 hover:bg-transparent">
                      <TableHead className="text-slate-400">Domain</TableHead>
                      <TableHead className="text-slate-400">Action</TableHead>
                      <TableHead className="text-slate-400">Added</TableHead>
                      <TableHead className="text-right text-slate-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOverrides === null ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <TableRow key={i} className="border-cyan-900/45">
                          <TableCell><Skeleton className="h-4 w-40 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24 bg-cyan-950/35" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-10 bg-cyan-950/35" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredOverrides.length === 0 ? (
                      <TableRow className="border-cyan-900/45 hover:bg-transparent">
                        <TableCell colSpan={4} className="py-12 text-center text-slate-500">
                          {search ? "No overrides match your filter." : "No domain overrides configured. Whitelist domains to allow them through, or blacklist specific domains."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOverrides.map((ovr) => (
                        <TableRow key={ovr.id} className="border-cyan-900/45 hover:bg-cyan-950/35">
                          <TableCell className="font-medium text-white font-mono text-sm">
                            {ovr.domain}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                ovr.action === "whitelist"
                                  ? "border-emerald-500/30 text-emerald-400"
                                  : "border-rose-500/30 text-rose-400"
                              }
                            >
                              {ovr.action === "whitelist" ? (
                                <Shield className="mr-1 h-3 w-3" />
                              ) : (
                                <ShieldOff className="mr-1 h-3 w-3" />
                              )}
                              {ovr.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            {formatDate(ovr.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDeleteOverride(ovr)}
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
          </TabsContent>
        </Tabs>

        {/* Add/Edit Blocklist Dialog */}
        <BlocklistFormDialog
          open={showAdd || editItem !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAdd(false);
              setEditItem(null);
            }
          }}
          existing={editItem}
          onSaved={handleSaved}
        />

        {/* Add Override Dialog */}
        <OverrideFormDialog
          open={showAddOverride}
          onOpenChange={setShowAddOverride}
          onSaved={handleOverrideSaved}
        />

        {/* Delete Blocklist Confirmation */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Blocklist
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">{pendingDelete?.name}</span>?
                This will remove all cached domains from this list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35">
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
          <AlertDialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Remove Override
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Remove the {pendingDeleteOverride?.action} override for{" "}
                <span className="font-medium text-white font-mono">
                  {pendingDeleteOverride?.domain}
                </span>
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35">
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

        {/* Unbound Config Dialog */}
        <Dialog open={showConfig} onOpenChange={setShowConfig}>
          <DialogContent className="border-cyan-900/45 bg-[#0b1220]/72 sm:max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="text-white">
                Unbound Configuration
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Copy this config to your Unbound server&apos;s include directory to enable DNS blocking.
              </p>
              {unboundConfig === null ? (
                <Skeleton className="h-64 w-full bg-cyan-950/35" />
              ) : (
                <pre className="max-h-96 overflow-auto rounded-md border border-cyan-900/45 bg-[#08111e] p-4 text-xs text-slate-300 font-mono">
                  {unboundConfig}
                </pre>
              )}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (unboundConfig) {
                      navigator.clipboard.writeText(unboundConfig);
                      toast.success("Config copied to clipboard");
                    }
                  }}
                  className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
                >
                  Copy to Clipboard
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

// ─── Add/Edit Blocklist Form Dialog ─────────────────────────

function BlocklistFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: DnsBlocklist | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("hosts");
  const [refreshHours, setRefreshHours] = useState("24");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setUrl(existing.url);
        setFormat(existing.format);
        setRefreshHours(String(existing.refresh_interval_hours));
        setEnabled(existing.enabled);
      } else {
        setName("");
        setUrl("");
        setFormat("hosts");
        setRefreshHours("24");
        setEnabled(true);
      }
      setFormError(null);
    }
  }, [open, existing]);

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

    const hours = parseInt(refreshHours, 10);
    if (isNaN(hours) || hours < 1) {
      setFormError("Refresh interval must be at least 1 hour");
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        url: url.trim(),
        format,
        refresh_interval_hours: hours,
        enabled,
      };
      if (isEdit) {
        await updateDnsBlocklist(existing.id, body);
        toast.success(`Updated ${body.name}`);
      } else {
        await createDnsBlocklist(body);
        toast.success(`Created ${body.name}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save blocklist"
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
            {isEdit ? "Edit Blocklist" : "Add Blocklist"}
          </DialogTitle>
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
              className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
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
              className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
              placeholder="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bl-format" className="text-xs text-slate-400">
                Format
              </Label>
              <select
                id="bl-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-cyan-900/45 bg-[#08111e] px-3 py-1 text-sm text-white"
              >
                <option value="hosts">Hosts file</option>
                <option value="domains">Domain list</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bl-refresh" className="text-xs text-slate-400">
                Refresh (hours)
              </Label>
              <Input
                id="bl-refresh"
                type="number"
                min={1}
                value={refreshHours}
                onChange={(e) => setRefreshHours(e.target.value)}
                className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="bl-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="bl-enabled" className="text-sm text-slate-300">
              Enabled
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
              className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
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

// ─── Add Override Form Dialog ───────────────────────────────

function OverrideFormDialog({
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

    const d = domain.trim().toLowerCase();
    if (!d) {
      setFormError("Domain is required");
      return;
    }
    if (!d.includes(".")) {
      setFormError("Please enter a valid domain name");
      return;
    }

    setLoading(true);
    try {
      await createDnsBlocklistOverride({ domain: d, action });
      toast.success(`Added ${action} override for ${d}`);
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
      <DialogContent className="border-cyan-900/45 bg-[#0b1220]/72 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Domain Override</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ovr-domain" className="text-xs text-slate-400">
              Domain
            </Label>
            <Input
              id="ovr-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="border-cyan-900/45 bg-[#08111e] text-white placeholder:text-slate-600 font-mono"
              placeholder="example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ovr-action" className="text-xs text-slate-400">
              Action
            </Label>
            <select
              id="ovr-action"
              value={action}
              onChange={(e) =>
                setAction(e.target.value as "whitelist" | "blacklist")
              }
              className="flex h-9 w-full rounded-md border border-cyan-900/45 bg-[#08111e] px-3 py-1 text-sm text-white"
            >
              <option value="whitelist">Whitelist (allow through blocklists)</option>
              <option value="blacklist">Blacklist (always block)</option>
            </select>
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
              className="border-cyan-900/45 text-slate-300 hover:bg-cyan-950/35"
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
              Add Override
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
