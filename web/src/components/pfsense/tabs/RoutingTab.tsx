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
      <Badge variant="outline" className="border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]">
        {status}
      </Badge>
    );
  }
  if (s === "down" || s === "offline") {
    return (
      <Badge variant="outline" className="border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]">
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]">
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
      <Card className="border-mesh-border bg-mesh-surface-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-mesh-primary" />
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
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-mesh-text-mute">
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
                      <td colSpan={7} className="px-3 py-8 text-center text-mesh-text-mute">
                        No gateways
                      </td>
                    </tr>
                  ) : (
                    (gateways ?? []).map((g) => (
                      <tr key={g.name} className="border-b border-mesh-border hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 font-medium text-white">{g.name}</td>
                        <td className="px-3 py-2 text-mesh-text">{g.interface}</td>
                        <td className="px-3 py-2 font-mono text-mesh-text">{g.gateway_ip}</td>
                        <td className="px-3 py-2 font-mono text-mesh-text-dim">{g.monitor_ip ?? "\u2014"}</td>
                        <td className="px-3 py-2">{gatewayStatusBadge(g.status)}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{g.delay ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{g.loss ?? "\u2014"}</td>
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
      <Card className="border-mesh-border bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-mesh-primary" />
            Static Routes
          </CardTitle>
          <Button size="sm" className="bg-mesh-primary hover:bg-mesh-primary" onClick={() => setShowCreate(true)}>
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
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-mesh-text-mute">
                    <th className="px-3 py-2">Network</th>
                    <th className="px-3 py-2">Gateway</th>
                    <th className="px-3 py-2">Interface</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(routes ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-mesh-text-mute">
                        No static routes
                      </td>
                    </tr>
                  ) : (
                    (routes ?? []).map((r, i) => (
                      <tr key={`${r.network}-${i}`} className="border-b border-mesh-border hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 font-mono text-white">{r.network}</td>
                        <td className="px-3 py-2 font-mono text-mesh-text">{r.gateway}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{r.interface ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[#fb7185] hover:text-[#fb7185]"
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
        <DialogContent className="border-mesh-border bg-mesh-surface-1">
          <DialogHeader>
            <DialogTitle className="text-white">Add Static Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-mesh-text">Network</Label>
              <Input
                placeholder="10.0.0.0/24"
                value={form.network}
                onChange={(e) => setForm({ ...form, network: e.target.value })}
                className="border-mesh-border bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-mesh-text">Gateway</Label>
              <Input
                placeholder="192.168.1.1"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="border-mesh-border bg-mesh-surface-1 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-mesh-text">Interface (optional)</Label>
              <Input
                placeholder="wan, lan..."
                value={form.interface}
                onChange={(e) => setForm({ ...form, interface: e.target.value })}
                className="border-mesh-border bg-mesh-surface-1 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-mesh-text-dim">
              Cancel
            </Button>
            <Button
              className="bg-mesh-primary hover:bg-mesh-primary"
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
        <AlertDialogContent className="border-mesh-border bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Static Route</AlertDialogTitle>
            <AlertDialogDescription className="text-mesh-text-dim">
              Delete route for {deleteTarget?.network}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-mesh-border-strong text-mesh-text-dim">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-[#fb7185] hover:bg-[#fb7185]" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
