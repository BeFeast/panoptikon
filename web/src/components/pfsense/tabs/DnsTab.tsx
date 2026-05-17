"use client";

import { useCallback, useState } from "react";
import { Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
  fetchPfsenseDnsConfig,
  fetchPfsenseDnsOverrides,
  createPfsenseDnsOverride,
  deletePfsenseDnsOverride,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseDnsOverride } from "@/lib/types";

export function DnsTab() {
  const configFetcher = useCallback(() => fetchPfsenseDnsConfig(), []);
  const overridesFetcher = useCallback(() => fetchPfsenseDnsOverrides(), []);
  const { data: config, loading: configLoading } = useData(configFetcher);
  const { data: overrides, loading: overridesLoading, reload: reloadOverrides } = useData(overridesFetcher);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseDnsOverride | null>(null);
  const [form, setForm] = useState({ host: "", domain: "", ip: "", description: "" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPfsenseDnsOverride(form);
      toast.success("DNS override created");
      setShowCreate(false);
      setForm({ host: "", domain: "", ip: "", description: "" });
      reloadOverrides();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create override");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseDnsOverride(deleteTarget.id);
      toast.success("DNS override deleted");
      setDeleteTarget(null);
      reloadOverrides();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete override");
    }
  };

  return (
    <div className="space-y-6">
      {/* DNS Resolver Config */}
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Globe className="h-4 w-4 text-blue-400" />
            Resolver Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : config ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">DNS Resolver (Unbound):</span>
                <Badge
                  variant="outline"
                  className={
                    config.resolver_enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-600/30 bg-slate-600/10 text-slate-500"
                  }
                >
                  {config.resolver_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              {config.servers.length > 0 && (
                <div>
                  <span className="text-sm text-slate-400">Upstream DNS Servers:</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {config.servers.map((s) => (
                      <Badge key={s} variant="outline" className="border-mesh-border-strong font-mono text-slate-300">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Failed to load DNS configuration</p>
          )}
        </CardContent>
      </Card>

      {/* Host Overrides */}
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Globe className="h-4 w-4 text-blue-400" />
            Host Overrides
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Override
          </Button>
        </CardHeader>
        <CardContent>
          {overridesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(overrides ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        No host overrides
                      </td>
                    </tr>
                  ) : (
                    (overrides ?? []).map((o) => (
                      <tr key={o.id} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 font-medium text-white">{o.host}</td>
                        <td className="px-3 py-2 text-slate-300">{o.domain}</td>
                        <td className="px-3 py-2 font-mono text-slate-300">{o.ip}</td>
                        <td className="px-3 py-2 text-slate-400">{o.description ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => setDeleteTarget(o)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <DialogHeader>
            <DialogTitle className="text-white">Add Host Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Host</Label>
              <Input
                placeholder="myhost"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Domain</Label>
              <Input
                placeholder="local.lan"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">IP Address</Label>
              <Input
                placeholder="192.168.1.100"
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Description</Label>
              <Input
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={saving || !form.host || !form.domain || !form.ip}
            >
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Host Override</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete override for {deleteTarget?.host}.{deleteTarget?.domain}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-mesh-border-strong text-slate-400">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
