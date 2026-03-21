"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Gauge,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import {
  createMikrotikSimpleQueue,
  deleteMikrotikSimpleQueue,
  fetchMikrotikQueueTree,
  fetchMikrotikSimpleQueues,
  fetchQosSummary,
  updateMikrotikSimpleQueue,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  MikrotikQueueTree,
  MikrotikSimpleQueue,
  QosSummary,
} from "@/lib/types";
import { toast } from "sonner";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function QosPage() {
  const [summary, setSummary] = useState<QosSummary | null>(null);
  const [mtQueues, setMtQueues] = useState<MikrotikSimpleQueue[] | null>(null);
  const [mtTree, setMtTree] = useState<MikrotikQueueTree[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [showAddMtQueue, setShowAddMtQueue] = useState(false);
  const [editMtQueue, setEditMtQueue] = useState<MikrotikSimpleQueue | null>(null);
  const [pendingDeleteMtQueue, setPendingDeleteMtQueue] =
    useState<MikrotikSimpleQueue | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchQosSummary();
      setSummary(s);
    } catch {
      // best-effort summary
    }
  }, []);

  const loadMtQueues = useCallback(async () => {
    try {
      const [queues, tree] = await Promise.all([
        fetchMikrotikSimpleQueues(),
        fetchMikrotikQueueTree(),
      ]);
      setMtQueues(queues);
      setMtTree(tree);
    } catch {
      setMtQueues([]);
      setMtTree([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!summary) return;
    if (summary.mikrotik_available) {
      setActiveTab("mikrotik");
    }
  }, [summary]);

  useEffect(() => {
    if (activeTab === "mikrotik") loadMtQueues();
  }, [activeTab, loadMtQueues]);

  const filteredMtQueues = useMemo(() => {
    if (!mtQueues) return null;
    if (!search.trim()) return mtQueues;
    const q = search.toLowerCase();
    return mtQueues.filter(
      (queue) =>
        queue.name.toLowerCase().includes(q) ||
        queue.target.toLowerCase().includes(q) ||
        (queue.comment ?? "").toLowerCase().includes(q),
    );
  }, [mtQueues, search]);

  const filteredMtTree = useMemo(() => {
    if (!mtTree) return null;
    if (!search.trim()) return mtTree;
    const q = search.toLowerCase();
    return mtTree.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.parent ?? "").toLowerCase().includes(q),
    );
  }, [mtTree, search]);

  async function handleDeleteMtQueue() {
    if (!pendingDeleteMtQueue || !pendingDeleteMtQueue.id) return;
    try {
      await deleteMikrotikSimpleQueue(pendingDeleteMtQueue.id);
      setMtQueues((prev) => prev?.filter((q) => q.id !== pendingDeleteMtQueue.id) ?? null);
      toast.success(`Deleted queue '${pendingDeleteMtQueue.name}'`);
      load();
    } catch {
      toast.error("Failed to delete simple queue");
    } finally {
      setPendingDeleteMtQueue(null);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-indigo-500/10 text-blue-300">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight font-display text-white">QoS / Traffic Shaping</h1>
              <p className="text-sm text-slate-400">
                Queue policies, bandwidth limits, and hierarchical shaping.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              load();
              if (activeTab === "mikrotik") loadMtQueues();
            }}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            title="MikroTik Simple Queues"
            value={summary?.mikrotik_simple_queue_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-amber-300" />}
            iconClass="border-amber-500/30 bg-amber-500/15"
          />
          <SummaryCard
            title="MikroTik Queue Tree"
            value={summary?.mikrotik_queue_tree_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-cyan-300" />}
            iconClass="border-cyan-500/30 bg-cyan-500/15"
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto rounded-xl border border-slate-800/80 bg-slate-900/70 p-1">
            <TabsTrigger
              value="overview"
              className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>

            {summary?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                MikroTik Queues
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader>
                <CardTitle className="text-base text-white">Traffic Shaping Overview</CardTitle>
                <CardDescription className="text-slate-400">
                  Simple queues apply per-target limits, while queue tree entries define
                  hierarchical policy and prioritization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.mikrotik_available ? (
                  <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Simple queues</p>
                      <p className="mt-1 text-slate-200">
                        <span className="font-semibold text-white">
                          {summary.mikrotik_simple_queue_count}
                        </span>{" "}
                        configured
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Queue tree</p>
                      <p className="mt-1 text-slate-200">
                        <span className="font-semibold text-white">
                          {summary.mikrotik_queue_tree_count}
                        </span>{" "}
                        entries
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No router is configured. Configure router credentials in Settings.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mikrotik" className="space-y-4 pt-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Filter by queue name, target, or comment..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-950/70 pl-10 text-white placeholder:text-slate-600"
                />
              </div>

              <Button
                size="sm"
                onClick={() => setShowAddMtQueue(true)}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Queue
              </Button>
            </div>

            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Simple Queues</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Per-target bandwidth limits for IPs/subnets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-slate-800/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Target</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Max Limit</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Rate</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredMtQueues === null ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i} className="border-slate-800/70">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-20 bg-slate-800" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredMtQueues.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                            {search ? "No queues match your filter." : "No simple queues configured."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMtQueues.map((queue) => (
                          <TableRow
                            key={queue.id ?? queue.name}
                            className="border-slate-800/70 hover:bg-slate-800/35"
                          >
                            <TableCell className="font-medium text-white">{queue.name}</TableCell>
                            <TableCell className="text-slate-300">{queue.target}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{queue.max_limit ?? "—"}</TableCell>
                            <TableCell className="text-slate-300">{queue.priority ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{queue.rate ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  queue.disabled
                                    ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                    : queue.dynamic
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                                )}
                              >
                                {queue.disabled ? "disabled" : queue.dynamic ? "dynamic" : "active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {!queue.dynamic && queue.id && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditMtQueue(queue)}
                                      className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setPendingDeleteMtQueue(queue)}
                                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Queue Tree</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Hierarchical queue entries (read-only view).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-slate-800/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Parent</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Packet Mark</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Max Limit</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Priority</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Rate</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredMtTree === null ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <TableRow key={i} className="border-slate-800/70">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-20 bg-slate-800" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredMtTree.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                            {search ? "No tree entries match your filter." : "No queue tree entries."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMtTree.map((entry) => (
                          <TableRow
                            key={entry.id ?? entry.name}
                            className="border-slate-800/70 hover:bg-slate-800/35"
                          >
                            <TableCell className="font-medium text-white">{entry.name}</TableCell>
                            <TableCell className="text-slate-300">{entry.parent ?? "—"}</TableCell>
                            <TableCell className="text-slate-300">{entry.packet_mark ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{entry.max_limit ?? "—"}</TableCell>
                            <TableCell className="text-slate-300">{entry.priority ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{entry.rate ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  entry.disabled
                                    ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                                )}
                              >
                                {entry.disabled ? "disabled" : "active"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <MikrotikQueueFormDialog
          open={showAddMtQueue || editMtQueue !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAddMtQueue(false);
              setEditMtQueue(null);
            }
          }}
          existing={editMtQueue}
          onSaved={() => {
            setShowAddMtQueue(false);
            setEditMtQueue(null);
            loadMtQueues();
            load();
          }}
        />

        <AlertDialog
          open={pendingDeleteMtQueue !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMtQueue(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Simple Queue</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete queue{" "}
                <span className="font-medium text-white">{pendingDeleteMtQueue?.name}</span>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMtQueue}
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
      <CardContent className="flex min-h-[96px] items-center gap-4 p-4">
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

function MikrotikQueueFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: MikrotikSimpleQueue | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [burstLimit, setBurstLimit] = useState("");
  const [burstThreshold, setBurstThreshold] = useState("");
  const [burstTime, setBurstTime] = useState("");
  const [priority, setPriority] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setTarget(existing.target);
        setMaxLimit(existing.max_limit ?? "");
        setBurstLimit(existing.burst_limit ?? "");
        setBurstThreshold(existing.burst_threshold ?? "");
        setBurstTime(existing.burst_time ?? "");
        setPriority(existing.priority ?? "");
        setComment(existing.comment ?? "");
      } else {
        setName("");
        setTarget("");
        setMaxLimit("");
        setBurstLimit("");
        setBurstThreshold("");
        setBurstTime("");
        setPriority("");
        setComment("");
      }
      setFormError(null);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!target.trim()) {
      setFormError("Target IP/subnet is required");
      return;
    }
    if (!maxLimit.trim()) {
      setFormError("Max limit is required (e.g. 10M/10M)");
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        target: target.trim(),
        max_limit: maxLimit.trim(),
        burst_limit: burstLimit.trim() || undefined,
        burst_threshold: burstThreshold.trim() || undefined,
        burst_time: burstTime.trim() || undefined,
        priority: priority.trim() || undefined,
        comment: comment.trim() || undefined,
      };

      if (isEdit && existing?.id) {
        await updateMikrotikSimpleQueue(existing.id, body);
        toast.success(`Updated queue '${name.trim()}'`);
      } else {
        await createMikrotikSimpleQueue(body);
        toast.success(`Created queue '${name.trim()}'`);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save queue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isEdit ? "Edit Simple Queue" : "Add Simple Queue"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="queue-name" className="text-xs text-slate-400">
              Name
            </Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="download-limit-pc"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-target" className="text-xs text-slate-400">
              Target (IP or subnet)
            </Label>
            <Input
              id="queue-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="192.168.1.100/32"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-max-limit" className="text-xs text-slate-400">
              Max Limit (upload/download)
            </Label>
            <Input
              id="queue-max-limit"
              value={maxLimit}
              onChange={(e) => setMaxLimit(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="10M/10M"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Burst Limit</Label>
              <Input
                value={burstLimit}
                onChange={(e) => setBurstLimit(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="15M/15M"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Burst Threshold</Label>
              <Input
                value={burstThreshold}
                onChange={(e) => setBurstThreshold(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="8M/8M"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Burst Time</Label>
              <Input
                value={burstTime}
                onChange={(e) => setBurstTime(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="10s/10s"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Priority</Label>
              <Input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="Optional comment"
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <p className="text-xs text-rose-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 text-white hover:bg-blue-500">
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
