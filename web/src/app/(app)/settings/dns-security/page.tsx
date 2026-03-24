"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Search,
  Shield,
  Lock,
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
  fetchDotUpstreams,
  createDotUpstream,
  updateDotUpstream,
  deleteDotUpstream,
  toggleDotUpstream,
  fetchDnssecConfig,
  updateDnssecConfig,
} from "@/lib/api";
import type { DotUpstream } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function DnsSecurityPage() {
  const [upstreams, setUpstreams] = useState<DotUpstream[] | null>(null);
  const [search, setSearch] = useState("");
  const [editUpstream, setEditUpstream] = useState<DotUpstream | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DotUpstream | null>(null);
  const [dnssecEnabled, setDnssecEnabled] = useState(false);
  const [dnssecLoading, setDnssecLoading] = useState(true);
  const [dnssecSaving, setDnssecSaving] = useState(false);

  const loadUpstreams = useCallback(async () => {
    try {
      const data = await fetchDotUpstreams();
      setUpstreams(data);
    } catch {
      toast.error("Failed to load DoT upstreams");
    }
  }, []);

  const loadDnssec = useCallback(async () => {
    try {
      const config = await fetchDnssecConfig();
      setDnssecEnabled(config.enabled);
    } catch {
      toast.error("Failed to load DNSSEC config");
    } finally {
      setDnssecLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpstreams();
    loadDnssec();
  }, [loadUpstreams, loadDnssec]);

  const filtered = useMemo(() => {
    if (!upstreams) return null;
    if (!search.trim()) return upstreams;
    const q = search.toLowerCase();
    return upstreams.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.address.toLowerCase().includes(q) ||
        (u.tls_hostname && u.tls_hostname.toLowerCase().includes(q))
    );
  }, [upstreams, search]);

  async function handleToggle(upstream: DotUpstream) {
    try {
      const updated = await toggleDotUpstream(upstream.id, !upstream.enabled);
      setUpstreams(
        (prev) =>
          prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null
      );
      toast.success(
        `${upstream.name} ${updated.enabled ? "enabled" : "disabled"}`
      );
    } catch {
      toast.error("Failed to toggle DoT upstream");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteDotUpstream(pendingDelete.id);
      setUpstreams(
        (prev) => prev?.filter((u) => u.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.name}`);
    } catch {
      toast.error("Failed to delete DoT upstream");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleDnssecToggle(enabled: boolean) {
    setDnssecSaving(true);
    try {
      const config = await updateDnssecConfig(enabled);
      setDnssecEnabled(config.enabled);
      toast.success(`DNSSEC ${config.enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update DNSSEC setting");
    } finally {
      setDnssecSaving(false);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditUpstream(null);
    loadUpstreams();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              DNS Security
            </h1>
          </div>
        </div>

        {/* DNSSEC Card */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Shield className="h-4 w-4 text-emerald-400" />
              DNSSEC Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-slate-300">
                  Enable DNSSEC to validate DNS responses using cryptographic
                  signatures.
                </p>
                <p className="text-xs text-slate-500">
                  Protects against DNS spoofing and cache poisoning attacks.
                </p>
              </div>
              {dnssecLoading ? (
                <Skeleton className="h-5 w-9 rounded-full bg-slate-800" />
              ) : (
                <Switch
                  checked={dnssecEnabled}
                  onCheckedChange={handleDnssecToggle}
                  disabled={dnssecSaving}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* DoT Upstreams Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium text-white">
                <Lock className="h-4 w-4 text-blue-400" />
                DNS-over-TLS Upstreams
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Encrypted DNS upstream servers for secure query forwarding.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Upstream
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Filter by name, address, or TLS hostname..."
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
                    <TableHead className="text-slate-400">Address</TableHead>
                    <TableHead className="text-slate-400">Port</TableHead>
                    <TableHead className="text-slate-400">
                      TLS Hostname
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
                          <Skeleton className="h-4 w-28 bg-slate-800" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-12 bg-slate-800" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-36 bg-slate-800" />
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
                          ? "No upstreams match your filter."
                          : "No DoT upstream servers configured yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((upstream) => (
                      <TableRow
                        key={upstream.id}
                        className="border-slate-800 hover:bg-slate-800/30"
                      >
                        <TableCell className="font-medium text-white">
                          {upstream.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-400">
                          {upstream.address}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-400">
                          {upstream.port}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400">
                          {upstream.tls_hostname || (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={upstream.enabled}
                            onCheckedChange={() => handleToggle(upstream)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditUpstream(upstream)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDelete(upstream)}
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
        </div>

        {/* Add/Edit Dialog */}
        <DotUpstreamFormDialog
          open={showAdd || editUpstream !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAdd(false);
              setEditUpstream(null);
            }
          }}
          existing={editUpstream}
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
                Delete DoT Upstream
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.name}
                </span>
                ? This will remove the encrypted upstream server configuration.
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

function DotUpstreamFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: DotUpstream | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("853");
  const [tlsHostname, setTlsHostname] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setAddress(existing.address);
        setPort(String(existing.port));
        setTlsHostname(existing.tls_hostname || "");
        setEnabled(existing.enabled);
      } else {
        setName("");
        setAddress("");
        setPort("853");
        setTlsHostname("");
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
    if (!address.trim()) {
      setFormError("Address is required");
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError("Port must be 1–65535");
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        address: address.trim(),
        port: portNum,
        tls_hostname: tlsHostname.trim() || undefined,
        enabled,
      };
      if (isEdit) {
        await updateDotUpstream(existing.id, body);
        toast.success(`Updated ${body.name}`);
      } else {
        await createDotUpstream(body);
        toast.success(`Created ${body.name}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save DoT upstream"
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
            {isEdit ? "Edit DoT Upstream" : "Add DoT Upstream"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dot-name" className="text-xs text-slate-400">
              Name
            </Label>
            <Input
              id="dot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="Cloudflare DNS"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="dot-address" className="text-xs text-slate-400">
                Address
              </Label>
              <Input
                id="dot-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="1.1.1.1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dot-port" className="text-xs text-slate-400">
                Port
              </Label>
              <Input
                id="dot-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="853"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="dot-tls-hostname"
              className="text-xs text-slate-400"
            >
              TLS Hostname (SNI)
            </Label>
            <Input
              id="dot-tls-hostname"
              value={tlsHostname}
              onChange={(e) => setTlsHostname(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="cloudflare-dns.com"
            />
            <p className="text-xs text-slate-500">
              Server Name Indication for TLS certificate validation. Leave empty
              to use the address.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <Label
              htmlFor="dot-enabled"
              className="text-sm text-slate-300 cursor-pointer"
            >
              Enabled
            </Label>
            <Switch
              id="dot-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
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
