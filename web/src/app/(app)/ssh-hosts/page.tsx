"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Play,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  createSshTarget,
  deleteSshTarget,
  fetchSshTargets,
  testSshConnection,
  updateSshTarget,
} from "@/lib/api";
import type { SshTarget, SshTargetRequest } from "@/lib/types";
import { formatBytes, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";

export default function SshHostsPage() {
  const [targets, setTargets] = useState<SshTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SshTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SshTarget | null>(null);

  const load = useCallback(async () => {
    try {
      setTargets(await fetchSshTargets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SSH hosts");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  useWsEvent(["ssh_report"], load);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSshTarget(pendingDelete.id);
      setTargets((prev) => prev?.filter((t) => t.id !== pendingDelete.id) ?? null);
      toast.success("SSH host deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const handleTestConnection = async (id: string) => {
    setTesting(id);
    try {
      const res = await testSshConnection(id);
      if (res.success) {
        toast.success("Connection successful");
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(null);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white">SSH Hosts</h1>
          <SshTargetFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            onSaved={() => {
              setAddOpen(false);
              load();
            }}
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-800 bg-slate-900">
          {targets === null ? (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500">Name</TableHead>
                  <TableHead className="text-slate-500">Host</TableHead>
                  <TableHead className="text-slate-500">OS</TableHead>
                  <TableHead className="text-slate-500">CPU</TableHead>
                  <TableHead className="text-slate-500">RAM</TableHead>
                  <TableHead className="text-slate-500">Disk</TableHead>
                  <TableHead className="text-slate-500">Uptime</TableHead>
                  <TableHead className="text-slate-500">Last Seen</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-slate-800">
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : targets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Server className="mb-4 h-12 w-12 text-slate-600" />
              <p className="text-lg font-medium text-slate-400">No SSH hosts yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Add a host to start collecting metrics via SSH without installing an agent.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500">Name</TableHead>
                  <TableHead className="text-slate-500">Host</TableHead>
                  <TableHead className="text-slate-500">OS</TableHead>
                  <TableHead className="text-slate-500">CPU</TableHead>
                  <TableHead className="text-slate-500">RAM</TableHead>
                  <TableHead className="text-slate-500">Disk</TableHead>
                  <TableHead className="text-slate-500">Uptime</TableHead>
                  <TableHead className="text-slate-500">Last Seen</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((target) => (
                  <TableRow key={target.id} className="border-slate-800">
                    <TableCell className="font-medium text-white">
                      {target.name}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-slate-400">
                      {target.host}:{target.port}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {target.os_name
                        ? `${target.os_name} ${target.os_version ?? ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-slate-400">
                      {target.cpu_percent != null
                        ? `${target.cpu_percent.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {target.mem_total != null && target.mem_used != null
                        ? `${formatBytes(target.mem_used)} / ${formatBytes(target.mem_total)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {target.disk_total != null && target.disk_used != null
                        ? `${formatBytes(target.disk_used)} / ${formatBytes(target.disk_total)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {target.uptime_seconds != null
                        ? formatUptime(target.uptime_seconds)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {target.last_report_at
                        ? timeAgo(target.last_report_at)
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge online={target.is_online} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTestConnection(target.id)}
                          disabled={testing === target.id}
                          className="rounded p-1 text-slate-600 hover:bg-blue-500/10 hover:text-blue-400 transition-colors disabled:opacity-50"
                          title="Test connection"
                        >
                          {testing === target.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Play size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => setEditTarget(target)}
                          className="rounded p-1 text-slate-600 hover:bg-slate-800/60 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setPendingDelete(target)}
                          className="rounded p-1 text-slate-600 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Edit dialog */}
        {editTarget && (
          <SshTargetFormDialog
            open={!!editTarget}
            onOpenChange={(v) => { if (!v) setEditTarget(null); }}
            existing={editTarget}
            onSaved={() => {
              setEditTarget(null);
              load();
            }}
          />
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
          <AlertDialogContent className="border-slate-800 bg-slate-950">
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                </div>
                <AlertDialogTitle className="text-white">Delete SSH host?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-slate-400 pl-[52px]">
                <span className="font-medium text-white">{pendingDelete?.name}</span>{" "}
                and all its collected metrics will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-slate-800 bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white"
                disabled={deleting}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                autoFocus
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Status Badge ───────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        online
          ? "border-emerald-500/50 text-emerald-400"
          : "border-rose-500/50 text-rose-400"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online
            ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
            : "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline"
        }`}
      />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

// ─── Uptime formatter ───────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ─── Add / Edit Form Dialog ─────────────────────────────

function SshTargetFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: SshTarget;
  onSaved: () => void;
}) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [host, setHost] = useState(existing?.host ?? "");
  const [port, setPort] = useState(existing?.port ?? 22);
  const [username, setUsername] = useState(existing?.username ?? "root");
  const [authType, setAuthType] = useState<"password" | "key">(
    existing?.auth_type ?? "password"
  );
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [pollInterval, setPollInterval] = useState(
    existing?.poll_interval_secs ?? 60
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setHost(existing?.host ?? "");
      setPort(existing?.port ?? 22);
      setUsername(existing?.username ?? "root");
      setAuthType(existing?.auth_type ?? "password");
      setPassword("");
      setPrivateKey("");
      setPollInterval(existing?.poll_interval_secs ?? 60);
      setEnabled(existing?.enabled ?? true);
      setError(null);
    }
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!name.trim() || !host.trim() || !username.trim()) {
      setError("Name, host, and username are required");
      return;
    }

    const body: SshTargetRequest = {
      name: name.trim(),
      host: host.trim(),
      port,
      username: username.trim(),
      auth_type: authType,
      poll_interval_secs: pollInterval,
      enabled,
    };

    // Only include credentials when explicitly set
    if (password) body.password = password;
    if (privateKey) body.private_key = privateKey;

    setLoading(true);
    setError(null);
    try {
      if (isEdit) {
        await updateSshTarget(existing!.id, body);
        toast.success("SSH host updated");
      } else {
        await createSshTarget(body);
        toast.success("SSH host added");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const dialogContent = (
    <DialogContent className="w-full max-w-[520px] border-slate-800 bg-slate-950">
      <DialogHeader>
        <DialogTitle className="text-white">
          {isEdit ? "Edit SSH Host" : "Add SSH Host"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update this SSH target's connection settings."
            : "Connect to a remote host via SSH to collect system metrics."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. nas-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Host</Label>
            <Input
              placeholder="192.168.1.50"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Port</Label>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 22)}
            />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              placeholder="root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Auth Type</Label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as "password" | "key")}
              className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="password">Password</option>
              <option value="key">SSH Key</option>
            </select>
          </div>
        </div>

        {authType === "password" ? (
          <div className="space-y-2">
            <Label>
              Password
              {isEdit && existing?.has_password && (
                <span className="ml-2 text-xs text-slate-500">(leave empty to keep current)</span>
              )}
            </Label>
            <Input
              type="password"
              placeholder={isEdit && existing?.has_password ? "********" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>
              Private Key (PEM)
              {isEdit && existing?.has_private_key && (
                <span className="ml-2 text-xs text-slate-500">(leave empty to keep current)</span>
              )}
            </Label>
            <textarea
              className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[100px]"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Poll Interval (seconds)</Label>
            <Input
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value) || 60)}
              min={10}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-slate-700"
              />
              Enabled
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Saving..." : isEdit ? "Update" : "Add SSH Host"}
        </Button>
      </div>
    </DialogContent>
  );

  if (isEdit) {
    // For edit mode, render as a controlled dialog without a trigger
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  // For add mode, render with a trigger button
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add SSH Host
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
