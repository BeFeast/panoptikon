"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
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
import type { MikrotikNatRuleWithId, NatSummary } from "@/lib/types";
import { toast } from "sonner";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function NatPage() {
  const [summary, setSummary] = useState<NatSummary | null>(null);
  const [mtRules, setMtRules] = useState<MikrotikNatRuleWithId[] | null>(null);
  const [search, setSearch] = useState("");

  const [showAddMt, setShowAddMt] = useState(false);
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
    if (!search.trim()) return mtRules;
    const q = search.toLowerCase();
    return mtRules.filter(
      (r) =>
        (r.comment ?? "").toLowerCase().includes(q) ||
        (r.to_addresses ?? "").toLowerCase().includes(q) ||
        (r.dst_port ?? "").toLowerCase().includes(q) ||
        (r.action ?? "").toLowerCase().includes(q) ||
        (r.src_address ?? "").toLowerCase().includes(q) ||
        (r.dst_address ?? "").toLowerCase().includes(q),
    );
  }, [mtRules, search]);

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

  return (
    <PageTransition>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-blue-500/10 text-violet-300">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white">NAT / Port Forwarding</h1>
                <HelpTooltip text="Manage MikroTik NAT and port-forwarding rules from the same command-center style UI." />
              </div>
              <p className="text-sm text-slate-400">
                Inspect rule chains, targets, and translation endpoints.
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
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        <section className="grid gap-5 sm:grid-cols-1 lg:max-w-md">
          <SummaryCard
            title="MikroTik NAT Rules"
            value={summary?.mikrotik_rule_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-amber-300" />}
            iconClass="border-amber-500/30 bg-amber-500/15"
          />
        </section>

        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Filter by comment, action, destination port..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-800 bg-slate-950/70 pl-10 text-white placeholder:text-slate-600"
            />
          </div>

          <Button
            size="sm"
            onClick={() => setShowAddMt(true)}
            className="bg-blue-600 text-white hover:bg-blue-500"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Rule
          </Button>
        </section>

        <Card className={surfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">MikroTik NAT Rules</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Firewall NAT rules synchronized from the router.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-slate-800/70">
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
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Chain</TableHead>
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
                        className="border-slate-800/70 hover:bg-slate-800/35"
                      >
                        <TableCell className="text-slate-200">{rule.chain ?? "-"}</TableCell>

                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md border text-[11px] uppercase",
                              rule.action === "dst-nat"
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
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
                        <TableCell className="max-w-[220px] truncate text-slate-400" title={rule.comment ?? undefined}>
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
              toast.error(err instanceof Error ? err.message : "Failed to create rule");
            }
          }}
        />

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

        <AlertDialog
          open={!!pendingDeleteMt}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMt(null);
          }}
        >
          <AlertDialogContent className="bg-slate-900 border-slate-800">
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
    src_address?: string;
    dst_address?: string;
    dst_port?: string;
    to_addresses?: string;
    to_ports?: string;
    out_interface?: string;
    comment?: string;
    disabled?: boolean;
  }) => Promise<void>;
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
        setOutInterface(existing.out_interface ?? "");
        setComment(existing.comment ?? "");
        setDisabled(existing.disabled);
      } else {
        setChain("dstnat");
        setAction("dst-nat");
        setProtocol("tcp");
        setSrcAddress("");
        setDstAddress("");
        setDstPort("");
        setToAddresses("");
        setToPorts("");
        setOutInterface("");
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
        src_address: srcAddress || undefined,
        dst_address: dstAddress || undefined,
        dst_port: dstPort || undefined,
        to_addresses: toAddresses || undefined,
        to_ports: toPorts || undefined,
        out_interface: outInterface || undefined,
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
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Chain</Label>
              <Input
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                placeholder="dstnat"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Action</Label>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="dst-nat"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Protocol</Label>
              <Input
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="tcp"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Dst Port</Label>
              <Input
                value={dstPort}
                onChange={(e) => setDstPort(e.target.value)}
                placeholder="8080"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">Src Address</Label>
              <Input
                value={srcAddress}
                onChange={(e) => setSrcAddress(e.target.value)}
                placeholder="0.0.0.0/0"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">Dst Address</Label>
              <Input
                value={dstAddress}
                onChange={(e) => setDstAddress(e.target.value)}
                placeholder="203.0.113.1"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label className="text-slate-400">To Addresses</Label>
              <Input
                value={toAddresses}
                onChange={(e) => setToAddresses(e.target.value)}
                placeholder="192.168.1.100"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">To Ports</Label>
              <Input
                value={toPorts}
                onChange={(e) => setToPorts(e.target.value)}
                placeholder="80"
                className="bg-slate-950 border-slate-800 text-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-400">Out Interface</Label>
            <Input
              value={outInterface}
              onChange={(e) => setOutInterface(e.target.value)}
              placeholder="ether1"
              className="bg-slate-950 border-slate-800 text-slate-200"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-400">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Web server"
              className="bg-slate-950 border-slate-800 text-slate-200"
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
