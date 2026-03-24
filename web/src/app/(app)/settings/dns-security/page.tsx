"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
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
import { PageTransition } from "@/components/PageTransition";
import { fetchDnsSecurity, updateDnsSecurity } from "@/lib/api";
import type { DotServer, DnsSecuritySettings } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

export default function DnsSecurityPage() {
  const [settings, setSettings] = useState<DnsSecuritySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddServer, setShowAddServer] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchDnsSecurity();
      setSettings(data);
    } catch {
      toast.error("Failed to load DNS security settings");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleDot(enabled: boolean) {
    setSaving(true);
    try {
      const updated = await updateDnsSecurity({ dot_enabled: enabled });
      setSettings(updated);
      toast.success(`DNS-over-TLS ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update DoT setting");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDnssec(enabled: boolean) {
    setSaving(true);
    try {
      const updated = await updateDnsSecurity({ dnssec_enabled: enabled });
      setSettings(updated);
      toast.success(`DNSSEC ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update DNSSEC setting");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleServer(index: number) {
    if (!settings) return;
    const servers = [...settings.dot_servers];
    servers[index] = { ...servers[index], enabled: !servers[index].enabled };
    setSaving(true);
    try {
      const updated = await updateDnsSecurity({ dot_servers: servers });
      setSettings(updated);
    } catch {
      toast.error("Failed to update server");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteServer(index: number) {
    if (!settings) return;
    const servers = settings.dot_servers.filter((_, i) => i !== index);
    setSaving(true);
    try {
      const updated = await updateDnsSecurity({ dot_servers: servers });
      setSettings(updated);
      toast.success("Removed DoT server");
    } catch {
      toast.error("Failed to remove server");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddServer(server: DotServer) {
    if (!settings) return;
    const servers = [...settings.dot_servers, server];
    setSaving(true);
    try {
      const updated = await updateDnsSecurity({ dot_servers: servers });
      setSettings(updated);
      setShowAddServer(false);
      toast.success(`Added DoT server ${server.name || server.address}`);
    } catch {
      toast.error("Failed to add server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
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

        {settings === null ? (
          <div className="space-y-6">
            <Skeleton className="h-40 w-full bg-slate-800" />
            <Skeleton className="h-40 w-full bg-slate-800" />
          </div>
        ) : (
          <>
            {/* DNSSEC Section */}
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-white">
                        DNSSEC Validation
                      </CardTitle>
                      <p className="text-xs text-slate-500">
                        Validate DNS responses with cryptographic signatures to
                        prevent spoofing and cache poisoning.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.dnssec_enabled}
                    onCheckedChange={handleToggleDnssec}
                    disabled={saving}
                    data-testid="dnssec-toggle"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-md border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <p className="text-xs text-slate-400">
                    When enabled, Unbound validates DNSSEC signatures on
                    responses. Domains with invalid or missing signatures will
                    return SERVFAIL. Requires Unbound to be configured as the
                    local resolver.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* DoT Section */}
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <Lock className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-white">
                        DNS-over-TLS (DoT)
                      </CardTitle>
                      <p className="text-xs text-slate-500">
                        Encrypt DNS queries to upstream resolvers using TLS
                        (port 853).
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.dot_enabled}
                    onCheckedChange={handleToggleDot}
                    disabled={saving}
                    data-testid="dot-toggle"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* DoT Upstream Servers */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-300">
                    Upstream DoT Servers
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowAddServer(true)}
                    className="bg-blue-600 text-white hover:bg-blue-500"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Server
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">Address</TableHead>
                      <TableHead className="text-slate-400">Port</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-right text-slate-400">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.dot_servers.length === 0 ? (
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-slate-500"
                        >
                          No DoT upstream servers configured. Add a server to
                          encrypt DNS queries.
                        </TableCell>
                      </TableRow>
                    ) : (
                      settings.dot_servers.map((server, index) => (
                        <TableRow
                          key={`${server.address}-${index}`}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            {server.name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-slate-400">
                            {server.address}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-slate-400">
                            {server.port}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={server.enabled}
                              onCheckedChange={() => handleToggleServer(index)}
                              disabled={saving}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteServer(index)}
                              disabled={saving}
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
          </>
        )}

        {/* Add Server Dialog */}
        <AddDotServerDialog
          open={showAddServer}
          onOpenChange={setShowAddServer}
          onAdd={handleAddServer}
          saving={saving}
        />
      </div>
    </PageTransition>
  );
}

// ─── Add DoT Server Dialog ──────────────────────────────────

function AddDotServerDialog({
  open,
  onOpenChange,
  onAdd,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (server: DotServer) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("853");

  useEffect(() => {
    if (open) {
      setName("");
      setAddress("");
      setPort("853");
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;

    onAdd({
      name: name.trim(),
      address: address.trim(),
      port: parseInt(port, 10) || 853,
      enabled: true,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Add DoT Upstream Server
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
              placeholder="Cloudflare"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dot-address" className="text-xs text-slate-400">
              Address
            </Label>
            <Input
              id="dot-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="1.1.1.1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dot-port" className="text-xs text-slate-400">
              Port
            </Label>
            <Input
              id="dot-port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="853"
            />
          </div>
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
              disabled={saving || !address.trim()}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Add Server
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
