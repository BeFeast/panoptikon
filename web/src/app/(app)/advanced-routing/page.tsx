"use client";

import { useCallback, useState } from "react";
import {
  GitFork,
  Network,
  Shield,
  Activity,
  Plus,
  Trash2,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  fetchAdvancedRouting,
  createRoutingRule,
  deleteRoutingRule,
  createMangleRule,
  deleteMangleRule,
  createAdvancedRoute,
  deleteAdvancedRoute,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import { PageTransition } from "@/components/PageTransition";
import type {
  AdvancedRoutingData,
  RoutingRule,
  MangleRule,
  AdvancedRoute,
} from "@/lib/types";

/* ── Empty state ────────────────────────────────────────── */

function EmptyRow({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-slate-500">
        {label}
      </td>
    </tr>
  );
}

/* ── Policy-Based Routing Tab ───────────────────────────── */

function PbrTab({
  data,
  reload,
}: {
  data: AdvancedRoutingData | null;
  reload: () => void;
}) {
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showCreateMangle, setShowCreateMangle] = useState(false);
  const [deleteRule, setDeleteRule] = useState<RoutingRule | null>(null);
  const [deleteMangle, setDeleteMangle] = useState<MangleRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    src_address: "",
    dst_address: "",
    table: "",
    comment: "",
  });
  const [mangleForm, setMangleForm] = useState({
    chain: "prerouting",
    action: "mark-routing",
    new_routing_mark: "",
    src_address: "",
    dst_address: "",
    protocol: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);

  const handleCreateRule = async () => {
    setSaving(true);
    try {
      await createRoutingRule({
        src_address: ruleForm.src_address || undefined,
        dst_address: ruleForm.dst_address || undefined,
        action: "lookup",
        table: ruleForm.table || undefined,
        comment: ruleForm.comment || undefined,
      });
      toast.success("Routing rule created");
      setShowCreateRule(false);
      setRuleForm({ src_address: "", dst_address: "", table: "", comment: "" });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteRule?.id) return;
    try {
      await deleteRoutingRule(deleteRule.id);
      toast.success("Routing rule deleted");
      setDeleteRule(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    }
  };

  const handleCreateMangle = async () => {
    setSaving(true);
    try {
      await createMangleRule({
        chain: mangleForm.chain,
        action: mangleForm.action,
        new_routing_mark: mangleForm.new_routing_mark || undefined,
        src_address: mangleForm.src_address || undefined,
        dst_address: mangleForm.dst_address || undefined,
        protocol: mangleForm.protocol || undefined,
        comment: mangleForm.comment || undefined,
      });
      toast.success("Mangle rule created");
      setShowCreateMangle(false);
      setMangleForm({
        chain: "prerouting",
        action: "mark-routing",
        new_routing_mark: "",
        src_address: "",
        dst_address: "",
        protocol: "",
        comment: "",
      });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create mangle rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMangle = async () => {
    if (!deleteMangle?.id) return;
    try {
      await deleteMangleRule(deleteMangle.id);
      toast.success("Mangle rule deleted");
      setDeleteMangle(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete mangle rule");
    }
  };

  return (
    <div className="space-y-6">
      {/* Routing Rules */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-blue-400" />
            Routing Rules
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreateRule(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Src Address</th>
                  <th className="px-3 py-2">Dst Address</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.routing_rules ?? []).length === 0 ? (
                  <EmptyRow cols={7} label="No routing rules" />
                ) : (
                  data!.routing_rules.map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {r.src_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {r.dst_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{r.action ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.table ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{r.comment ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            r.disabled
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          }
                        >
                          {r.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => setDeleteRule(r)}
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

      {/* Mangle Rules (PBR marking) */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-4 w-4 text-purple-400" />
            Mangle Rules (PBR Marking)
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreateMangle(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Mangle
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Chain</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Routing Mark</th>
                  <th className="px-3 py-2">Src Address</th>
                  <th className="px-3 py-2">Protocol</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.mangle_rules ?? []).length === 0 ? (
                  <EmptyRow cols={8} label="No mangle rules" />
                ) : (
                  data!.mangle_rules.map((m, i) => (
                    <tr
                      key={m.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 text-slate-300">{m.chain ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">{m.action ?? "\u2014"}</td>
                      <td className="px-3 py-2 font-mono text-white">
                        {m.new_routing_mark ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {m.src_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{m.protocol ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{m.comment ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            m.disabled
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          }
                        >
                          {m.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => setDeleteMangle(m)}
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

      {/* Routing Tables */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="h-4 w-4 text-cyan-400" />
            Routing Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">FIB</th>
                  <th className="px-3 py-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {(data?.routing_tables ?? []).length === 0 ? (
                  <EmptyRow cols={3} label="No routing tables" />
                ) : (
                  data!.routing_tables.map((t, i) => (
                    <tr
                      key={t.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-medium text-white">{t.name ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">{t.fib ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{t.comment ?? "\u2014"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateRule} onOpenChange={setShowCreateRule}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Add Routing Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Source Address</Label>
              <Input
                placeholder="10.0.0.0/24"
                value={ruleForm.src_address}
                onChange={(e) => setRuleForm({ ...ruleForm, src_address: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Destination Address</Label>
              <Input
                placeholder="0.0.0.0/0"
                value={ruleForm.dst_address}
                onChange={(e) => setRuleForm({ ...ruleForm, dst_address: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Routing Table</Label>
              <Input
                placeholder="wan2"
                value={ruleForm.table}
                onChange={(e) => setRuleForm({ ...ruleForm, table: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Comment</Label>
              <Input
                placeholder="Route LAN2 via WAN2"
                value={ruleForm.comment}
                onChange={(e) => setRuleForm({ ...ruleForm, comment: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateRule(false)}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreateRule}
              disabled={saving || !ruleForm.table}
            >
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Mangle Dialog */}
      <Dialog open={showCreateMangle} onOpenChange={setShowCreateMangle}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Add Mangle Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">New Routing Mark</Label>
              <Input
                placeholder="wan2-mark"
                value={mangleForm.new_routing_mark}
                onChange={(e) =>
                  setMangleForm({ ...mangleForm, new_routing_mark: e.target.value })
                }
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Source Address</Label>
              <Input
                placeholder="10.0.0.0/24"
                value={mangleForm.src_address}
                onChange={(e) => setMangleForm({ ...mangleForm, src_address: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Destination Address</Label>
              <Input
                placeholder="0.0.0.0/0"
                value={mangleForm.dst_address}
                onChange={(e) => setMangleForm({ ...mangleForm, dst_address: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Protocol (optional)</Label>
              <Input
                placeholder="tcp, udp..."
                value={mangleForm.protocol}
                onChange={(e) => setMangleForm({ ...mangleForm, protocol: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Comment</Label>
              <Input
                placeholder="Mark LAN2 traffic"
                value={mangleForm.comment}
                onChange={(e) => setMangleForm({ ...mangleForm, comment: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateMangle(false)}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreateMangle}
              disabled={saving || !mangleForm.new_routing_mark}
            >
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirm */}
      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Routing Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete this routing rule? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={handleDeleteRule}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Mangle Confirm */}
      <AlertDialog open={!!deleteMangle} onOpenChange={(o) => !o && setDeleteMangle(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Mangle Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete this mangle rule? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={handleDeleteMangle}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Multi-WAN & Routes Tab ─────────────────────────────── */

function MultiWanTab({
  data,
  reload,
}: {
  data: AdvancedRoutingData | null;
  reload: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdvancedRoute | null>(null);
  const [form, setForm] = useState({
    dst_address: "",
    gateway: "",
    distance: "",
    routing_table: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createAdvancedRoute({
        dst_address: form.dst_address,
        gateway: form.gateway,
        distance: form.distance || undefined,
        routing_table: form.routing_table || undefined,
        comment: form.comment || undefined,
      });
      toast.success("Route created");
      setShowCreate(false);
      setForm({ dst_address: "", gateway: "", distance: "", routing_table: "", comment: "" });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create route");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteAdvancedRoute(deleteTarget.id);
      toast.success("Route deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete route");
    }
  };

  return (
    <div className="space-y-6">
      {/* Routes Table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <GitFork className="h-4 w-4 text-blue-400" />
            IP Routes
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Route
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Destination</th>
                  <th className="px-3 py-2">Gateway</th>
                  <th className="px-3 py-2">Distance</th>
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Comment</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.routes ?? []).length === 0 ? (
                  <EmptyRow cols={7} label="No routes" />
                ) : (
                  data!.routes.map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-mono text-white">{r.dst_address}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {r.gateway ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{r.distance ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {r.routing_table ?? "main"}
                      </td>
                      <td className="px-3 py-2">
                        {r.dynamic ? (
                          <Badge
                            variant="outline"
                            className="border-slate-500/30 bg-slate-500/10 text-slate-400"
                          >
                            Dynamic
                          </Badge>
                        ) : r.active ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
                          >
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{r.comment ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-right">
                        {!r.dynamic && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Add Route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Destination</Label>
              <Input
                placeholder="0.0.0.0/0"
                value={form.dst_address}
                onChange={(e) => setForm({ ...form, dst_address: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Gateway</Label>
              <Input
                placeholder="192.168.1.1"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Distance (optional)</Label>
              <Input
                placeholder="1"
                value={form.distance}
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Routing Table (optional)</Label>
              <Input
                placeholder="main"
                value={form.routing_table}
                onChange={(e) => setForm({ ...form, routing_table: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Comment (optional)</Label>
              <Input
                placeholder="Failover route via WAN2"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreate(false)}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={saving || !form.dst_address || !form.gateway}
            >
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Route</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete route for {deleteTarget?.dst_address}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Gateway Monitoring Tab ─────────────────────────────── */

function GatewayTab({ data }: { data: AdvancedRoutingData | null }) {
  // Gateway monitoring uses the routes that serve as default gateway entries
  const defaultRoutes = (data?.routes ?? []).filter(
    (r) => r.dst_address === "0.0.0.0/0" && r.gateway,
  );

  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Activity className="h-4 w-4 text-emerald-400" />
            Gateway Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {defaultRoutes.length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No default gateways found
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {defaultRoutes.map((r, i) => (
                <Card key={r.id ?? i} className="border-slate-700 bg-slate-800/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-white">{r.gateway}</span>
                      <Badge
                        variant="outline"
                        className={
                          r.active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        }
                      >
                        {r.active ? "Up" : "Down"}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-400">
                      <p>
                        Table: {r.routing_table ?? "main"} | Distance:{" "}
                        {r.distance ?? "0"}
                      </p>
                      {r.comment && <p>{r.comment}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All routes overview for multi-WAN context */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="h-4 w-4 text-blue-400" />
            All Routes by Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Destination</th>
                  <th className="px-3 py-2">Gateway</th>
                  <th className="px-3 py-2">Distance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.routes ?? []).length === 0 ? (
                  <EmptyRow cols={5} label="No routes" />
                ) : (
                  data!.routes.map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 text-slate-300">
                        {r.routing_table ?? "main"}
                      </td>
                      <td className="px-3 py-2 font-mono text-white">{r.dst_address}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {r.gateway ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{r.distance ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            r.active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                          }
                        >
                          {r.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Dynamic Routing Tab (BGP/OSPF) ────────────────────── */

function DynamicRoutingTab({ data }: { data: AdvancedRoutingData | null }) {
  return (
    <div className="space-y-6">
      {/* OSPF Instances */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="h-4 w-4 text-cyan-400" />
            OSPF Instances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Router ID</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ospf_instances ?? []).length === 0 ? (
                  <EmptyRow cols={5} label="No OSPF instances configured" />
                ) : (
                  data!.ospf_instances.map((o, i) => (
                    <tr
                      key={o.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-medium text-white">
                        {o.name ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {o.router_id ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{o.version ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            o.disabled
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          }
                        >
                          {o.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{o.comment ?? "\u2014"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* OSPF Neighbors */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Activity className="h-4 w-4 text-emerald-400" />
            OSPF Neighbors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Router ID</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Adjacency</th>
                  <th className="px-3 py-2">State Changes</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ospf_neighbors ?? []).length === 0 ? (
                  <EmptyRow cols={5} label="No OSPF neighbors" />
                ) : (
                  data!.ospf_neighbors.map((n, i) => (
                    <tr
                      key={n.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-mono text-white">
                        {n.address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {n.router_id ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            n.state?.toLowerCase() === "full"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          }
                        >
                          {n.state ?? "unknown"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {n.adjacency ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {n.state_changes ?? "\u2014"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* BGP Connections */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Globe className="h-4 w-4 text-orange-400" />
            BGP Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Remote Address</th>
                  <th className="px-3 py-2">Remote AS</th>
                  <th className="px-3 py-2">Local Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {(data?.bgp_connections ?? []).length === 0 ? (
                  <EmptyRow cols={6} label="No BGP connections configured" />
                ) : (
                  data!.bgp_connections.map((c, i) => (
                    <tr
                      key={c.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-medium text-white">
                        {c.name ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {c.remote_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{c.remote_as ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {c.local_role ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            c.disabled
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          }
                        >
                          {c.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{c.comment ?? "\u2014"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* BGP Sessions */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Globe className="h-4 w-4 text-orange-400" />
            BGP Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Remote Address</th>
                  <th className="px-3 py-2">Remote AS</th>
                  <th className="px-3 py-2">Established</th>
                  <th className="px-3 py-2">Uptime</th>
                  <th className="px-3 py-2">Prefixes</th>
                </tr>
              </thead>
              <tbody>
                {(data?.bgp_sessions ?? []).length === 0 ? (
                  <EmptyRow cols={6} label="No BGP sessions" />
                ) : (
                  data!.bgp_sessions.map((s, i) => (
                    <tr
                      key={s.id ?? i}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30"
                    >
                      <td className="px-3 py-2 font-medium text-white">
                        {s.name ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {s.remote_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{s.remote_as ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            s.established
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                          }
                        >
                          {s.established ? "Yes" : "No"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{s.uptime ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {s.prefix_count ?? "\u2014"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */

export default function AdvancedRoutingPage() {
  const fetcher = useCallback(() => fetchAdvancedRouting(), []);
  const { data, loading, reload } = useData(fetcher);

  return (
    <PageTransition>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Advanced Routing</h1>
          <p className="mt-1 text-sm text-slate-400">
            Policy-based routing, multi-WAN failover, gateway monitoring, and dynamic routing
            protocols (BGP/OSPF) via MikroTik.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="pbr" className="space-y-6">
            <TabsList className="bg-slate-800">
              <TabsTrigger value="pbr">Policy Routing</TabsTrigger>
              <TabsTrigger value="multiwan">Multi-WAN / Routes</TabsTrigger>
              <TabsTrigger value="gateways">Gateway Monitor</TabsTrigger>
              <TabsTrigger value="dynamic">BGP / OSPF</TabsTrigger>
            </TabsList>

            <TabsContent value="pbr">
              <PbrTab data={data} reload={reload} />
            </TabsContent>

            <TabsContent value="multiwan">
              <MultiWanTab data={data} reload={reload} />
            </TabsContent>

            <TabsContent value="gateways">
              <GatewayTab data={data} />
            </TabsContent>

            <TabsContent value="dynamic">
              <DynamicRoutingTab data={data} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageTransition>
  );
}
