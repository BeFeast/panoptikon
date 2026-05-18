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
    if (isOneToOne(rule)) return "border-[#a78bfa]/30 bg-[#a78bfa]/10 text-[#a78bfa]";
    if (rule.chain === "srcnat") return "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]";
    if (rule.chain === "dstnat") return "border-mesh-primary/30 bg-mesh-primary/10 text-mesh-primary";
    return "border-mesh-border bg-mesh-surface-1 text-mesh-text-dim";
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Page header — Card with eyebrow + display title */}
        <Card className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div
              className="flex h-12 w-12 items-center justify-center"
              style={{
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(96,144,212,0.20)",
                background: "var(--surface-2)",
                color: "#a78bfa",
              }}
            >
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <div className="t-micro">Network operations</div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                <h1 className="t-display" style={{ margin: 0 }}>
                  NAT / Port Forwarding
                </h1>
                <HelpTooltip text="Manage MikroTik NAT rules — port forwarding (DNAT), outbound NAT (SNAT), 1:1 NAT, and NAT reflection." />
              </div>
              <p className="t-small" style={{ marginTop: 4 }}>
                Port forwarding, outbound NAT, 1:1 NAT, and hairpin rules.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => {
              load();
              loadMt();
            }}
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </button>
        </Card>

        {/* Summary cards */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-2xl">
          <SummaryCard
            title="Total NAT Rules"
            value={summary?.mikrotik_rule_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-mesh-accent" />}
            iconBg="#0e2148"
            iconBorder="rgba(96,144,212,0.40)"
          />
          <SummaryCard
            title="DNAT (Inbound)"
            value={summary?.dnat_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<ArrowDownToLine className="h-4 w-4 text-mesh-primary" />}
            iconBg="#0e2148"
            iconBorder="rgba(37,99,235,0.40)"
          />
          <SummaryCard
            title="SNAT (Outbound)"
            value={summary?.snat_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<ArrowUpFromLine className="h-4 w-4" style={{ color: "#fbbf24" }} />}
            iconBg="#0e2148"
            iconBorder="rgba(251,191,36,0.40)"
          />
        </section>

        {/* Filter tabs + search + add buttons */}
        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NatTab)}>
              <TabsList className="h-auto mesh-card p-1">
                <TabsTrigger
                  value="all"
                  className="rounded-lg px-4 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-mesh-text"
                >
                  All Rules
                </TabsTrigger>
                <TabsTrigger
                  value="dnat"
                  className="rounded-lg px-4 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-mesh-text"
                >
                  DNAT
                </TabsTrigger>
                <TabsTrigger
                  value="snat"
                  className="rounded-lg px-4 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-mesh-text"
                >
                  SNAT
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
                <Input
                  placeholder="Filter rules..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
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
                <SelectTrigger
                  className="w-auto gap-1.5"
                  style={{
                    background: "#2563eb",
                    borderColor: "#2563eb",
                    color: "var(--primary-fg, #ffffff)",
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <SelectValue placeholder="Add Rule" />
                </SelectTrigger>
                <SelectContent className="border-mesh-border bg-mesh-surface-1 text-mesh-text">
                  <SelectItem value="dnat">Port Forward (DNAT)</SelectItem>
                  <SelectItem value="snat">Outbound NAT (SNAT)</SelectItem>
                  <SelectItem value="onetoone">1:1 NAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Rules table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="t-h3">MikroTik NAT Rules</CardTitle>
            <CardDescription className="t-small">
              Firewall NAT rules synchronized from the router.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div
              className="overflow-x-auto"
              style={{ borderTop: "1px solid rgba(96,144,212,0.20)" }}
            >
              {filteredMt === null ? (
                <div className="space-y-2 p-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-10 bg-mesh-surface-1" />
                  ))}
                </div>
              ) : filteredMt.length === 0 ? (
                <div className="py-12 text-center t-small">
                  {search ? "No matching rules." : "No NAT rules configured."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-mesh-border-strong hover:bg-transparent">
                      <TableHead className="t-micro">Type</TableHead>
                      <TableHead className="t-micro">Action</TableHead>
                      <TableHead className="t-micro">Protocol</TableHead>
                      <TableHead className="t-micro">Src Address</TableHead>
                      <TableHead className="t-micro">Dst Address</TableHead>
                      <TableHead className="t-micro">Dst Port</TableHead>
                      <TableHead className="t-micro">To Address</TableHead>
                      <TableHead className="t-micro">To Port</TableHead>
                      <TableHead className="t-micro">Comment</TableHead>
                      <TableHead className="t-micro">Status</TableHead>
                      <TableHead className="text-right t-micro">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredMt.map((rule, idx) => (
                      <TableRow
                        key={rule.id ?? idx}
                        className="border-mesh-border hover:bg-mesh-surface-2/55"
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
                                ? "border-mesh-primary/30 bg-mesh-primary/10 text-mesh-primary"
                                : rule.action === "src-nat"
                                  ? "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]"
                                  : rule.action === "masquerade"
                                    ? "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
                                    : "border-mesh-border bg-mesh-surface-1 text-mesh-text-dim",
                            )}
                          >
                            {rule.action ?? "-"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-mesh-text">{rule.protocol ?? "any"}</TableCell>
                        <TableCell className="mono tabular text-xs text-mesh-text">{rule.src_address ?? "-"}</TableCell>
                        <TableCell className="mono tabular text-xs text-mesh-text">{rule.dst_address ?? "-"}</TableCell>
                        <TableCell className="mono tabular text-xs text-mesh-text">{rule.dst_port ?? "-"}</TableCell>
                        <TableCell className="mono tabular text-xs text-mesh-text">{rule.to_addresses ?? "-"}</TableCell>
                        <TableCell className="mono tabular text-xs text-mesh-text">{rule.to_ports ?? "-"}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-mesh-text-dim" title={rule.comment ?? undefined}>
                          {rule.comment ?? "-"}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md border text-[11px] uppercase",
                              rule.disabled
                                ? "border-mesh-border bg-mesh-surface-1 text-mesh-text-mute"
                                : "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]",
                            )}
                          >
                            {rule.disabled ? "disabled" : "active"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {rule.id && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setEditMtRule(rule)}
                                  aria-label="Edit rule"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setPendingDeleteMt(rule)}
                                  aria-label="Delete rule"
                                  style={{ color: "#fb7185" }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
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
          <AlertDialogContent className="bg-mesh-surface-1/95 border-mesh-border-strong">
            <AlertDialogHeader>
              <AlertDialogTitle className="t-h2">Delete MikroTik NAT Rule</AlertDialogTitle>
              <AlertDialogDescription className="t-small">
                Are you sure you want to delete this NAT rule
                {pendingDeleteMt?.comment ? ` (${pendingDeleteMt.comment})` : ""}?
                This will remove it from the MikroTik router.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="btn">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMt}
                style={{ background: "#fb7185", borderColor: "#fb7185", color: "#ffffff" }}
                className="btn"
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
  iconBg,
  iconBorder,
}: {
  title: string;
  value: number | null;
  available: boolean | null;
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          style={{
            borderRadius: "var(--radius-md)",
            border: `1px solid ${iconBorder}`,
            background: iconBg,
          }}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="t-micro">{title}</p>
          {available === null ? (
            <Skeleton className="mt-2 h-6 w-14 bg-mesh-surface-1" />
          ) : available ? (
            <p className="t-h1" style={{ marginTop: 4 }}>
              {value ?? 0}
            </p>
          ) : (
            <p className="t-small" style={{ marginTop: 4 }}>
              Not configured
            </p>
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
      <DialogContent className="bg-mesh-surface-1/95 border-mesh-border-strong sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="t-h2">{dialogTitle}</DialogTitle>
          <DialogDescription className="t-small">{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Chain + Action */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="t-micro">Chain</Label>
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-mesh-border bg-mesh-surface-1 text-mesh-text">
                  <SelectItem value="dstnat">dstnat</SelectItem>
                  <SelectItem value="srcnat">srcnat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="t-micro">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-mesh-border bg-mesh-surface-1 text-mesh-text">
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
            <Label className="t-micro">Protocol</Label>
            <Select value={protocol || "__none__"} onValueChange={(v) => setProtocol(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent className="border-mesh-border bg-mesh-surface-1 text-mesh-text">
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
              <Label className="t-micro">
                Src Address
                <HelpTooltip text="Source IP or CIDR to match. Leave empty for any." />
              </Label>
              <Input
                value={srcAddress}
                onChange={(e) => setSrcAddress(e.target.value)}
                placeholder="e.g. 192.168.1.0/24"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="t-micro">
                Dst Address
                <HelpTooltip text="Destination IP to match. For 1:1 NAT, this is the external IP." />
              </Label>
              <Input
                value={dstAddress}
                onChange={(e) => setDstAddress(e.target.value)}
                placeholder="e.g. 203.0.113.10"
              />
            </div>
          </div>

          {/* Dst Port */}
          <div className="space-y-1.5">
            <Label className="t-micro">
              Dst Port
              <HelpTooltip text="Destination port to match. Leave empty for 1:1 NAT (all ports)." />
            </Label>
            <Input
              value={dstPort}
              onChange={(e) => setDstPort(e.target.value)}
              placeholder="e.g. 8080 or 80-443"
            />
          </div>

          {/* To Addresses / To Ports */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="t-micro">
                To Addresses
                <HelpTooltip text="Translate to this IP. For DNAT/1:1: internal host. For SNAT: outbound IP." />
              </Label>
              <Input
                value={toAddresses}
                onChange={(e) => setToAddresses(e.target.value)}
                placeholder="e.g. 192.168.1.100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="t-micro">
                To Ports
                <HelpTooltip text="Translate to this port. Leave empty for 1:1 NAT." />
              </Label>
              <Input
                value={toPorts}
                onChange={(e) => setToPorts(e.target.value)}
                placeholder="e.g. 80"
              />
            </div>
          </div>

          {/* Interfaces */}
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="t-micro">
                In Interface
                <HelpTooltip text="Match traffic arriving on this interface (e.g. ether1-wan)." />
              </Label>
              <Input
                value={inInterface}
                onChange={(e) => setInInterface(e.target.value)}
                placeholder="e.g. ether1"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="t-micro">
                Out Interface
                <HelpTooltip text="Match traffic leaving via this interface." />
              </Label>
              <Input
                value={outInterface}
                onChange={(e) => setOutInterface(e.target.value)}
                placeholder="e.g. bridge1"
              />
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <Label className="t-micro">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Web server port forward"
            />
          </div>

          {/* Disabled toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mt-nat-disabled"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
              className="rounded border-mesh-border bg-mesh-surface-1"
            />
            <Label htmlFor="mt-nat-disabled" className="t-small">
              Disabled
            </Label>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={saving || !chain || !action}
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {existing ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
