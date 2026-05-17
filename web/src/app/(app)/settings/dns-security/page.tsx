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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mesh-border text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            DNS Security
          </h1>
        </div>

        {settings === null ? (
          <div className="space-y-6">
            <Skeleton className="h-40 w-full bg-mesh-surface-2/55" />
            <Skeleton className="h-40 w-full bg-mesh-surface-2/55" />
          </div>
        ) : (
          <>
            {/* DNSSEC Section */}
            <Card className="border-mesh-border bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4ade80]/10">
                      <ShieldCheck className="h-4 w-4 text-[#4ade80]" />
                    </div>
                    <div>
                      <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                        DNSSEC Validation
                      </CardTitle>
                      <p className="text-xs text-mesh-text-mute">
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
                <div className="rounded-md border border-mesh-border bg-mesh-surface-1/90 px-4 py-3">
                  <p className="text-xs text-mesh-text-dim">
                    When enabled, Unbound validates DNSSEC signatures on
                    responses. Domains with invalid or missing signatures will
                    return SERVFAIL. Requires Unbound to be configured as the
                    local resolver.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* DoT Section */}
            <Card className="border-mesh-border bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)]">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mesh-primary/10">
                      <Lock className="h-4 w-4 text-mesh-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                        DNS-over-TLS (DoT)
                      </CardTitle>
                      <p className="text-xs text-mesh-text-mute">
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
                  <p className="text-sm font-medium text-mesh-text">
                    Upstream DoT Servers
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowAddServer(true)}
                    className="bg-mesh-primary text-white hover:bg-mesh-primary"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Server
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="border-mesh-border-strong hover:bg-transparent">
                      <TableHead className="text-mesh-text-dim">Name</TableHead>
                      <TableHead className="text-mesh-text-dim">Address</TableHead>
                      <TableHead className="text-mesh-text-dim">Port</TableHead>
                      <TableHead className="text-mesh-text-dim">Status</TableHead>
                      <TableHead className="text-right text-mesh-text-dim">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.dot_servers.length === 0 ? (
                      <TableRow className="border-mesh-border-strong hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-mesh-text-mute"
                        >
                          No DoT upstream servers configured. Add a server to
                          encrypt DNS queries.
                        </TableCell>
                      </TableRow>
                    ) : (
                      settings.dot_servers.map((server, index) => (
                        <TableRow
                          key={`${server.address}-${index}`}
                          className="border-mesh-border hover:bg-mesh-surface-2/55"
                        >
                          <TableCell className="font-medium text-white">
                            {server.name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-mesh-text-dim">
                            {server.address}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-mesh-text-dim">
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
                              className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
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
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Add DoT Upstream Server
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dot-name" className="text-xs text-mesh-text-dim">
              Name
            </Label>
            <Input
              id="dot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="Cloudflare"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dot-address" className="text-xs text-mesh-text-dim">
              Address
            </Label>
            <Input
              id="dot-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="1.1.1.1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dot-port" className="text-xs text-mesh-text-dim">
              Port
            </Label>
            <Input
              id="dot-port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
              placeholder="853"
            />
          </div>
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
              disabled={saving || !address.trim()}
              className="bg-mesh-primary text-white hover:bg-mesh-primary"
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
