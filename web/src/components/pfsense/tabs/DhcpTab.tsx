"use client";

import { useCallback, useState } from "react";
import { Server, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  fetchPfsenseDhcpLeases,
  fetchPfsenseDhcpStaticMappings,
  createPfsenseDhcpStaticMapping,
  deletePfsenseDhcpStaticMapping,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseDhcpStaticMapping } from "@/lib/types";

// ── Active Leases Sub-Tab ───────────────────────────────

function ActiveLeasesSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpLeases(), []);
  const { data: leases, loading } = useData(fetcher);

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card className="border-mesh-border-strong bg-mesh-surface-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Server className="h-4 w-4 text-blue-400" />
          Active Leases
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">MAC</th>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Interface</th>
              </tr>
            </thead>
            <tbody>
              {(leases ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No active leases
                  </td>
                </tr>
              ) : (
                (leases ?? []).map((l, i) => (
                  <tr key={`${l.mac}-${i}`} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                    <td className="px-3 py-2 font-mono text-white">{l.ip}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{l.mac}</td>
                    <td className="px-3 py-2 text-slate-300">{l.hostname ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{l.start ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{l.end ?? "\u2014"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          l.status === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-slate-600/30 bg-slate-600/10 text-slate-500"
                        }
                      >
                        {l.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{l.interface}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Static Mappings Sub-Tab ─────────────────────────────

function StaticMappingsSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpStaticMappings(), []);
  const { data: mappings, loading, reload } = useData(fetcher);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseDhcpStaticMapping | null>(null);
  const [form, setForm] = useState({ mac: "", ip: "", hostname: "", description: "", interface: "lan" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPfsenseDhcpStaticMapping(form);
      toast.success("Static mapping created");
      setShowCreate(false);
      setForm({ mac: "", ip: "", hostname: "", description: "", interface: "lan" });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseDhcpStaticMapping(deleteTarget.id);
      toast.success("Static mapping deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete mapping");
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Server className="h-4 w-4 text-blue-400" />
            Static Mappings
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Mapping
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">MAC</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Hostname</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Interface</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(mappings ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No static mappings
                    </td>
                  </tr>
                ) : (
                  (mappings ?? []).map((m) => (
                    <tr key={m.id} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                      <td className="px-3 py-2 font-mono text-white">{m.mac}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{m.ip}</td>
                      <td className="px-3 py-2 text-slate-300">{m.hostname ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{m.description ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{m.interface}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => setDeleteTarget(m)}
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
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <DialogHeader>
            <DialogTitle className="text-white">Add Static Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">MAC Address</Label>
              <Input
                placeholder="aa:bb:cc:dd:ee:ff"
                value={form.mac}
                onChange={(e) => setForm({ ...form, mac: e.target.value })}
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
              <Label className="text-slate-300">Hostname</Label>
              <Input
                placeholder="my-device"
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
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
              disabled={saving || !form.mac || !form.ip}
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
            <AlertDialogTitle className="text-white">Delete Static Mapping</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete mapping for {deleteTarget?.mac} ({deleteTarget?.ip})? This cannot be undone.
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
    </>
  );
}

// ── DHCP Tab (Orchestrator) ─────────────────────────────

export function DhcpTab() {
  return (
    <Tabs defaultValue="leases" className="w-full">
      <TabsList className="border-mesh-border-strong bg-mesh-surface-1">
        <TabsTrigger value="leases">Active Leases</TabsTrigger>
        <TabsTrigger value="mappings">Static Mappings</TabsTrigger>
      </TabsList>
      <TabsContent value="leases">
        <ActiveLeasesSection />
      </TabsContent>
      <TabsContent value="mappings">
        <StaticMappingsSection />
      </TabsContent>
    </Tabs>
  );
}
