"use client";

import { useCallback, useState } from "react";
import { GitFork, Plus, Trash2 } from "lucide-react";
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
  fetchPfsenseGateways,
  fetchPfsenseRoutes,
  createPfsenseRoute,
  deletePfsenseRoute,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseRoute } from "@/lib/types";

function gatewayStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "online" || s === "none") {
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        {status}
      </Badge>
    );
  }
  if (s === "down" || s === "offline") {
    return (
      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
      {status}
    </Badge>
  );
}

export function RoutingTab() {
  const gatewaysFetcher = useCallback(() => fetchPfsenseGateways(), []);
  const routesFetcher = useCallback(() => fetchPfsenseRoutes(), []);
  const { data: gateways, loading: gatewaysLoading } = useData(gatewaysFetcher);
  const { data: routes, loading: routesLoading, reload: reloadRoutes } = useData(routesFetcher);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseRoute | null>(null);
  const [form, setForm] = useState({ network: "", gateway: "", interface: "" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPfsenseRoute({
        network: form.network,
        gateway: form.gateway,
      });
      toast.success("Static route created");
      setShowCreate(false);
      setForm({ network: "", gateway: "", interface: "" });
      reloadRoutes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create route");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseRoute(deleteTarget.network);
      toast.success("Static route deleted");
      setDeleteTarget(null);
      reloadRoutes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete route");
    }
  };

  return (
    <div className="space-y-6">
      {/* Gateways */}
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-blue-400" />
            Gateways
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gatewaysLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Interface</th>
                    <th className="px-3 py-2">Gateway IP</th>
                    <th className="px-3 py-2">Monitor IP</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Delay</th>
                    <th className="px-3 py-2">Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {(gateways ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                        No gateways
                      </td>
                    </tr>
                  ) : (
                    (gateways ?? []).map((g) => (
                      <tr key={g.name} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 font-medium text-white">{g.name}</td>
                        <td className="px-3 py-2 text-slate-300">{g.interface}</td>
                        <td className="px-3 py-2 font-mono text-slate-300">{g.gateway_ip}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{g.monitor_ip ?? "\u2014"}</td>
                        <td className="px-3 py-2">{gatewayStatusBadge(g.status)}</td>
                        <td className="px-3 py-2 text-slate-400">{g.delay ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-slate-400">{g.loss ?? "\u2014"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Static Routes */}
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-blue-400" />
            Static Routes
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Route
          </Button>
        </CardHeader>
        <CardContent>
          {routesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Network</th>
                    <th className="px-3 py-2">Gateway</th>
                    <th className="px-3 py-2">Interface</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(routes ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                        No static routes
                      </td>
                    </tr>
                  ) : (
                    (routes ?? []).map((r, i) => (
                      <tr key={`${r.network}-${i}`} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 font-mono text-white">{r.network}</td>
                        <td className="px-3 py-2 font-mono text-slate-300">{r.gateway}</td>
                        <td className="px-3 py-2 text-slate-400">{r.interface ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => setDeleteTarget(r)}
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
            <DialogTitle className="text-white">Add Static Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Network</Label>
              <Input
                placeholder="10.0.0.0/24"
                value={form.network}
                onChange={(e) => setForm({ ...form, network: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Gateway</Label>
              <Input
                placeholder="192.168.1.1"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="border-mesh-border-strong bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Interface (optional)</Label>
              <Input
                placeholder="wan, lan..."
                value={form.interface}
                onChange={(e) => setForm({ ...form, interface: e.target.value })}
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
              disabled={saving || !form.network || !form.gateway}
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
            <AlertDialogTitle className="text-white">Delete Static Route</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete route for {deleteTarget?.network}? This cannot be undone.
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
