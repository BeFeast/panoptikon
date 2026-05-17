"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Globe,
  Pencil,
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
  fetchDdnsEntries,
  createDdnsEntry,
  updateDdnsEntry,
  deleteDdnsEntry,
  toggleDdnsEntry,
  fetchDdnsStatus,
} from "@/lib/api";
import type { DdnsEntry, DdnsEntryRequest, DdnsStatus } from "@/lib/types";
import { toast } from "sonner";

const PROVIDERS = [
  "cloudflare",
  "dyndns",
  "noip",
  "duckdns",
  "namecheap",
  "google",
  "freedns",
  "afraid",
  "dnsomatic",
  "custom",
];

const PROTOCOLS = ["ipv4", "ipv6", "both"];
const IP_SOURCES = ["wan", "interface", "web"];

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <CheckCircle className="mr-1 h-3 w-3" /> Success
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
          <AlertCircle className="mr-1 h-3 w-3" /> Error
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">
          <Clock className="mr-1 h-3 w-3" /> Unknown
        </Badge>
      );
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso + "Z").getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Form Dialog ──────────────────────────────────────────

function DdnsFormDialog({
  open,
  onClose,
  onSave,
  initial,
  defaultRouterType,
  routerTypes,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (body: DdnsEntryRequest) => Promise<void>;
  initial?: DdnsEntry | null;
  defaultRouterType: string;
  routerTypes: string[];
}) {
  const [provider, setProvider] = useState(initial?.provider ?? "cloudflare");
  const [hostname, setHostname] = useState(initial?.hostname ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [interfaceName, setInterfaceName] = useState(
    initial?.interface_name ?? ""
  );
  const [ipSource, setIpSource] = useState(initial?.ip_source ?? "wan");
  const [protocol, setProtocol] = useState(initial?.protocol ?? "ipv4");
  const [routerType, setRouterType] = useState(
    initial?.router_type ?? defaultRouterType
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(initial?.provider ?? "cloudflare");
      setHostname(initial?.hostname ?? "");
      setUsername(initial?.username ?? "");
      setPassword("");
      setApiToken("");
      setZone(initial?.zone ?? "");
      setInterfaceName(initial?.interface_name ?? "");
      setIpSource(initial?.ip_source ?? "wan");
      setProtocol(initial?.protocol ?? "ipv4");
      setRouterType(initial?.router_type ?? defaultRouterType);
      setEnabled(initial?.enabled ?? true);
    }
  }, [open, initial, defaultRouterType]);

  const handleSubmit = async () => {
    if (!hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }
    setSaving(true);
    try {
      const body: DdnsEntryRequest = {
        provider,
        hostname: hostname.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        api_token: apiToken || undefined,
        zone: zone.trim() || undefined,
        interface_name: interfaceName.trim() || undefined,
        ip_source: ipSource,
        protocol,
        enabled,
        router_type: routerType,
      };
      await onSave(body);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save DDNS entry"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit DDNS Entry" : "Add DDNS Entry"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Provider</Label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {routerTypes.length > 1 && (
              <div className="space-y-2">
                <Label>Router Type</Label>
                <select
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={routerType}
                  onChange={(e) => setRouterType(e.target.value)}
                >
                  {routerTypes.map((t) => (
                    <option key={t} value={t}>
                      MikroTik
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Hostname *</Label>
            <Input
              className="bg-slate-800 border-slate-700"
              placeholder="home.example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Zone</Label>
            <Input
              className="bg-slate-800 border-slate-700"
              placeholder="example.com (for Cloudflare)"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                className="bg-slate-800 border-slate-700"
                placeholder="Username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Password{" "}
                {initial?.has_password && (
                  <span className="text-xs text-slate-500">(set)</span>
                )}
              </Label>
              <Input
                className="bg-slate-800 border-slate-700"
                type="password"
                placeholder={initial?.has_password ? "Leave blank to keep" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              API Token{" "}
              {initial?.has_api_token && (
                <span className="text-xs text-slate-500">(set)</span>
              )}
            </Label>
            <Input
              className="bg-slate-800 border-slate-700"
              type="password"
              placeholder={
                initial?.has_api_token
                  ? "Leave blank to keep"
                  : "API token (Cloudflare, etc.)"
              }
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label>IP Source</Label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                value={ipSource}
                onChange={(e) => setIpSource(e.target.value)}
              >
                {IP_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Protocol</Label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              >
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>
                    {p.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Interface</Label>
              <Input
                className="bg-slate-800 border-slate-700"
                placeholder="eth0"
                value={interfaceName}
                onChange={(e) => setInterfaceName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Enabled</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : initial ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────

export default function DdnsPage() {
  const [entries, setEntries] = useState<DdnsEntry[] | null>(null);
  const [statusData, setStatusData] = useState<DdnsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<DdnsEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DdnsEntry | null>(null);
  const [search, setSearch] = useState("");
  const defaultRouterType = "mikrotik";
  const [routerTypes] = useState<string[]>(["mikrotik"]);

  const loadData = useCallback(async () => {
    try {
      const [list, stat] = await Promise.all([
        fetchDdnsEntries(),
        fetchDdnsStatus(),
      ]);
      setEntries(list);
      setStatusData(stat);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DDNS data");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.hostname.toLowerCase().includes(q) ||
        e.provider.toLowerCase().includes(q) ||
        (e.last_ip && e.last_ip.includes(q))
    );
  }, [entries, search]);

  const handleCreate = async (body: DdnsEntryRequest) => {
    await createDdnsEntry(body);
    toast.success("DDNS entry created");
    loadData();
  };

  const handleUpdate = async (body: DdnsEntryRequest) => {
    if (!editItem) return;
    await updateDdnsEntry(editItem.id, body);
    toast.success("DDNS entry updated");
    loadData();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteDdnsEntry(pendingDelete.id);
      toast.success("DDNS entry deleted");
      setPendingDelete(null);
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete"
      );
    }
  };

  const handleToggle = async (entry: DdnsEntry) => {
    try {
      await toggleDdnsEntry(entry.id, !entry.enabled);
      toast.success(
        `DDNS entry ${entry.enabled ? "disabled" : "enabled"}`
      );
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle"
      );
    }
  };

  if (error && !entries) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Dynamic DNS</h1>
            <p className="text-sm text-slate-400">
              Manage DDNS client configurations for automatic DNS updates
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              className="text-slate-400"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Entry
            </Button>
          </div>
        </div>

        {/* Status cards */}
        {statusData === null ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Total Entries
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-white">
                  {statusData.total}
                </p>
              </CardContent>
            </Card>
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Enabled
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-blue-400">
                  {statusData.enabled}
                </p>
              </CardContent>
            </Card>
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Healthy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-emerald-400">
                  {statusData.healthy}
                </p>
              </CardContent>
            </Card>
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Failing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-rose-400">
                  {statusData.failing}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2">
          <Input
            className="max-w-sm bg-slate-800 border-slate-700"
            placeholder="Search by hostname, provider, or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <Card className="border-cyan-900/45 bg-[#0b1220]/72">
          {entries === null ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 bg-slate-700" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Globe className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">
                {search ? "No entries match your search" : "No DDNS entries configured"}
              </p>
              {!search && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-3"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add your first entry
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Provider</TableHead>
                  <TableHead className="text-slate-400">Hostname</TableHead>
                  <TableHead className="text-slate-400">Current IP</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Last Update</TableHead>
                  <TableHead className="text-slate-400">Router</TableHead>
                  <TableHead className="text-slate-400 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id} className="border-slate-700">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-slate-600 text-slate-300"
                        >
                          {entry.provider}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-slate-100 font-medium">
                          {entry.hostname}
                        </span>
                        {entry.zone && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({entry.zone})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-slate-300 font-mono text-sm">
                        {entry.last_ip ?? "---"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.enabled ? (
                        <StatusBadge status={entry.last_status} />
                      ) : (
                        <Badge className="bg-slate-600/10 text-slate-500 border-slate-600/20">
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-400">
                        {timeAgo(entry.last_updated_at)}
                      </span>
                      {entry.last_error && (
                        <p
                          className="text-xs text-rose-400 mt-0.5 max-w-[200px] truncate"
                          title={entry.last_error}
                        >
                          {entry.last_error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="border-slate-600 text-slate-400 text-xs"
                      >
                        MikroTik
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Switch
                          checked={entry.enabled}
                          onCheckedChange={() => handleToggle(entry)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditItem(entry)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(entry)}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Add dialog */}
      <DdnsFormDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleCreate}
        defaultRouterType={defaultRouterType}
        routerTypes={routerTypes}
      />

      {/* Edit dialog */}
      <DdnsFormDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={handleUpdate}
        initial={editItem}
        defaultRouterType={defaultRouterType}
        routerTypes={routerTypes}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DDNS Entry</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete the DDNS entry for{" "}
              <strong className="text-slate-200">
                {pendingDelete?.hostname}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
