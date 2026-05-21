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
  TableEmptyRow,
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
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Unbound DNS
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {connected !== null && (
              <span className="flex items-center gap-1 text-xs">
                {connected ? (
                  <CheckCircle className="h-3 w-3 text-[#4ade80]" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-[#fb7185]" />
                )}
                <span
                  className={
                    connected ? "text-[#4ade80]" : "text-[#fb7185]"
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
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configure
            </Button>
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
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-mesh-primary text-white hover:bg-mesh-primary"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Record
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
          <Input
            placeholder="Filter by hostname or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-mesh-border bg-mesh-surface-1 pl-10 text-white placeholder:text-mesh-text-mute"
          />
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table wrapperClassName="rounded-none border-0">
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="text-mesh-text-dim">Hostname</TableHead>
                  <TableHead className="text-mesh-text-dim">IP Address</TableHead>
                  <TableHead className="text-mesh-text-dim">Status</TableHead>
                  <TableHead className="text-right text-mesh-text-dim">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-mesh-border-strong">
                      <TableCell>
                        <Skeleton className="h-4 w-48 bg-mesh-surface-2/55" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32 bg-mesh-surface-2/55" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-mesh-surface-2/55" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-mesh-surface-2/55" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableEmptyRow
                    colSpan={4}
                    title={search ? "No records match your filter" : "No DNS records configured yet"}
                    description={
                      search
                        ? "Clear the filter to show all static DNS records."
                        : "Add a hostname and IP address to populate this table."
                    }
                  />
                ) : (
                  filtered.map((record) => (
                    <TableRow
                      key={record.id}
                      className="border-mesh-border hover:bg-mesh-surface-2/55"
                    >
                      <TableCell className="font-medium text-white font-mono text-sm">
                        {record.hostname}
                      </TableCell>
                      <TableCell className="text-mesh-text-dim font-mono text-sm">
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
                            className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(record)}
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
          <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete DNS Record
              </AlertDialogTitle>
              <AlertDialogDescription className="text-mesh-text-dim">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.hostname}
                </span>
                ? This will remove the record from Unbound on the next sync.
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
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit DNS Record" : "Add DNS Record"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hostname" className="text-xs text-mesh-text-dim">
              Hostname
            </Label>
            <Input
              id="hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="myserver.lan"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ip-address" className="text-xs text-mesh-text-dim">
              IP Address
            </Label>
            <Input
              id="ip-address"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="192.168.1.100"
            />
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
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Unbound Configuration
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="control-path"
              className="text-xs text-mesh-text-dim"
            >
              Socket Path
            </Label>
            <Input
              id="control-path"
              value={controlPath}
              onChange={(e) => setControlPath(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="/var/run/unbound.ctl"
              disabled={loading}
            />
            <p className="text-xs text-mesh-text-mute">
              Path to the Unbound control socket. Used by unbound-control
              to communicate with the Unbound daemon.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-mesh-primary text-white hover:bg-mesh-primary"
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
