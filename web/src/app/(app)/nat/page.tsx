"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
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
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  createMikrotikNatRule,
  deleteMikrotikNatRule,
  fetchMikrotikNatRules,
  fetchNatSummary,
  updateMikrotikNatRule,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CreateMikrotikNatRuleRequest,
  MikrotikNatRuleWithId,
  NatSummary,
} from "@/lib/types";
import { toast } from "sonner";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

type NatTab = "all" | "dnat" | "snat";

export default function NatPage() {
  const [summary, setSummary] = useState<NatSummary | null>(null);
  const [mtRules, setMtRules] = useState<MikrotikNatRuleWithId[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useHashTab<NatTab>("all", ["all", "dnat", "snat"]);

  const [showAddMt, setShowAddMt] = useState(false);
  const [addPreset, setAddPreset] = useState<"dnat" | "snat" | "onetoone" | undefined>();
  const [editMtRule, setEditMtRule] = useState<MikrotikNatRuleWithId | null>(null);
  const [pendingDeleteMt, setPendingDeleteMt] = useState<MikrotikNatRuleWithId | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchNatSummary();
      setSummary(s);
    } catch {
      // best-effort summary
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
    loadMt();
  }, [load, loadMt]);

  const filteredMt = useMemo(() => {
    if (!mtRules) return null;
    let result = mtRules;

    // Filter by tab
    if (activeTab === "dnat") {
      result = result.filter((r) => r.chain === "dstnat");
    } else if (activeTab === "snat") {
      result = result.filter((r) => r.chain === "srcnat");
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.comment ?? "").toLowerCase().includes(q) ||
          (r.to_addresses ?? "").toLowerCase().includes(q) ||
          (r.src_address ?? "").toLowerCase().includes(q) ||
          (r.dst_address ?? "").toLowerCase().includes(q) ||
          (r.dst_port ?? "").toLowerCase().includes(q) ||
          (r.action ?? "").toLowerCase().includes(q),
      );
    }

    return result;
  }, [mtRules, search, activeTab]);

  async function handleDeleteMt() {
    if (!pendingDeleteMt || !pendingDeleteMt.id) return;
    try {
      await deleteMikrotikNatRule(pendingDeleteMt.id);
      setMtRules((prev) => prev?.filter((r) => r.id !== pendingDeleteMt.id) ?? null);
      toast.success("Deleted MikroTik NAT rule");
      load();
    } catch {
      toast.error("Failed to delete MikroTik NAT rule");
    } finally {
      setPendingDeleteMt(null);
    }
  }

  /** Detect 1:1 NAT: dst-nat with dst_address → to_addresses, no port mapping */
  function isOneToOne(rule: MikrotikNatRuleWithId) {
    return (
      rule.chain === "dstnat" &&
      rule.action === "dst-nat" &&
      rule.dst_address &&
      rule.to_addresses &&
      !rule.dst_port &&
      !rule.to_ports
    );
  }

  function ruleTypeLabel(rule: MikrotikNatRuleWithId) {
    if (isOneToOne(rule)) return "1:1 NAT";
    if (rule.chain === "srcnat") return "SNAT";
    if (rule.chain === "dstnat") return "DNAT";
    return rule.chain ?? "other";
  }

  function ruleTypeBadgeClass(rule: MikrotikNatRuleWithId) {
    if (isOneToOne(rule)) return "border-violet-500/30 bg-violet-500/10 text-violet-300";
    if (rule.chain === "srcnat") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    if (rule.chain === "dstnat") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    return "border-slate-700 bg-slate-900/70 text-slate-400";
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-2xl border border-cyan-900/45 bg-[#0b1220]/72 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-blue-500/10 text-violet-300">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white">NAT / Port Forwarding</h1>
                <HelpTooltip text="Manage MikroTik NAT rules — port forwarding (DNAT), outbound NAT (SNAT), 1:1 NAT, and NAT reflection." />
              </div>
              <p className="text-sm text-slate-400">
                Port forwarding, outbound NAT, 1:1 NAT, and hairpin rules.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              load();
              loadMt();
            }}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-cyan-950/35"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        {/* Summary cards */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-2xl">
          <SummaryCard
            title="Total NAT Rules"
            value={summary?.mikrotik_rule_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-cyan-300" />}
            iconClass="border-cyan-500/30 bg-cyan-500/15"
          />
          <SummaryCard
            title="DNAT (Inbound)"
            value={summary?.dnat_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<ArrowDownToLine className="h-4 w-4 text-blue-300" />}
            iconClass="border-blue-500/30 bg-blue-500/15"
          />
          <SummaryCard
            title="SNAT (Outbound)"
            value={summary?.snat_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<ArrowUpFromLine className="h-4 w-4 text-amber-300" />}
            iconClass="border-amber-500/30 bg-amber-500/15"
          />
        </section>

        {/* Filter tabs + search + add buttons */}
        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NatTab)}>
              <TabsList className="h-auto rounded-xl border border-cyan-900/45 bg-[#0b1220]/72 p-1">
                <TabsTrigger
                  value="all"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  All Rules
                </TabsTrigger>
                <TabsTrigger
                  value="dnat"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  DNAT
                </TabsTrigger>
                <TabsTrigger
                  value="snat"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  SNAT
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Filter rules..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-cyan-900/45 bg-[#0b1220]/72 pl-10 text-white placeholder:text-slate-600"
                />
              </div>

              <Select
                onValueChange={(v) => {
                  if (v === "dnat") {
                    setAddPreset("dnat");
                  } else if (v === "snat") {
                    setAddPreset("snat");
                  } else if (v === "onetoone") {
                    setAddPreset("onetoone");
                  }
                  setShowAddMt(true);
                }}
              >
                <SelectTrigger className="w-auto gap-1.5 border-slate-700 bg-blue-600 text-white hover:bg-blue-500 [&>svg]:text-white">
                  <Plus className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Add Rule" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-slate-200">
                  <SelectItem value="dnat">Port Forward (DNAT)</SelectItem>
                  <SelectItem value="snat">Outbound NAT (SNAT)</SelectItem>
                  <SelectItem value="onetoone">1:1 NAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Rules table */}
        <Card className={surfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">MikroTik NAT Rules</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Firewall NAT rules synchronized from the router.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-cyan-900/35">
              {filteredMt === null ? (
                <div className="space-y-2 p-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-slate-800" />
                  ))}
                </div>
              ) : filteredMt.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  {search ? "No matching rules." : "No NAT rules configured."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/70 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Type</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Action</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Protocol</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Src Address</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Dst Address</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Dst Port</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">To Address</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">To Port</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Comment</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredMt.map((rule, idx) => (
                      <TableRow
                        key={rule.id ?? idx}
                        className="border-slate-800/70 hover:bg-cyan-950/35"
                      >
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md border text-[11px] uppercase",
                              ruleTypeBadgeClass(rule),
                            )}
                          >
                            {ruleTypeLabel(rule)}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md border text-[11px] uppercase",
                              rule.action === "dst-nat"
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                                : rule.action === "src-nat"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                  : rule.action === "masquerade"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-slate-700 bg-slate-900/70 text-slate-400",
                            )}
                          >
                            {rule.action ?? "-"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-slate-300">{rule.protocol ?? "any"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{rule.src_address ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{rule.dst_address ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{rule.dst_port ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{rule.to_addresses ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{rule.to_ports ?? "-"}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-slate-400" title={rule.comment ?? undefined}>
                          {rule.comment ?? "-"}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md border text-[11px] uppercase",
                              rule.disabled
                                ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                            )}
                          >
                            {rule.disabled ? "disabled" : "active"}
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
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
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
            </div>
          </CardContent>
        </Card>

        {/* Add dialog */}
        <MikrotikNatDialog
          open={showAddMt}
          onOpenChange={(open) => {
            setShowAddMt(open);
            if (!open) setAddPreset(undefined);
          }}
          preset={addPreset}
          onSave={async (data) => {
            try {
              await createMikrotikNatRule(data);
              toast.success("MikroTik NAT rule created");
              loadMt();
              load();
              setShowAddMt(false);
              setAddPreset(undefined);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to create rule");
            }
          }}
        />

        {/* Edit dialog */}
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
              toast.error(err instanceof Error ? err.message : "Failed to update rule");
            }
          }}
        />

        {/* Delete confirmation */}
        <AlertDialog
          open={!!pendingDeleteMt}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMt(null);
          }}
        >
          <AlertDialogContent className="bg-[#0b1220]/72 border-cyan-900/45">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete MikroTik NAT Rule</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete this NAT rule
                {pendingDeleteMt?.comment ? ` (${pendingDeleteMt.comment})` : ""}?
                This will remove it from the MikroTik router.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMt}
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

/* ── Summary Card ───────────────────────────────────────── */

function SummaryCard({
  title,
  value,
  available,
  icon,
  iconClass,
}: {
  title: string;
  value: number | null;
  available: boolean | null;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <Card className={surfaceClass}>
      <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", iconClass)}>
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
          {available === null ? (
            <Skeleton className="mt-2 h-6 w-14 bg-slate-800" />
          ) : available ? (
            <p className="mt-1 text-2xl font-semibold text-white">{value ?? 0}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Not configured</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── NAT Rule Create/Edit Dialog ────────────────────────── */

function MikrotikNatDialog({
  open,
  onOpenChange,
  existing,
  preset,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: MikrotikNatRuleWithId | null;
  preset?: "dnat" | "snat" | "onetoone";
  onSave: (data: CreateMikrotikNatRuleRequest) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [chain, setChain] = useState("dstnat");
  const [action, setAction] = useState("dst-nat");
  const [protocol, setProtocol] = useState("tcp");
  const [srcAddress, setSrcAddress] = useState("");
  const [dstAddress, setDstAddress] = useState("");
  const [dstPort, setDstPort] = useState("");
  const [toAddresses, setToAddresses] = useState("");
  const [toPorts, setToPorts] = useState("");
  const [inInterface, setInInterface] = useState("");
  const [outInterface, setOutInterface] = useState("");
  const [comment, setComment] = useState("");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (open) {
      if (existing) {
        setChain(existing.chain ?? "dstnat");
        setAction(existing.action ?? "dst-nat");
        setProtocol(existing.protocol ?? "");
        setSrcAddress(existing.src_address ?? "");
        setDstAddress(existing.dst_address ?? "");
        setDstPort(existing.dst_port ?? "");
        setToAddresses(existing.to_addresses ?? "");
        setToPorts(existing.to_ports ?? "");
        setInInterface("");
        setOutInterface(existing.out_interface ?? "");
        setComment(existing.comment ?? "");
        setDisabled(existing.disabled);
      } else if (preset === "snat") {
        setChain("srcnat");
        setAction("src-nat");
        setProtocol("");
        setSrcAddress("");
        setDstAddress("");
        setDstPort("");
        setToAddresses("");
        setToPorts("");
        setInInterface("");
        setOutInterface("");
        setComment("");
        setDisabled(false);
      } else if (preset === "onetoone") {
        setChain("dstnat");
        setAction("dst-nat");
        setProtocol("");
        setSrcAddress("");
        setDstAddress("");
        setDstPort("");
        setToAddresses("");
        setToPorts("");
        setInInterface("");
        setOutInterface("");
        setComment("1:1 NAT");
        setDisabled(false);
      } else {
        setChain("dstnat");
        setAction("dst-nat");
        setProtocol("tcp");
        setSrcAddress("");
        setDstAddress("");
        setDstPort("");
        setToAddresses("");
        setToPorts("");
        setInInterface("");
        setOutInterface("");
        setComment("");
        setDisabled(false);
      }
    }
  }, [open, existing, preset]);

  const handleSubmit = async () => {
    if (!chain || !action) return;
    setSaving(true);
    try {
      await onSave({
        chain,
        action,
        protocol: protocol || undefined,
        src_address: srcAddress || undefined,
        dst_address: dstAddress || undefined,
        dst_port: dstPort || undefined,
        to_addresses: toAddresses || undefined,
        to_ports: toPorts || undefined,
        in_interface: inInterface || undefined,
        out_interface: outInterface || undefined,
        comment: comment || undefined,
        disabled,
      });
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = existing
    ? "Edit NAT Rule"
    : preset === "snat"
      ? "Add Outbound NAT Rule (SNAT)"
      : preset === "onetoone"
        ? "Add 1:1 NAT Rule"
        : "Add Port Forward Rule (DNAT)";

  const dialogDescription = existing
    ? "Modify the NAT rule configuration on the MikroTik router."
    : preset === "snat"
      ? "Create an outbound NAT (source NAT) rule to translate internal source addresses."
      : preset === "onetoone"
        ? "Map an entire external IP address to an internal host (no port translation)."
        : "Forward incoming traffic on a specific port to an internal host.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b1220]/72 border-cyan-900/45 sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{dialogTitle}</DialogTitle>
          <DialogDescription className="text-slate-400">{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Chain + Action */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Chain</Label>
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-slate-200">
                  <SelectItem value="dstnat">dstnat</SelectItem>
                  <SelectItem value="srcnat">srcnat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-slate-200">
                  <SelectItem value="dst-nat">dst-nat</SelectItem>
                  <SelectItem value="src-nat">src-nat</SelectItem>
                  <SelectItem value="masquerade">masquerade</SelectItem>
                  <SelectItem value="netmap">netmap</SelectItem>
                  <SelectItem value="redirect">redirect</SelectItem>
                  <SelectItem value="accept">accept</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Protocol */}
          <div className="space-y-1.5">
            <Label className="text-slate-400">Protocol</Label>
            <Select value={protocol || "__none__"} onValueChange={(v) => setProtocol(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900 text-slate-200">
                <SelectItem value="__none__">Any</SelectItem>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="udp">UDP</SelectItem>
                <SelectItem value="icmp">ICMP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source / Destination Addresses */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                Src Address
                <HelpTooltip text="Source IP or CIDR to match. Leave empty for any." />
              </Label>
              <Input
                value={srcAddress}
                onChange={(e) => setSrcAddress(e.target.value)}
                placeholder="e.g. 192.168.1.0/24"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                Dst Address
                <HelpTooltip text="Destination IP to match. For 1:1 NAT, this is the external IP." />
              </Label>
              <Input
                value={dstAddress}
                onChange={(e) => setDstAddress(e.target.value)}
                placeholder="e.g. 203.0.113.10"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
          </div>

          {/* Dst Port */}
          <div className="space-y-1.5">
            <Label className="text-slate-400">
              Dst Port
              <HelpTooltip text="Destination port to match. Leave empty for 1:1 NAT (all ports)." />
            </Label>
            <Input
              value={dstPort}
              onChange={(e) => setDstPort(e.target.value)}
              placeholder="e.g. 8080 or 80-443"
              className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
            />
          </div>

          {/* To Addresses / To Ports */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                To Addresses
                <HelpTooltip text="Translate to this IP. For DNAT/1:1: internal host. For SNAT: outbound IP." />
              </Label>
              <Input
                value={toAddresses}
                onChange={(e) => setToAddresses(e.target.value)}
                placeholder="e.g. 192.168.1.100"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                To Ports
                <HelpTooltip text="Translate to this port. Leave empty for 1:1 NAT." />
              </Label>
              <Input
                value={toPorts}
                onChange={(e) => setToPorts(e.target.value)}
                placeholder="e.g. 80"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
          </div>

          {/* Interfaces */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                In Interface
                <HelpTooltip text="Match traffic arriving on this interface (e.g. ether1-wan)." />
              </Label>
              <Input
                value={inInterface}
                onChange={(e) => setInInterface(e.target.value)}
                placeholder="e.g. ether1"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">
                Out Interface
                <HelpTooltip text="Match traffic leaving via this interface." />
              </Label>
              <Input
                value={outInterface}
                onChange={(e) => setOutInterface(e.target.value)}
                placeholder="e.g. bridge1"
                className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
              />
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <Label className="text-slate-400">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Web server port forward"
              className="bg-[#0b1220]/72 border-cyan-900/45 text-slate-200"
            />
          </div>

          {/* Disabled toggle */}
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

          {/* Action buttons */}
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
              className="bg-blue-600 hover:bg-blue-500 text-white"
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
