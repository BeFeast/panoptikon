"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  AlertCircle,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCaddyStatus,
  fetchCaddyProxyHosts,
  createCaddyProxyHost,
  updateCaddyProxyHost,
  deleteCaddyProxyHost,
  toggleCaddyProxyHost,
  syncCaddyConfig,
} from "@/lib/api";
import type { CaddyProxyHost, CaddyProxyHostRequest } from "@/lib/types";
import { PageTransition } from "@/components/PageTransition";
import Link from "next/link";

export default function CaddyProxySettingsPage() {
  const [hosts, setHosts] = useState<CaddyProxyHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<CaddyProxyHost | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formDomain, setFormDomain] = useState("");
  const [formUpstream, setFormUpstream] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSslMode, setFormSslMode] = useState("disabled");

  // Flash messages
  const [flash, setFlash] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const showFlash = useCallback(
    (type: "success" | "error", msg: string) => {
      setFlash({ type, msg });
      setTimeout(() => setFlash(null), 4000);
    },
    [],
  );

  const loadData = useCallback(async () => {
    try {
      const [statusData, hostsData] = await Promise.all([
        fetchCaddyStatus(),
        fetchCaddyProxyHosts(),
      ]);
      setReachable(statusData.reachable);
      setHosts(hostsData);
    } catch {
      setReachable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreateDialog() {
    setEditingHost(null);
    setFormDomain("");
    setFormUpstream("");
    setFormEnabled(true);
    setFormSslMode("disabled");
    setDialogOpen(true);
  }

  function openEditDialog(host: CaddyProxyHost) {
    setEditingHost(host);
    setFormDomain(host.domain);
    setFormUpstream(host.upstream);
    setFormEnabled(host.enabled);
    setFormSslMode(host.ssl_mode);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const body: CaddyProxyHostRequest = {
      domain: formDomain,
      upstream: formUpstream,
      enabled: formEnabled,
      ssl_mode: formSslMode,
    };

    try {
      if (editingHost) {
        await updateCaddyProxyHost(editingHost.id, body);
        showFlash("success", "Proxy host updated.");
      } else {
        await createCaddyProxyHost(body);
        showFlash("success", "Proxy host created.");
      }
      setDialogOpen(false);
      await loadData();
    } catch (e) {
      showFlash("error", `Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteCaddyProxyHost(deleteId);
      showFlash("success", "Proxy host deleted.");
      setDeleteId(null);
      await loadData();
    } catch (e) {
      showFlash("error", `Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  async function handleToggle(host: CaddyProxyHost) {
    try {
      await toggleCaddyProxyHost(host.id, !host.enabled);
      await loadData();
    } catch (e) {
      showFlash("error", `Failed to toggle: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncCaddyConfig();
      showFlash("success", "Config synced to Caddy.");
      await loadData();
    } catch (e) {
      showFlash("error", `Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  const formValid = formDomain.trim().length > 0 && formUpstream.trim().length > 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-semibold text-white">Caddy Proxy</h1>
            {reachable !== null && (
              <Badge
                variant="outline"
                className={
                  reachable
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-rose-500/30 text-rose-400"
                }
              >
                {reachable ? "Connected" : "Unreachable"}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              {syncing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Sync to Caddy
            </Button>
            <Button
              size="sm"
              onClick={openCreateDialog}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Host
            </Button>
          </div>
        </div>

        {/* Flash message */}
        {flash && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
              flash.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            }`}
          >
            {flash.type === "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <p
              className={`text-xs ${flash.type === "success" ? "text-emerald-400" : "text-rose-400"}`}
            >
              {flash.msg}
            </p>
          </div>
        )}

        {/* Hosts table */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Globe className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Proxy Hosts
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Manage reverse proxy hosts. Changes are synced to Caddy automatically.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full bg-slate-800" />
                <Skeleton className="h-10 w-full bg-slate-800" />
                <Skeleton className="h-10 w-full bg-slate-800" />
              </div>
            ) : hosts.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No proxy hosts configured. Click &quot;Add Host&quot; to create
                one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Domain</TableHead>
                    <TableHead className="text-slate-400">Upstream</TableHead>
                    <TableHead className="text-slate-400">SSL</TableHead>
                    <TableHead className="text-center text-slate-400">
                      Enabled
                    </TableHead>
                    <TableHead className="text-right text-slate-400">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hosts.map((host) => (
                    <TableRow
                      key={host.id}
                      className="border-slate-800 hover:bg-slate-800/50"
                    >
                      <TableCell className="font-medium text-white">
                        {host.domain}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {host.upstream}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            host.ssl_mode === "disabled"
                              ? "border-slate-700 text-slate-500"
                              : "border-emerald-500/30 text-emerald-400"
                          }
                        >
                          {host.ssl_mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={host.enabled}
                          onCheckedChange={() => handleToggle(host)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(host)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(host.id)}
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="border-slate-800 bg-slate-900 text-white">
            <DialogHeader>
              <DialogTitle>
                {editingHost ? "Edit Proxy Host" : "Add Proxy Host"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="domain" className="text-xs text-slate-400">
                  Domain
                </Label>
                <Input
                  id="domain"
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="app.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upstream" className="text-xs text-slate-400">
                  Upstream (host:port)
                </Label>
                <Input
                  id="upstream"
                  value={formUpstream}
                  onChange={(e) => setFormUpstream(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="localhost:3000"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled" className="text-xs text-slate-400">
                  Enabled
                </Label>
                <Switch
                  id="enabled"
                  checked={formEnabled}
                  onCheckedChange={setFormEnabled}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-slate-800 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!formValid || saving}
                  className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  {saving && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {editingHost ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog
          open={deleteId !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteId(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Proxy Host</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                This will remove the proxy host and sync the updated config to
                Caddy. This action cannot be undone.
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
