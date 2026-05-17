"use client";

import { useCallback, useState } from "react";
import { Shield, Plus, Pencil, Trash2, Power } from "lucide-react";
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
  fetchPfsenseFirewallRules,
  createPfsenseFirewallRule,
  updatePfsenseFirewallRule,
  deletePfsenseFirewallRule,
  togglePfsenseFirewallRule,
  fetchPfsenseNatRules,
  createPfsenseNatRule,
  updatePfsenseNatRule,
  deletePfsenseNatRule,
  fetchPfsenseAliases,
  createPfsenseAlias,
  updatePfsenseAlias,
  deletePfsenseAlias,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseFirewallRule, PfsenseNatRule, PfsenseAlias } from "@/lib/types";

// ── Action Badge ─────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  switch (action) {
    case "pass":
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          Pass
        </Badge>
      );
    case "block":
      return (
        <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
          Block
        </Badge>
      );
    case "reject":
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
          Reject
        </Badge>
      );
    default:
      return <Badge variant="outline" className="border-slate-600 text-slate-400">{action}</Badge>;
  }
}

// ── Filter Rules Sub-Tab ─────────────────────────────────

interface EditableRule {
  id?: string;
  action: "pass" | "block" | "reject";
  interface: string;
  protocol: string;
  source: string;
  destination: string;
  port: string;
  description: string;
  disabled: boolean;
  log: boolean;
}

const EMPTY_RULE: EditableRule = {
  action: "pass",
  interface: "wan",
  protocol: "",
  source: "any",
  destination: "any",
  port: "",
  description: "",
  disabled: false,
  log: false,
};

function FilterRulesSection() {
  const fetcher = useCallback(() => fetchPfsenseFirewallRules(), []);
  const { data: rules, loading, reload } = useData(fetcher);
  const [editRule, setEditRule] = useState<EditableRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseFirewallRule | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => setEditRule({ ...EMPTY_RULE });
  const openEdit = (r: PfsenseFirewallRule) =>
    setEditRule({
      id: r.id,
      action: r.action,
      interface: r.interface,
      protocol: r.protocol ?? "",
      source: r.source,
      destination: r.destination,
      port: r.port ?? "",
      description: r.description ?? "",
      disabled: r.disabled,
      log: r.log,
    });

  const handleSave = async () => {
    if (!editRule) return;
    setSaving(true);
    try {
      const body = {
        action: editRule.action,
        type: editRule.action as "pass" | "block" | "reject",
        interface: editRule.interface,
        protocol: editRule.protocol || null,
        source: editRule.source,
        destination: editRule.destination,
        port: editRule.port || null,
        description: editRule.description || null,
        disabled: editRule.disabled,
        log: editRule.log,
      };
      if (editRule.id) {
        await updatePfsenseFirewallRule(editRule.id, body);
        toast.success("Rule updated");
      } else {
        await createPfsenseFirewallRule(body);
        toast.success("Rule created");
      }
      setEditRule(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseFirewallRule(deleteTarget.id);
      toast.success("Rule deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    }
  };

  const handleToggle = async (r: PfsenseFirewallRule) => {
    try {
      await togglePfsenseFirewallRule(r.id, !r.disabled);
      toast.success(r.disabled ? "Rule enabled" : "Rule disabled");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle rule");
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-4 w-4 text-blue-400" />
            Filter Rules
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Interface</th>
                  <th className="px-3 py-2">Protocol</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Destination</th>
                  <th className="px-3 py-2">Port</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rules ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No filter rules
                    </td>
                  </tr>
                ) : (
                  (rules ?? []).map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-mesh-border-strong hover:bg-mesh-surface-2 ${r.disabled ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2"><ActionBadge action={r.action} /></td>
                      <td className="px-3 py-2 text-slate-300">{r.interface}</td>
                      <td className="px-3 py-2 text-slate-400">{r.protocol ?? "*"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.source}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.destination}</td>
                      <td className="px-3 py-2 text-slate-400">{r.port ?? "*"}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">{r.description ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-400 hover:text-white"
                            onClick={() => handleToggle(r)}
                            title={r.disabled ? "Enable" : "Disable"}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-400 hover:text-white"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-400 hover:text-rose-300"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)}>
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editRule?.id ? "Edit Rule" : "Create Rule"}
            </DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Action</Label>
                <select
                  value={editRule.action}
                  onChange={(e) => setEditRule({ ...editRule, action: e.target.value as "pass" | "block" | "reject" })}
                  className="w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1 px-3 py-2 text-sm text-white"
                >
                  <option value="pass">Pass</option>
                  <option value="block">Block</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Interface</Label>
                <Input
                  value={editRule.interface}
                  onChange={(e) => setEditRule({ ...editRule, interface: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Protocol</Label>
                <Input
                  placeholder="tcp, udp, icmp..."
                  value={editRule.protocol}
                  onChange={(e) => setEditRule({ ...editRule, protocol: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Port</Label>
                <Input
                  placeholder="80, 443, 1000-2000"
                  value={editRule.port}
                  onChange={(e) => setEditRule({ ...editRule, port: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Source</Label>
                <Input
                  value={editRule.source}
                  onChange={(e) => setEditRule({ ...editRule, source: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Destination</Label>
                <Input
                  value={editRule.destination}
                  onChange={(e) => setEditRule({ ...editRule, destination: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input
                  value={editRule.description}
                  onChange={(e) => setEditRule({ ...editRule, description: e.target.value })}
                  className="border-mesh-border-strong bg-mesh-surface-1 text-white"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRule(null)} className="text-slate-400">
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editRule?.id ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Filter Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete rule &quot;{deleteTarget?.description || deleteTarget?.id}&quot;? This cannot be undone.
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

// ── NAT Sub-Tab ──────────────────────────────────────────

const EMPTY_NAT = {
  interface: "wan",
  protocol: "",
  source: "any",
  destination: "any",
  target: "",
  local_port: "",
  description: "",
  disabled: false,
};

function NatSection() {
  const fetcher = useCallback(() => fetchPfsenseNatRules(), []);
  const { data: rules, loading, reload } = useData(fetcher);
  const [editRule, setEditRule] = useState<(typeof EMPTY_NAT & { id?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseNatRule | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => setEditRule({ ...EMPTY_NAT });
  const openEdit = (r: PfsenseNatRule) =>
    setEditRule({
      id: r.id,
      interface: r.interface,
      protocol: r.protocol ?? "",
      source: r.source,
      destination: r.destination,
      target: r.target,
      local_port: r.local_port ?? "",
      description: r.description ?? "",
      disabled: r.disabled,
    });

  const handleSave = async () => {
    if (!editRule) return;
    setSaving(true);
    try {
      const body = {
        interface: editRule.interface,
        protocol: editRule.protocol || null,
        source: editRule.source,
        destination: editRule.destination,
        target: editRule.target,
        local_port: editRule.local_port || null,
        description: editRule.description || null,
        disabled: editRule.disabled,
      };
      if (editRule.id) {
        await updatePfsenseNatRule(editRule.id, body);
        toast.success("NAT rule updated");
      } else {
        await createPfsenseNatRule(body);
        toast.success("NAT rule created");
      }
      setEditRule(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save NAT rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseNatRule(deleteTarget.id);
      toast.success("NAT rule deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete NAT rule");
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-4 w-4 text-blue-400" />
            NAT Rules
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add NAT Rule
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Interface</th>
                  <th className="px-3 py-2">Protocol</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Destination</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Local Port</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rules ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      No NAT rules
                    </td>
                  </tr>
                ) : (
                  (rules ?? []).map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-mesh-border-strong hover:bg-mesh-surface-2 ${r.disabled ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-slate-300">{r.interface}</td>
                      <td className="px-3 py-2 text-slate-400">{r.protocol ?? "*"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.source}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.destination}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white">{r.target}</td>
                      <td className="px-3 py-2 text-slate-400">{r.local_port ?? "*"}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">{r.description ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)}>
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editRule?.id ? "Edit NAT Rule" : "Create NAT Rule"}
            </DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Interface</Label>
                <Input value={editRule.interface} onChange={(e) => setEditRule({ ...editRule, interface: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Protocol</Label>
                <Input placeholder="tcp, udp" value={editRule.protocol} onChange={(e) => setEditRule({ ...editRule, protocol: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Source</Label>
                <Input value={editRule.source} onChange={(e) => setEditRule({ ...editRule, source: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Destination</Label>
                <Input value={editRule.destination} onChange={(e) => setEditRule({ ...editRule, destination: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Target</Label>
                <Input placeholder="192.168.1.100" value={editRule.target} onChange={(e) => setEditRule({ ...editRule, target: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Local Port</Label>
                <Input placeholder="80" value={editRule.local_port} onChange={(e) => setEditRule({ ...editRule, local_port: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input value={editRule.description} onChange={(e) => setEditRule({ ...editRule, description: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRule(null)} className="text-slate-400">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editRule?.id ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete NAT Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete NAT rule &quot;{deleteTarget?.description || deleteTarget?.id}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-mesh-border-strong text-slate-400">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Aliases Sub-Tab ──────────────────────────────────────

const EMPTY_ALIAS = { name: "", alias_type: "host", address: "", description: "" };

function AliasesSection() {
  const fetcher = useCallback(() => fetchPfsenseAliases(), []);
  const { data: aliases, loading, reload } = useData(fetcher);
  const [editAlias, setEditAlias] = useState<(typeof EMPTY_ALIAS & { originalName?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseAlias | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => setEditAlias({ ...EMPTY_ALIAS });
  const openEdit = (a: PfsenseAlias) =>
    setEditAlias({
      originalName: a.name,
      name: a.name,
      alias_type: a.alias_type,
      address: a.address,
      description: a.description ?? "",
    });

  const handleSave = async () => {
    if (!editAlias) return;
    setSaving(true);
    try {
      const body = {
        name: editAlias.name,
        alias_type: editAlias.alias_type,
        type: editAlias.alias_type,
        address: editAlias.address,
        description: editAlias.description || null,
      };
      if (editAlias.originalName) {
        await updatePfsenseAlias(editAlias.originalName, body);
        toast.success("Alias updated");
      } else {
        await createPfsenseAlias(body);
        toast.success("Alias created");
      }
      setEditAlias(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save alias");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseAlias(deleteTarget.name);
      toast.success("Alias deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete alias");
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-mesh-border-strong bg-mesh-surface-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="h-4 w-4 text-blue-400" />
            Aliases
          </CardTitle>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Alias
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(aliases ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">No aliases</td>
                  </tr>
                ) : (
                  (aliases ?? []).map((a) => (
                    <tr key={a.name} className="border-b border-mesh-border-strong hover:bg-mesh-surface-2">
                      <td className="px-3 py-2 font-medium text-white">{a.name}</td>
                      <td className="px-3 py-2 text-slate-400">{a.alias_type}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300 max-w-[300px] truncate">{a.address}</td>
                      <td className="px-3 py-2 text-slate-400">{a.description ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" onClick={() => openEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300" onClick={() => setDeleteTarget(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editAlias} onOpenChange={(o) => !o && setEditAlias(null)}>
        <DialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editAlias?.originalName ? "Edit Alias" : "Create Alias"}
            </DialogTitle>
          </DialogHeader>
          {editAlias && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Name</Label>
                <Input value={editAlias.name} onChange={(e) => setEditAlias({ ...editAlias, name: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Type</Label>
                <select
                  value={editAlias.alias_type}
                  onChange={(e) => setEditAlias({ ...editAlias, alias_type: e.target.value })}
                  className="w-full rounded-md border border-mesh-border-strong bg-mesh-surface-1 px-3 py-2 text-sm text-white"
                >
                  <option value="host">Host</option>
                  <option value="network">Network</option>
                  <option value="port">Port</option>
                  <option value="url">URL</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Address</Label>
                <Input placeholder="Space-separated values" value={editAlias.address} onChange={(e) => setEditAlias({ ...editAlias, address: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input value={editAlias.description} onChange={(e) => setEditAlias({ ...editAlias, description: e.target.value })} className="border-mesh-border-strong bg-mesh-surface-1 text-white" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditAlias(null)} className="text-slate-400">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving || !editAlias?.name || !editAlias?.address}>
              {saving ? "Saving..." : editAlias?.originalName ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-mesh-border-strong bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Alias</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete alias &quot;{deleteTarget?.name}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-mesh-border-strong text-slate-400">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Firewall Tab (Orchestrator) ──────────────────────────

export function FirewallTab() {
  return (
    <Tabs defaultValue="rules" className="w-full">
      <TabsList className="border-mesh-border-strong bg-mesh-surface-1">
        <TabsTrigger value="rules">Filter Rules</TabsTrigger>
        <TabsTrigger value="nat">NAT</TabsTrigger>
        <TabsTrigger value="aliases">Aliases</TabsTrigger>
      </TabsList>
      <TabsContent value="rules">
        <FilterRulesSection />
      </TabsContent>
      <TabsContent value="nat">
        <NatSection />
      </TabsContent>
      <TabsContent value="aliases">
        <AliasesSection />
      </TabsContent>
    </Tabs>
  );
}
