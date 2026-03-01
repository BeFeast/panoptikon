"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Router,
  Search,
  Trash2,
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
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchSettings,
  fetchNatSummary,
  fetchVyosNatRules,
  createVyosNatRule,
  updateVyosNatRule,
  deleteVyosNatRule,
  fetchMikrotikNatRules,
  createMikrotikNatRule,
  updateMikrotikNatRule,
  deleteMikrotikNatRule,
} from "@/lib/api";
import type {
  NatSummary,
  NatDestinationRule,
  MikrotikNatRuleWithId,
} from "@/lib/types";
import { toast } from "sonner";

export default function NatPage() {
  const [summary, setSummary] = useState<NatSummary | null>(null);
  const [legacyRoutersEnabled, setLegacyRoutersEnabled] = useState(false);
  const [vyosRules, setVyosRules] = useState<NatDestinationRule[] | null>(null);
  const [mtRules, setMtRules] = useState<MikrotikNatRuleWithId[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const vyosVisible = legacyRoutersEnabled && !!summary?.vyos_available;

  // Dialogs
  const [showAddVyos, setShowAddVyos] = useState(false);
  const [editVyosRule, setEditVyosRule] = useState<NatDestinationRule | null>(
    null
  );
  const [pendingDeleteVyos, setPendingDeleteVyos] =
    useState<NatDestinationRule | null>(null);
  const [showAddMt, setShowAddMt] = useState(false);
  const [editMtRule, setEditMtRule] = useState<MikrotikNatRuleWithId | null>(
    null
  );
  const [pendingDeleteMt, setPendingDeleteMt] =
    useState<MikrotikNatRuleWithId | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchNatSummary();
      setSummary(s);
    } catch {
      // summary is best-effort
    }
  }, []);

  const loadVyos = useCallback(async () => {
    try {
      const data = await fetchVyosNatRules();
      setVyosRules(data);
    } catch {
      setVyosRules([]);
    }
  }, []);

  const loadMt = useCallback(async () => {
    try {
      const data = await fetchMikrotikNatRules();
      setMtRules(data);
    } catch {
      setMtRules([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Default to MikroTik tab when available
  useEffect(() => {
    if (!summary) return;
    if (summary.mikrotik_available) {
      setActiveTab("mikrotik");
    } else if (summary.vyos_available) {
      setActiveTab("vyos");
    }
  }, [summary]);

  useEffect(() => {
    fetchSettings()
      .then((settings) => setLegacyRoutersEnabled(settings.show_legacy_routers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "vyos") loadVyos();
    if (activeTab === "mikrotik") loadMt();
  }, [activeTab, loadVyos, loadMt]);

  useEffect(() => {
    if (!vyosVisible && activeTab === "vyos") {
      setActiveTab("overview");
    }
  }, [activeTab, vyosVisible]);

  // -- Filter helpers --
  const filteredVyos = useMemo(() => {
    if (!vyosRules) return null;
    if (!search.trim()) return vyosRules;
    const q = search.toLowerCase();
    return vyosRules.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.internal_ip ?? "").toLowerCase().includes(q) ||
        (r.external_port ?? "").toLowerCase().includes(q) ||
        (r.protocol ?? "").toLowerCase().includes(q)
    );
  }, [vyosRules, search]);

  const filteredMt = useMemo(() => {
    if (!mtRules) return null;
    if (!search.trim()) return mtRules;
    const q = search.toLowerCase();
    return mtRules.filter(
      (r) =>
        (r.comment ?? "").toLowerCase().includes(q) ||
        (r.to_addresses ?? "").toLowerCase().includes(q) ||
        (r.dst_port ?? "").toLowerCase().includes(q) ||
        (r.action ?? "").toLowerCase().includes(q)
    );
  }, [mtRules, search]);

  // -- VyOS Handlers --
  async function handleDeleteVyos() {
    if (!pendingDeleteVyos) return;
    try {
      await deleteVyosNatRule(pendingDeleteVyos.rule);
      setVyosRules(
        (prev) =>
          prev?.filter((r) => r.rule !== pendingDeleteVyos.rule) ?? null
      );
      toast.success(`Deleted DNAT rule ${pendingDeleteVyos.rule}`);
      load();
    } catch {
      toast.error("Failed to delete DNAT rule");
    } finally {
      setPendingDeleteVyos(null);
    }
  }

  // -- MikroTik Handlers --
  async function handleDeleteMt() {
    if (!pendingDeleteMt || !pendingDeleteMt.id) return;
    try {
      await deleteMikrotikNatRule(pendingDeleteMt.id);
      setMtRules(
        (prev) => prev?.filter((r) => r.id !== pendingDeleteMt.id) ?? null
      );
      toast.success("Deleted MikroTik NAT rule");
      load();
    } catch {
      toast.error("Failed to delete MikroTik NAT rule");
    } finally {
      setPendingDeleteMt(null);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-semibold text-white">
              NAT / Port Forwarding
            </h1>
            <HelpTooltip text="View and manage DNAT (port forwarding) rules on your router. Supports VyOS and MikroTik." />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  load();
                  if (activeTab === "vyos") loadVyos();
                  if (activeTab === "mikrotik") loadMt();
                }}
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
              Reload NAT rules from the router
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {vyosVisible && (
            <SummaryCard
              title="VyOS DNAT Rules"
              value={summary?.vyos_rule_count ?? null}
              available={vyosVisible}
              icon={<Router className="h-4 w-4 text-blue-400" />}
            />
          )}
          <SummaryCard
            title="MikroTik NAT Rules"
            value={summary?.mikrotik_rule_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-orange-400" />}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>

            {summary?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                MikroTik NAT
              </TabsTrigger>
            )}
            {vyosVisible && (
              <TabsTrigger
                value="vyos"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                VyOS DNAT
              </TabsTrigger>
            )}
          </TabsList>

          {/* Search */}
          {activeTab !== "overview" && (
            <div className="relative mt-4 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Filter rules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-800 text-slate-300"
              />
            </div>
          )}

          {/* Overview Tab */}
          <TabsContent value="overview">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">
                  NAT / Port Forwarding Overview
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Manage destination NAT (port forwarding) rules on your
                  {vyosVisible ? " VyOS and MikroTik routers" : " MikroTik router"}.
                  Select a tab above to view and manage rules for each router type.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary === null ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-64 bg-slate-800" />
                    <Skeleton className="h-4 w-48 bg-slate-800" />
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 space-y-2">
                    {vyosVisible && (
                      <p>
                        VyOS router connected with {summary.vyos_rule_count} DNAT rule(s).
                      </p>
                    )}
                    <p>
                      {summary.mikrotik_available
                        ? `MikroTik router connected with ${summary.mikrotik_rule_count} NAT rule(s).`
                        : "MikroTik router not configured."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* VyOS Tab */}
          <TabsContent value="vyos">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">
                    VyOS Destination NAT Rules
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Port forwarding rules on the VyOS router.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddVyos(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Rule
                </Button>
              </CardHeader>
              <CardContent>
                {filteredVyos === null ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-10 bg-slate-800" />
                    ))}
                  </div>
                ) : filteredVyos.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    {search
                      ? "No matching rules."
                      : "No DNAT rules configured."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800">
                        <TableHead className="text-slate-400">Rule</TableHead>
                        <TableHead className="text-slate-400">
                          Description
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Protocol
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Ext. Port
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Internal IP
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Int. Port
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Interface
                        </TableHead>
                        <TableHead className="text-slate-400 text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVyos.map((rule) => (
                        <TableRow
                          key={rule.rule}
                          className="border-slate-800 hover:bg-slate-800/50"
                        >
                          <TableCell className="text-slate-200 font-mono">
                            {rule.rule}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {rule.description || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="bg-slate-800 text-slate-300"
                            >
                              {rule.protocol ?? "any"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.external_port ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.internal_ip ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.internal_port ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {rule.inbound_interface ?? "any"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditVyosRule(rule)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingDeleteVyos(rule)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
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
          </TabsContent>

          {/* MikroTik Tab */}
          <TabsContent value="mikrotik">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">
                    MikroTik NAT Rules
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Firewall NAT rules on the MikroTik router.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddMt(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Rule
                </Button>
              </CardHeader>
              <CardContent>
                {filteredMt === null ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-10 bg-slate-800" />
                    ))}
                  </div>
                ) : filteredMt.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    {search
                      ? "No matching rules."
                      : "No NAT rules configured."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800">
                        <TableHead className="text-slate-400">Chain</TableHead>
                        <TableHead className="text-slate-400">
                          Action
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Protocol
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Dst Port
                        </TableHead>
                        <TableHead className="text-slate-400">
                          To Address
                        </TableHead>
                        <TableHead className="text-slate-400">
                          To Port
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Comment
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Status
                        </TableHead>
                        <TableHead className="text-slate-400 text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMt.map((rule, idx) => (
                        <TableRow
                          key={rule.id ?? idx}
                          className="border-slate-800 hover:bg-slate-800/50"
                        >
                          <TableCell className="text-slate-300">
                            {rule.chain ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                rule.action === "dst-nat"
                                  ? "bg-blue-900/50 text-blue-300"
                                  : rule.action === "masquerade"
                                    ? "bg-green-900/50 text-green-300"
                                    : "bg-slate-800 text-slate-300"
                              }
                            >
                              {rule.action ?? "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {rule.protocol ?? "any"}
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.dst_port ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.to_addresses ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-300 font-mono">
                            {rule.to_ports ?? "-"}
                          </TableCell>
                          <TableCell className="text-slate-400 max-w-[200px] truncate">
                            {rule.comment ?? "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                rule.disabled
                                  ? "bg-slate-800 text-slate-500"
                                  : "bg-green-900/50 text-green-300"
                              }
                            >
                              {rule.disabled ? "Disabled" : "Active"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {rule.id && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditMtRule(rule)}
                                    className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPendingDeleteMt(rule)}
                                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* VyOS Add Dialog */}
        <VyosNatDialog
          open={showAddVyos}
          onOpenChange={setShowAddVyos}
          onSave={async (data) => {
            try {
              await createVyosNatRule(data);
              toast.success(`DNAT rule ${data.rule} created`);
              loadVyos();
              load();
              setShowAddVyos(false);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to create rule"
              );
            }
          }}
        />

        {/* VyOS Edit Dialog */}
        <VyosNatDialog
          open={!!editVyosRule}
          onOpenChange={(open) => {
            if (!open) setEditVyosRule(null);
          }}
          existing={editVyosRule}
          onSave={async (data) => {
            if (!editVyosRule) return;
            try {
              await updateVyosNatRule(editVyosRule.rule, {
                description: data.description,
                protocol: data.protocol,
                inbound_interface: data.inbound_interface,
                external_port: data.external_port,
                internal_ip: data.internal_ip,
                internal_port: data.internal_port,
              });
              toast.success(`DNAT rule ${editVyosRule.rule} updated`);
              loadVyos();
              load();
              setEditVyosRule(null);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to update rule"
              );
            }
          }}
        />

        {/* VyOS Delete Confirm */}
        <AlertDialog
          open={!!pendingDeleteVyos}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteVyos(null);
          }}
        >
          <AlertDialogContent className="bg-slate-900 border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete DNAT Rule
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete DNAT rule{" "}
                {pendingDeleteVyos?.rule}? This will remove the port forwarding
                from the VyOS router.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteVyos}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MikroTik Add Dialog */}
        <MikrotikNatDialog
          open={showAddMt}
          onOpenChange={setShowAddMt}
          onSave={async (data) => {
            try {
              await createMikrotikNatRule(data);
              toast.success("MikroTik NAT rule created");
              loadMt();
              load();
              setShowAddMt(false);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to create rule"
              );
            }
          }}
        />

        {/* MikroTik Edit Dialog */}
        <MikrotikNatDialog
          open={!!editMtRule}
          onOpenChange={(open) => {
            if (!open) setEditMtRule(null);
          }}
          existing={editMtRule}
          onSave={async (data) => {
            if (!editMtRule?.id) return;
            try {
              await updateMikrotikNatRule(editMtRule.id, data);
              toast.success("MikroTik NAT rule updated");
              loadMt();
              load();
              setEditMtRule(null);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to update rule"
              );
            }
          }}
        />

        {/* MikroTik Delete Confirm */}
        <AlertDialog
          open={!!pendingDeleteMt}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMt(null);
          }}
        >
          <AlertDialogContent className="bg-slate-900 border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete MikroTik NAT Rule
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete this NAT rule
                {pendingDeleteMt?.comment
                  ? ` (${pendingDeleteMt.comment})`
                  : ""}
                ? This will remove it from the MikroTik router.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMt}
                className="bg-red-600 hover:bg-red-700"
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

// ─── Summary Card ────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  available,
  icon,
}: {
  title: string;
  value: number | null;
  available: boolean | null;
  icon: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="flex items-center gap-3 pt-6">
        {icon}
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          {available === null ? (
            <Skeleton className="h-5 w-10 mt-1 bg-slate-800" />
          ) : available ? (
            <p className="text-lg font-semibold text-white">{value ?? 0}</p>
          ) : (
            <p className="text-sm text-slate-500">Not configured</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── VyOS NAT Dialog ─────────────────────────────────────────

function VyosNatDialog({
  open,
  onOpenChange,
  existing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: NatDestinationRule | null;
  onSave: (data: {
    rule: number;
    description?: string;
    protocol?: string;
    inbound_interface?: string;
    external_port: string;
    internal_ip: string;
    internal_port: string;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState("");
  const [description, setDescription] = useState("");
  const [protocol, setProtocol] = useState("tcp");
  const [externalPort, setExternalPort] = useState("");
  const [internalIp, setInternalIp] = useState("");
  const [internalPort, setInternalPort] = useState("");
  const [inboundInterface, setInboundInterface] = useState("");

  useEffect(() => {
    if (open) {
      if (existing) {
        setRule(String(existing.rule));
        setDescription(existing.description ?? "");
        setProtocol(existing.protocol ?? "tcp");
        setExternalPort(existing.external_port ?? "");
        setInternalIp(existing.internal_ip ?? "");
        setInternalPort(existing.internal_port ?? "");
        setInboundInterface(existing.inbound_interface ?? "");
      } else {
        setRule("");
        setDescription("");
        setProtocol("tcp");
        setExternalPort("");
        setInternalIp("");
        setInternalPort("");
        setInboundInterface("");
      }
    }
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!rule || !externalPort || !internalIp || !internalPort) return;
    setSaving(true);
    try {
      await onSave({
        rule: Number(rule),
        description: description || undefined,
        protocol: protocol || undefined,
        inbound_interface: inboundInterface || undefined,
        external_port: externalPort,
        internal_ip: internalIp,
        internal_port: internalPort,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {existing ? "Edit DNAT Rule" : "Add DNAT Rule"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Rule Number</Label>
              <Input
                type="number"
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                disabled={!!existing}
                placeholder="e.g. 100"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Protocol</Label>
              <Input
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="tcp, udp, tcp_udp"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Web server port forward"
              className="bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400">External Port</Label>
              <Input
                value={externalPort}
                onChange={(e) => setExternalPort(e.target.value)}
                placeholder="8080"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Internal IP</Label>
              <Input
                value={internalIp}
                onChange={(e) => setInternalIp(e.target.value)}
                placeholder="192.168.1.100"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Internal Port</Label>
              <Input
                value={internalPort}
                onChange={(e) => setInternalPort(e.target.value)}
                placeholder="80"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">Inbound Interface (optional)</Label>
            <Input
              value={inboundInterface}
              onChange={(e) => setInboundInterface(e.target.value)}
              placeholder="eth0"
              className="bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                saving || !rule || !externalPort || !internalIp || !internalPort
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {existing ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── MikroTik NAT Dialog ─────────────────────────────────────

function MikrotikNatDialog({
  open,
  onOpenChange,
  existing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: MikrotikNatRuleWithId | null;
  onSave: (data: {
    chain: string;
    action: string;
    protocol?: string;
    dst_port?: string;
    to_addresses?: string;
    to_ports?: string;
    comment?: string;
    disabled?: boolean;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [chain, setChain] = useState("dstnat");
  const [action, setAction] = useState("dst-nat");
  const [protocol, setProtocol] = useState("tcp");
  const [dstPort, setDstPort] = useState("");
  const [toAddresses, setToAddresses] = useState("");
  const [toPorts, setToPorts] = useState("");
  const [comment, setComment] = useState("");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (open) {
      if (existing) {
        setChain(existing.chain ?? "dstnat");
        setAction(existing.action ?? "dst-nat");
        setProtocol(existing.protocol ?? "");
        setDstPort(existing.dst_port ?? "");
        setToAddresses(existing.to_addresses ?? "");
        setToPorts(existing.to_ports ?? "");
        setComment(existing.comment ?? "");
        setDisabled(existing.disabled);
      } else {
        setChain("dstnat");
        setAction("dst-nat");
        setProtocol("tcp");
        setDstPort("");
        setToAddresses("");
        setToPorts("");
        setComment("");
        setDisabled(false);
      }
    }
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!chain || !action) return;
    setSaving(true);
    try {
      await onSave({
        chain,
        action,
        protocol: protocol || undefined,
        dst_port: dstPort || undefined,
        to_addresses: toAddresses || undefined,
        to_ports: toPorts || undefined,
        comment: comment || undefined,
        disabled,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {existing ? "Edit MikroTik NAT Rule" : "Add MikroTik NAT Rule"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Chain</Label>
              <Input
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                placeholder="dstnat"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Action</Label>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="dst-nat"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Protocol</Label>
              <Input
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="tcp"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Dst Port</Label>
              <Input
                value={dstPort}
                onChange={(e) => setDstPort(e.target.value)}
                placeholder="8080"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-slate-400">To Addresses</Label>
              <Input
                value={toAddresses}
                onChange={(e) => setToAddresses(e.target.value)}
                placeholder="192.168.1.100"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">To Ports</Label>
              <Input
                value={toPorts}
                onChange={(e) => setToPorts(e.target.value)}
                placeholder="80"
                className="bg-slate-800 border-slate-700 text-slate-200"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Web server"
              className="bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mt-nat-disabled"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800"
            />
            <Label htmlFor="mt-nat-disabled" className="text-slate-400">
              Disabled
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !chain || !action}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {existing ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
