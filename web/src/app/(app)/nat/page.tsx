"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
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
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchVyosDnatRules,
  createVyosDnatRule,
  updateVyosDnatRule,
  deleteVyosDnatRule,
  fetchMikrotikNatRules,
  createMikrotikNatRule,
  updateMikrotikNatRule,
  deleteMikrotikNatRule,
  fetchRouterStatus,
  fetchMikrotikStatus,
} from "@/lib/api";
import type {
  NatDestinationRule,
  MikrotikNatRuleResponse,
  VyosDnatRequest,
  MikrotikNatRuleRequest,
  RouterStatus,
  MikrotikStatus,
} from "@/lib/types";
import { toast } from "sonner";

// ── VyOS DNAT Form State ────────────────────────────────────

interface VyosDnatForm {
  rule_number: string;
  external_port: string;
  internal_ip: string;
  internal_port: string;
  protocol: string;
  inbound_interface: string;
  description: string;
}

const emptyVyosForm: VyosDnatForm = {
  rule_number: "",
  external_port: "",
  internal_ip: "",
  internal_port: "",
  protocol: "tcp",
  inbound_interface: "",
  description: "",
};

// ── MikroTik NAT Form State ────────────────────────────────

interface MtNatForm {
  chain: string;
  action: string;
  protocol: string;
  dst_port: string;
  to_addresses: string;
  to_ports: string;
  comment: string;
}

const emptyMtForm: MtNatForm = {
  chain: "dstnat",
  action: "dst-nat",
  protocol: "tcp",
  dst_port: "",
  to_addresses: "",
  to_ports: "",
  comment: "",
};

export default function NatPage() {
  // ── Router status ─────────────────────────────────────────
  const [vyosStatus, setVyosStatus] = useState<RouterStatus | null>(null);
  const [mtStatus, setMtStatus] = useState<MikrotikStatus | null>(null);

  // ── VyOS state ────────────────────────────────────────────
  const [vyosRules, setVyosRules] = useState<NatDestinationRule[] | null>(null);
  const [vyosForm, setVyosForm] = useState<VyosDnatForm>(emptyVyosForm);
  const [vyosDialogOpen, setVyosDialogOpen] = useState(false);
  const [vyosEditing, setVyosEditing] = useState<number | null>(null);
  const [vyosDeletePending, setVyosDeletePending] = useState<number | null>(null);
  const [vyosSaving, setVyosSaving] = useState(false);

  // ── MikroTik state ────────────────────────────────────────
  const [mtRules, setMtRules] = useState<MikrotikNatRuleResponse[] | null>(null);
  const [mtForm, setMtForm] = useState<MtNatForm>(emptyMtForm);
  const [mtDialogOpen, setMtDialogOpen] = useState(false);
  const [mtEditingId, setMtEditingId] = useState<string | null>(null);
  const [mtDeletePending, setMtDeletePending] = useState<string | null>(null);
  const [mtSaving, setMtSaving] = useState(false);

  // ── Load data ─────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const [vs, ms] = await Promise.all([
        fetchRouterStatus().catch(() => null),
        fetchMikrotikStatus().catch(() => null),
      ]);
      setVyosStatus(vs);
      setMtStatus(ms);
    } catch {
      // ignore
    }
  }, []);

  const loadVyos = useCallback(async () => {
    try {
      const data = await fetchVyosDnatRules();
      setVyosRules(data.rules);
    } catch (e) {
      if (vyosStatus?.configured) {
        toast.error(`Failed to load VyOS DNAT rules: ${e}`);
      }
      setVyosRules([]);
    }
  }, [vyosStatus?.configured]);

  const loadMikrotik = useCallback(async () => {
    try {
      const data = await fetchMikrotikNatRules();
      setMtRules(data);
    } catch (e) {
      if (mtStatus?.configured) {
        toast.error(`Failed to load MikroTik NAT rules: ${e}`);
      }
      setMtRules([]);
    }
  }, [mtStatus?.configured]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (vyosStatus?.configured && vyosStatus?.reachable) loadVyos();
  }, [vyosStatus, loadVyos]);

  useEffect(() => {
    if (mtStatus?.configured && mtStatus?.reachable) loadMikrotik();
  }, [mtStatus, loadMikrotik]);

  // ── VyOS CRUD handlers ────────────────────────────────────

  const openVyosCreate = () => {
    setVyosForm(emptyVyosForm);
    setVyosEditing(null);
    setVyosDialogOpen(true);
  };

  const openVyosEdit = (rule: NatDestinationRule) => {
    setVyosForm({
      rule_number: String(rule.rule),
      external_port: rule.external_port ?? "",
      internal_ip: rule.internal_ip ?? "",
      internal_port: rule.internal_port ?? "",
      protocol: rule.protocol ?? "tcp",
      inbound_interface: rule.inbound_interface ?? "",
      description: rule.description ?? "",
    });
    setVyosEditing(rule.rule);
    setVyosDialogOpen(true);
  };

  const handleVyosSave = async () => {
    const body: VyosDnatRequest = {
      rule_number: Number(vyosForm.rule_number),
      external_port: Number(vyosForm.external_port),
      internal_ip: vyosForm.internal_ip.trim(),
      internal_port: Number(vyosForm.internal_port),
      protocol: vyosForm.protocol || "tcp",
      inbound_interface: vyosForm.inbound_interface.trim() || undefined,
      description: vyosForm.description.trim() || undefined,
    };

    if (!body.rule_number || body.rule_number < 1 || body.rule_number > 99999) {
      toast.error("Rule number must be between 1 and 99999");
      return;
    }
    if (!body.external_port) {
      toast.error("External port is required");
      return;
    }
    if (!body.internal_ip) {
      toast.error("Internal IP is required");
      return;
    }
    if (!body.internal_port) {
      toast.error("Internal port is required");
      return;
    }

    setVyosSaving(true);
    try {
      if (vyosEditing !== null) {
        await updateVyosDnatRule(vyosEditing, body);
        toast.success(`DNAT rule ${vyosEditing} updated`);
      } else {
        await createVyosDnatRule(body);
        toast.success(`DNAT rule ${body.rule_number} created`);
      }
      setVyosDialogOpen(false);
      await loadVyos();
    } catch (e) {
      toast.error(`Failed to save DNAT rule: ${e}`);
    } finally {
      setVyosSaving(false);
    }
  };

  const handleVyosDelete = async () => {
    if (vyosDeletePending === null) return;
    try {
      await deleteVyosDnatRule(vyosDeletePending);
      toast.success(`DNAT rule ${vyosDeletePending} deleted`);
      setVyosDeletePending(null);
      await loadVyos();
    } catch (e) {
      toast.error(`Failed to delete DNAT rule: ${e}`);
    }
  };

  // ── MikroTik CRUD handlers ────────────────────────────────

  const openMtCreate = () => {
    setMtForm(emptyMtForm);
    setMtEditingId(null);
    setMtDialogOpen(true);
  };

  const openMtEdit = (rule: MikrotikNatRuleResponse) => {
    setMtForm({
      chain: rule.chain ?? "dstnat",
      action: rule.action ?? "dst-nat",
      protocol: rule.protocol ?? "",
      dst_port: rule.dst_port ?? "",
      to_addresses: rule.to_addresses ?? "",
      to_ports: rule.to_ports ?? "",
      comment: rule.comment ?? "",
    });
    setMtEditingId(rule.id ?? null);
    setMtDialogOpen(true);
  };

  const handleMtSave = async () => {
    const body: MikrotikNatRuleRequest = {
      chain: mtForm.chain,
      action: mtForm.action,
      protocol: mtForm.protocol || undefined,
      dst_port: mtForm.dst_port || undefined,
      to_addresses: mtForm.to_addresses || undefined,
      to_ports: mtForm.to_ports || undefined,
      comment: mtForm.comment || undefined,
    };

    if (!body.chain || !body.action) {
      toast.error("Chain and action are required");
      return;
    }

    setMtSaving(true);
    try {
      if (mtEditingId) {
        await updateMikrotikNatRule(mtEditingId, body);
        toast.success("MikroTik NAT rule updated");
      } else {
        await createMikrotikNatRule(body);
        toast.success("MikroTik NAT rule created");
      }
      setMtDialogOpen(false);
      await loadMikrotik();
    } catch (e) {
      toast.error(`Failed to save NAT rule: ${e}`);
    } finally {
      setMtSaving(false);
    }
  };

  const handleMtDelete = async () => {
    if (!mtDeletePending) return;
    try {
      await deleteMikrotikNatRule(mtDeletePending);
      toast.success("MikroTik NAT rule deleted");
      setMtDeletePending(null);
      await loadMikrotik();
    } catch (e) {
      toast.error(`Failed to delete NAT rule: ${e}`);
    }
  };

  // ── Determine default tab ─────────────────────────────────

  const vyosAvailable = vyosStatus?.configured && vyosStatus?.reachable;
  const mtAvailable = mtStatus?.configured && mtStatus?.reachable;
  const defaultTab = vyosAvailable ? "vyos" : mtAvailable ? "mikrotik" : "vyos";

  // ── Render ────────────────────────────────────────────────

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">NAT / Port Forwarding</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage destination NAT (port forwarding) rules on VyOS and MikroTik routers
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">VyOS DNAT Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {vyosRules === null ? <Skeleton className="h-8 w-12" /> : vyosRules.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">VyOS Status</CardTitle>
            </CardHeader>
            <CardContent>
              {vyosStatus === null ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <Badge variant={vyosAvailable ? "default" : "secondary"}>
                  {vyosAvailable ? "Connected" : vyosStatus.configured ? "Unreachable" : "Not configured"}
                </Badge>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">MikroTik NAT Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {mtRules === null ? <Skeleton className="h-8 w-12" /> : mtRules.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">MikroTik Status</CardTitle>
            </CardHeader>
            <CardContent>
              {mtStatus === null ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <Badge variant={mtAvailable ? "default" : "secondary"}>
                  {mtAvailable ? "Connected" : mtStatus.configured ? "Unreachable" : "Not configured"}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="vyos">VyOS DNAT</TabsTrigger>
            <TabsTrigger value="mikrotik">MikroTik NAT</TabsTrigger>
          </TabsList>

          {/* ── VyOS Tab ──────────────────────────────────── */}
          <TabsContent value="vyos" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">VyOS Destination NAT Rules</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadVyos}
                  disabled={!vyosAvailable}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={openVyosCreate}
                  disabled={!vyosAvailable}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </div>
            </div>

            {!vyosAvailable ? (
              <Card>
                <CardContent className="py-10 text-center text-slate-400">
                  <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p>VyOS router is not configured or unreachable.</p>
                  <p className="mt-1 text-xs">Configure VyOS connection in Settings.</p>
                </CardContent>
              </Card>
            ) : vyosRules === null ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : vyosRules.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-slate-400">
                  <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p>No DNAT rules configured.</p>
                  <p className="mt-1 text-xs">Click &quot;Add Rule&quot; to create a port forwarding rule.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Rule #</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead>Interface</TableHead>
                        <TableHead>External Port</TableHead>
                        <TableHead>Internal IP</TableHead>
                        <TableHead>Internal Port</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vyosRules.map((rule) => (
                        <TableRow key={rule.rule}>
                          <TableCell className="font-mono">{rule.rule}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{rule.protocol ?? "—"}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {rule.inbound_interface ?? "any"}
                          </TableCell>
                          <TableCell className="font-mono">{rule.external_port ?? "—"}</TableCell>
                          <TableCell className="font-mono">{rule.internal_ip ?? "—"}</TableCell>
                          <TableCell className="font-mono">{rule.internal_port ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-slate-400">
                            {rule.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openVyosEdit(rule)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setVyosDeletePending(rule.rule)}
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── MikroTik Tab ──────────────────────────────── */}
          <TabsContent value="mikrotik" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">MikroTik NAT Rules</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMikrotik}
                  disabled={!mtAvailable}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={openMtCreate}
                  disabled={!mtAvailable}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </div>
            </div>

            {!mtAvailable ? (
              <Card>
                <CardContent className="py-10 text-center text-slate-400">
                  <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p>MikroTik router is not configured or unreachable.</p>
                  <p className="mt-1 text-xs">Configure MikroTik connection in Settings.</p>
                </CardContent>
              </Card>
            ) : mtRules === null ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : mtRules.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-slate-400">
                  <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p>No NAT rules configured.</p>
                  <p className="mt-1 text-xs">Click &quot;Add Rule&quot; to create a NAT rule.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chain</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead>Dst Port</TableHead>
                        <TableHead>To Addresses</TableHead>
                        <TableHead>To Ports</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mtRules.map((rule, idx) => (
                        <TableRow key={rule.id ?? idx}>
                          <TableCell>
                            <Badge variant="outline">{rule.chain ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>{rule.action ?? "—"}</TableCell>
                          <TableCell>{rule.protocol ?? "any"}</TableCell>
                          <TableCell className="font-mono">{rule.dst_port ?? "—"}</TableCell>
                          <TableCell className="font-mono">{rule.to_addresses ?? "—"}</TableCell>
                          <TableCell className="font-mono">{rule.to_ports ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-slate-400">
                            {rule.comment ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={rule.disabled ? "secondary" : "default"}>
                              {rule.disabled ? "Disabled" : "Active"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {rule.id && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openMtEdit(rule)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMtDeletePending(rule.id!)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-400" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* ── VyOS DNAT Dialog ──────────────────────────────── */}
        <Dialog open={vyosDialogOpen} onOpenChange={setVyosDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {vyosEditing !== null ? `Edit DNAT Rule ${vyosEditing}` : "Create DNAT Rule"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vyos-rule-number">Rule Number</Label>
                  <Input
                    id="vyos-rule-number"
                    type="number"
                    placeholder="e.g. 10"
                    value={vyosForm.rule_number}
                    onChange={(e) => setVyosForm({ ...vyosForm, rule_number: e.target.value })}
                    disabled={vyosEditing !== null}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vyos-protocol">Protocol</Label>
                  <select
                    id="vyos-protocol"
                    className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={vyosForm.protocol}
                    onChange={(e) => setVyosForm({ ...vyosForm, protocol: e.target.value })}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="tcp_udp">TCP+UDP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vyos-ext-port">External Port</Label>
                  <Input
                    id="vyos-ext-port"
                    type="number"
                    placeholder="e.g. 8080"
                    value={vyosForm.external_port}
                    onChange={(e) => setVyosForm({ ...vyosForm, external_port: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vyos-iface">Inbound Interface</Label>
                  <Input
                    id="vyos-iface"
                    placeholder="e.g. eth0 (optional)"
                    value={vyosForm.inbound_interface}
                    onChange={(e) => setVyosForm({ ...vyosForm, inbound_interface: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vyos-int-ip">Internal IP</Label>
                  <Input
                    id="vyos-int-ip"
                    placeholder="e.g. 192.168.1.100"
                    value={vyosForm.internal_ip}
                    onChange={(e) => setVyosForm({ ...vyosForm, internal_ip: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vyos-int-port">Internal Port</Label>
                  <Input
                    id="vyos-int-port"
                    type="number"
                    placeholder="e.g. 80"
                    value={vyosForm.internal_port}
                    onChange={(e) => setVyosForm({ ...vyosForm, internal_port: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vyos-desc">Description</Label>
                <Input
                  id="vyos-desc"
                  placeholder="Optional description"
                  value={vyosForm.description}
                  onChange={(e) => setVyosForm({ ...vyosForm, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setVyosDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleVyosSave} disabled={vyosSaving}>
                  {vyosSaving ? "Saving..." : vyosEditing !== null ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── MikroTik NAT Dialog ───────────────────────────── */}
        <Dialog open={mtDialogOpen} onOpenChange={setMtDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {mtEditingId ? "Edit NAT Rule" : "Create NAT Rule"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mt-chain">Chain</Label>
                  <select
                    id="mt-chain"
                    className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={mtForm.chain}
                    onChange={(e) => setMtForm({ ...mtForm, chain: e.target.value })}
                  >
                    <option value="dstnat">dstnat</option>
                    <option value="srcnat">srcnat</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mt-action">Action</Label>
                  <select
                    id="mt-action"
                    className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={mtForm.action}
                    onChange={(e) => setMtForm({ ...mtForm, action: e.target.value })}
                  >
                    <option value="dst-nat">dst-nat</option>
                    <option value="src-nat">src-nat</option>
                    <option value="masquerade">masquerade</option>
                    <option value="accept">accept</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mt-protocol">Protocol</Label>
                  <select
                    id="mt-protocol"
                    className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={mtForm.protocol}
                    onChange={(e) => setMtForm({ ...mtForm, protocol: e.target.value })}
                  >
                    <option value="">Any</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mt-dst-port">Destination Port</Label>
                  <Input
                    id="mt-dst-port"
                    placeholder="e.g. 8080"
                    value={mtForm.dst_port}
                    onChange={(e) => setMtForm({ ...mtForm, dst_port: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mt-to-addr">To Addresses</Label>
                  <Input
                    id="mt-to-addr"
                    placeholder="e.g. 192.168.1.100"
                    value={mtForm.to_addresses}
                    onChange={(e) => setMtForm({ ...mtForm, to_addresses: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mt-to-ports">To Ports</Label>
                  <Input
                    id="mt-to-ports"
                    placeholder="e.g. 80"
                    value={mtForm.to_ports}
                    onChange={(e) => setMtForm({ ...mtForm, to_ports: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-comment">Comment</Label>
                <Input
                  id="mt-comment"
                  placeholder="Optional comment"
                  value={mtForm.comment}
                  onChange={(e) => setMtForm({ ...mtForm, comment: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMtDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleMtSave} disabled={mtSaving}>
                  {mtSaving ? "Saving..." : mtEditingId ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── VyOS Delete Confirmation ──────────────────────── */}
        <AlertDialog
          open={vyosDeletePending !== null}
          onOpenChange={(open) => !open && setVyosDeletePending(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete DNAT Rule {vyosDeletePending}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the port forwarding rule from VyOS. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleVyosDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── MikroTik Delete Confirmation ──────────────────── */}
        <AlertDialog
          open={!!mtDeletePending}
          onOpenChange={(open) => !open && setMtDeletePending(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete MikroTik NAT Rule?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the NAT rule from the MikroTik router. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleMtDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}
