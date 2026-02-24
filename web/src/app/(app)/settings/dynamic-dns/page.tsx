"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Globe,
  Pencil,
} from "lucide-react";
import {
  Card,
  CardContent,
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
  fetchDynamicDnsList,
  createDynamicDns,
  updateDynamicDns,
  deleteDynamicDns,
  toggleDynamicDns,
  refreshDynamicDnsStatus,
} from "@/lib/api";
import type { DynamicDnsEntry, DynamicDnsRequest } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

const DDNS_PROVIDERS = [
  "cloudflare",
  "dyndns",
  "noip",
  "duckdns",
  "namecheap",
  "google",
  "freedns",
  "he",
  "changeip",
  "zoneedit",
  "dnsomatic",
  "ovh",
];

export default function DynamicDnsPage() {
  const [entries, setEntries] = useState<DynamicDnsEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<DynamicDnsEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DynamicDnsEntry | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const data = await fetchDynamicDnsList();
      setEntries(data);
    } catch {
      toast.error("Failed to load dynamic DNS entries");
    }
  }, []);

  useEffect(() => {
    loadEntries();
    const interval = setInterval(loadEntries, 30_000);
    return () => clearInterval(interval);
  }, [loadEntries]);

  const filteredEntries = useMemo(() => {
    if (!entries) return null;
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.hostname.toLowerCase().includes(q) ||
        e.provider.toLowerCase().includes(q)
    );
  }, [entries, search]);

  async function handleToggle(entry: DynamicDnsEntry) {
    try {
      const updated = await toggleDynamicDns(entry.id, !entry.enabled);
      setEntries(
        (prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null
      );
      toast.success(`${entry.name} ${updated.enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to toggle DDNS entry");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteDynamicDns(pendingDelete.id);
      setEntries(
        (prev) => prev?.filter((e) => e.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.name}`);
    } catch {
      toast.error("Failed to delete DDNS entry");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleRefreshStatus(entry: DynamicDnsEntry) {
    setRefreshing(entry.id);
    try {
      const updated = await refreshDynamicDnsStatus(entry.id);
      setEntries(
        (prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null
      );
      toast.success(`Refreshed status for ${entry.name}`);
    } catch {
      toast.error(`Failed to refresh status for ${entry.name}`);
    } finally {
      setRefreshing(null);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditItem(null);
    loadEntries();
  }

  function formatDate(date: string | null): string {
    if (!date) return "Never";
    return new Date(date + "Z").toLocaleString();
  }

  function statusBadge(entry: DynamicDnsEntry) {
    if (entry.last_error) {
      return (
        <Badge variant="outline" className="border-rose-500/30 text-rose-400">
          <AlertCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
    }
    if (entry.last_status === "success") {
      return (
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
          <CheckCircle className="mr-1 h-3 w-3" />
          Active
        </Badge>
      );
    }
    if (!entry.enabled) {
      return (
        <Badge variant="outline" className="border-slate-600 text-slate-500">
          Disabled
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-slate-600 text-slate-400">
        Pending
      </Badge>
    );
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
              Dynamic DNS
            </h1>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white hover:bg-blue-500"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add DDNS Entry
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Total Entries</p>
              <p className="text-2xl font-semibold text-white">
                {entries ? entries.length : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Active</p>
              <p className="text-2xl font-semibold text-white">
                {entries ? entries.filter((e) => e.enabled).length : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="py-3">
              <p className="text-xs text-slate-500">Errors</p>
              <p className="text-2xl font-semibold text-white">
                {entries ? entries.filter((e) => e.last_error).length : <Skeleton className="h-7 w-10 bg-slate-800" />}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter by name, hostname, or provider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
          />
        </div>

        {/* Table */}
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Name</TableHead>
                  <TableHead className="text-slate-400">Provider</TableHead>
                  <TableHead className="text-slate-400">Hostname</TableHead>
                  <TableHead className="text-slate-400">Current IP</TableHead>
                  <TableHead className="text-slate-400">Last Updated</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-right text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell><Skeleton className="h-4 w-24 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 bg-slate-800" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 bg-slate-800" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredEntries.length === 0 ? (
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                      {search
                        ? "No DDNS entries match your filter."
                        : "No dynamic DNS entries configured. Add one to keep your domain updated with your current IP."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id} className="border-slate-800 hover:bg-slate-800/30">
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium text-white">{entry.name}</p>
                          <p className="text-xs text-slate-500">{entry.router_type}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                          {entry.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-300">
                        {entry.hostname}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-400">
                        {entry.last_ip || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {formatDate(entry.last_update_at)}
                      </TableCell>
                      <TableCell>{statusBadge(entry)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Switch
                            checked={entry.enabled}
                            onCheckedChange={() => handleToggle(entry)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRefreshStatus(entry)}
                            disabled={refreshing === entry.id}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            title="Refresh status"
                          >
                            {refreshing === entry.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditItem(entry)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(entry)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                            title="Delete"
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
        <DdnsFormDialog
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

        {/* Delete Confirmation */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete DDNS Entry
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">{pendingDelete?.name}</span>?
                This will also remove the configuration from your router.
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
      </div>
    </PageTransition>
  );
}

// ─── Add/Edit Form Dialog ────────────────────────────────────

function DdnsFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: DynamicDnsEntry | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("cloudflare");
  const [hostname, setHostname] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [iface, setIface] = useState("");
  const [ipSource, setIpSource] = useState("interface");
  const [enabled, setEnabled] = useState(true);
  const [routerType, setRouterType] = useState("vyos");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setProvider(existing.provider);
        setHostname(existing.hostname);
        setUsername(existing.username);
        setPassword("");
        setIface(existing.interface);
        setIpSource(existing.ip_source);
        setEnabled(existing.enabled);
        setRouterType(existing.router_type);
      } else {
        setName("");
        setProvider("cloudflare");
        setHostname("");
        setUsername("");
        setPassword("");
        setIface("eth0");
        setIpSource("interface");
        setEnabled(true);
        setRouterType("vyos");
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
    if (!hostname.trim()) {
      setFormError("Hostname is required");
      return;
    }

    setLoading(true);
    try {
      const body: DynamicDnsRequest = {
        name: name.trim(),
        provider,
        hostname: hostname.trim(),
        username: username.trim(),
        password,
        interface: iface.trim(),
        ip_source: ipSource,
        enabled,
        router_type: routerType,
      };
      if (isEdit) {
        await updateDynamicDns(existing.id, body);
        toast.success(`Updated ${body.name}`);
      } else {
        await createDynamicDns(body);
        toast.success(`Created ${body.name}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save DDNS entry"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit DDNS Entry" : "Add DDNS Entry"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ddns-name" className="text-xs text-slate-400">
                Name
              </Label>
              <Input
                id="ddns-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="my-ddns"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ddns-provider" className="text-xs text-slate-400">
                Provider
              </Label>
              <select
                id="ddns-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white"
              >
                {DDNS_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ddns-hostname" className="text-xs text-slate-400">
              Hostname
            </Label>
            <Input
              id="ddns-hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 font-mono"
              placeholder="home.example.com"
            />
            <p className="text-xs text-slate-600">
              Comma-separate multiple hostnames.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ddns-username" className="text-xs text-slate-400">
                Username / Token
              </Label>
              <Input
                id="ddns-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="api-token or username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ddns-password" className="text-xs text-slate-400">
                Password / Secret
              </Label>
              <Input
                id="ddns-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder={isEdit ? "(unchanged)" : "secret"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ddns-ip-source" className="text-xs text-slate-400">
                IP Source
              </Label>
              <select
                id="ddns-ip-source"
                value={ipSource}
                onChange={(e) => setIpSource(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white"
              >
                <option value="interface">Interface</option>
                <option value="web">Web (external check)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ddns-interface" className="text-xs text-slate-400">
                Interface
              </Label>
              <Input
                id="ddns-interface"
                value={iface}
                onChange={(e) => setIface(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="eth0"
                disabled={ipSource !== "interface"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ddns-router-type" className="text-xs text-slate-400">
                Router Type
              </Label>
              <select
                id="ddns-router-type"
                value={routerType}
                onChange={(e) => setRouterType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white"
              >
                <option value="vyos">VyOS</option>
                <option value="mikrotik">MikroTik</option>
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <div className="flex items-center gap-3">
                <Switch
                  id="ddns-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <Label htmlFor="ddns-enabled" className="text-sm text-slate-300">
                  Enabled
                </Label>
              </div>
            </div>
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
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
