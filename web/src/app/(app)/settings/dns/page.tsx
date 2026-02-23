"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Zap,
  Settings2,
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
  fetchUnboundDnsRecords,
  createUnboundDnsRecord,
  updateUnboundDnsRecord,
  deleteUnboundDnsRecord,
  toggleUnboundDnsRecord,
  testUnboundConnection,
  fetchSettings,
  updateSettings,
} from "@/lib/api";
import type { UnboundDnsRecord } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function DnsSettingsPage() {
  const [records, setRecords] = useState<UnboundDnsRecord[] | null>(null);
  const [search, setSearch] = useState("");
  const [editRecord, setEditRecord] = useState<UnboundDnsRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UnboundDnsRecord | null>(
    null
  );
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchUnboundDnsRecords();
      setRecords(data);
    } catch {
      toast.error("Failed to load DNS records");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!records) return null;
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) =>
        r.hostname.toLowerCase().includes(q) ||
        r.ip_address.toLowerCase().includes(q)
    );
  }, [records, search]);

  async function handleToggle(record: UnboundDnsRecord) {
    try {
      const updated = await toggleUnboundDnsRecord(record.id, !record.enabled);
      setRecords(
        (prev) =>
          prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null
      );
      toast.success(
        `${record.hostname} ${updated.enabled ? "enabled" : "disabled"}`
      );
    } catch {
      toast.error("Failed to toggle DNS record");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteUnboundDnsRecord(pendingDelete.id);
      setRecords(
        (prev) => prev?.filter((r) => r.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.hostname}`);
    } catch {
      toast.error("Failed to delete DNS record");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testUnboundConnection();
      if (result.success) {
        toast.success(result.message);
        setConnected(true);
      } else {
        toast.error(result.message);
        setConnected(false);
      }
    } catch {
      toast.error("Failed to test connection");
      setConnected(false);
    } finally {
      setTesting(false);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditRecord(null);
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
              Unbound DNS
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {connected !== null && (
              <span className="flex items-center gap-1 text-xs">
                {connected ? (
                  <CheckCircle className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-rose-400" />
                )}
                <span
                  className={
                    connected ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {connected ? "Connected" : "Unreachable"}
                </span>
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(true)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configure
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Connection
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Record
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Filter by hostname or IP..."
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
                  <TableHead className="text-slate-400">Hostname</TableHead>
                  <TableHead className="text-slate-400">IP Address</TableHead>
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
                        <Skeleton className="h-4 w-48 bg-slate-800" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-slate-800" />
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
                      colSpan={4}
                      className="py-12 text-center text-slate-500"
                    >
                      {search
                        ? "No records match your filter."
                        : "No DNS records configured yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((record) => (
                    <TableRow
                      key={record.id}
                      className="border-slate-800 hover:bg-slate-800/30"
                    >
                      <TableCell className="font-medium text-white font-mono text-sm">
                        {record.hostname}
                      </TableCell>
                      <TableCell className="text-slate-400 font-mono text-sm">
                        {record.ip_address}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={record.enabled}
                          onCheckedChange={() => handleToggle(record)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditRecord(record)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(record)}
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
        <DnsRecordFormDialog
          open={showAdd || editRecord !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAdd(false);
              setEditRecord(null);
            }
          }}
          existing={editRecord}
          onSaved={handleSaved}
        />

        {/* Configure Dialog */}
        <UnboundConfigDialog
          open={showConfig}
          onOpenChange={setShowConfig}
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
                Delete DNS Record
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.hostname}
                </span>
                ? This will remove the record from Unbound on the next sync.
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

// ─── Add/Edit Form Dialog ───────────────────────────────────

function DnsRecordFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: UnboundDnsRecord | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [hostname, setHostname] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setHostname(existing.hostname);
        setIpAddress(existing.ip_address);
      } else {
        setHostname("");
        setIpAddress("");
      }
      setFormError(null);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!hostname.trim()) {
      setFormError("Hostname is required");
      return;
    }
    if (!ipAddress.trim()) {
      setFormError("IP address is required");
      return;
    }
    // Basic IP validation.
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (!ipPattern.test(ipAddress.trim())) {
      setFormError("Invalid IPv4 address format");
      return;
    }

    setLoading(true);
    try {
      const body = {
        hostname: hostname.trim(),
        ip_address: ipAddress.trim(),
      };
      if (isEdit) {
        await updateUnboundDnsRecord(existing.id, body);
        toast.success(`Updated ${body.hostname}`);
      } else {
        await createUnboundDnsRecord(body);
        toast.success(`Created ${body.hostname}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save DNS record"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit DNS Record" : "Add DNS Record"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hostname" className="text-xs text-slate-400">
              Hostname
            </Label>
            <Input
              id="hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="myserver.lan"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ip-address" className="text-xs text-slate-400">
              IP Address
            </Label>
            <Input
              id="ip-address"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="192.168.1.100"
            />
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

// ─── Unbound Configuration Dialog ────────────────────────────

function UnboundConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [controlPath, setControlPath] = useState("/var/run/unbound.ctl");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchSettings()
        .then((s) => {
          setControlPath(s.unbound_control_path || "/var/run/unbound.ctl");
        })
        .catch(() => {
          toast.error("Failed to load settings");
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateSettings({ unbound_control_path: controlPath.trim() });
      toast.success("Unbound settings saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Unbound Configuration
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="control-path"
              className="text-xs text-slate-400"
            >
              Socket Path
            </Label>
            <Input
              id="control-path"
              value={controlPath}
              onChange={(e) => setControlPath(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="/var/run/unbound.ctl"
              disabled={loading}
            />
            <p className="text-xs text-slate-500">
              Path to the Unbound control socket. Used by unbound-control
              to communicate with the Unbound daemon.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
