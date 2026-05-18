"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
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
  TreePine,
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
  createMikrotikQueueTree,
  createMikrotikSimpleQueue,
  deleteMikrotikQueueTree,
  deleteMikrotikSimpleQueue,
  fetchMikrotikQueueTree,
  fetchMikrotikSimpleQueues,
  fetchQosSummary,
  updateMikrotikQueueTree,
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
  "border-mesh-border-strong bg-gradient-to-b from-mesh-surface-1/80 to-mesh-surface-1/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

const LIVE_POLL_INTERVAL = 5000;

export default function QosPage() {
  const [summary, setSummary] = useState<QosSummary | null>(null);
  const [mtQueues, setMtQueues] = useState<MikrotikSimpleQueue[] | null>(null);
  const [mtTree, setMtTree] = useState<MikrotikQueueTree[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useHashTab("overview", ["overview", "mikrotik"]);
  const [liveRefresh, setLiveRefresh] = useState(false);
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showAddMtQueue, setShowAddMtQueue] = useState(false);
  const [editMtQueue, setEditMtQueue] = useState<MikrotikSimpleQueue | null>(null);
  const [pendingDeleteMtQueue, setPendingDeleteMtQueue] =
    useState<MikrotikSimpleQueue | null>(null);

  const [showAddMtTree, setShowAddMtTree] = useState(false);
  const [editMtTree, setEditMtTree] = useState<MikrotikQueueTree | null>(null);
  const [pendingDeleteMtTree, setPendingDeleteMtTree] =
    useState<MikrotikQueueTree | null>(null);

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

  // Live polling for real-time rate updates
  useEffect(() => {
    if (liveRefresh && activeTab === "mikrotik") {
      liveRef.current = setInterval(() => {
        loadMtQueues();
      }, LIVE_POLL_INTERVAL);
    }
    return () => {
      if (liveRef.current) {
        clearInterval(liveRef.current);
        liveRef.current = null;
      }
    };
  }, [liveRefresh, activeTab, loadMtQueues]);

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
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.parent ?? "").toLowerCase().includes(q) ||
        (t.packet_mark ?? "").toLowerCase().includes(q),
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

  async function handleDeleteMtTree() {
    if (!pendingDeleteMtTree || !pendingDeleteMtTree.id) return;
    try {
      await deleteMikrotikQueueTree(pendingDeleteMtTree.id);
      setMtTree((prev) => prev?.filter((t) => t.id !== pendingDeleteMtTree.id) ?? null);
      toast.success(`Deleted queue tree entry '${pendingDeleteMtTree.name}'`);
      load();
    } catch {
      toast.error("Failed to delete queue tree entry");
    } finally {
      setPendingDeleteMtTree(null);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 mesh-card p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-mesh-primary/30 bg-gradient-to-br from-mesh-primary/20 via-mesh-accent/10 to-[#818cf8]/10 text-mesh-primary">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">QoS / Traffic Shaping</h1>
              <p className="text-sm text-mesh-text-dim">
                Queue policies, bandwidth limits, and hierarchical shaping.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "mikrotik" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLiveRefresh((v) => !v)}
                className={cn(
                  "border-mesh-border bg-mesh-surface-1 text-mesh-text hover:bg-mesh-surface-2/55",
                  liveRefresh && "border-[#4ade80]/50 text-[#4ade80]",
                )}
              >
                <RefreshCw
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    liveRefresh && "animate-spin",
                  )}
                />
                {liveRefresh ? "Live" : "Auto-refresh"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                load();
                if (activeTab === "mikrotik") loadMtQueues();
              }}
              className="border-mesh-border bg-mesh-surface-1 text-mesh-text hover:bg-mesh-surface-2/55"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <SummaryCard
            title="MikroTik Simple Queues"
            value={summary?.mikrotik_simple_queue_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-[#fbbf24]" />}
            iconClass="border-[#fbbf24]/30 bg-[#fbbf24]/15"
          />
          <SummaryCard
            title="MikroTik Queue Tree"
            value={summary?.mikrotik_queue_tree_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<TreePine className="h-4 w-4 text-[#67e8f9]" />}
            iconClass="border-mesh-accent/30 bg-mesh-accent/15"
          />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto mesh-card p-1">
            <TabsTrigger
              value="overview"
              className="rounded-lg px-4 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>

            {summary?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="rounded-lg px-4 data-[state=active]:bg-mesh-surface-1 data-[state=active]:text-white"
              >
                MikroTik Queues
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader>
                <CardTitle className="text-base text-white">Traffic Shaping Overview</CardTitle>
                <CardDescription className="text-mesh-text-dim">
                  Simple queues apply per-target limits, while queue tree entries define
                  hierarchical policy and prioritization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary?.mikrotik_available ? (
                  <div className="grid gap-3 text-sm text-mesh-text md:grid-cols-2">
                    <div className="mesh-card-2 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-mesh-text-mute">Simple queues</p>
                      <p className="mt-1 text-mesh-text">
                        <span className="font-semibold text-white">
                          {summary.mikrotik_simple_queue_count}
                        </span>{" "}
                        configured
                      </p>
                    </div>
                    <div className="mesh-card-2 p-3">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-mesh-text-mute">Queue tree</p>
                      <p className="mt-1 text-mesh-text">
                        <span className="font-semibold text-white">
                          {summary.mikrotik_queue_tree_count}
                        </span>{" "}
                        entries
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-mesh-text-dim">
                    No router is configured. Configure router credentials in Settings.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mikrotik" className="space-y-4 pt-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
                <Input
                  placeholder="Filter by queue name, target, or comment..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1/95 pl-10 text-white placeholder:text-mesh-text-mute"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setShowAddMtQueue(true)}
                  className="bg-mesh-primary text-white hover:bg-mesh-primary"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Queue
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddMtTree(true)}
                  className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Tree Entry
                </Button>
              </div>
            </div>

            {/* Simple Queues Table */}
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Simple Queues</CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Per-target bandwidth limits for IPs/subnets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-mesh-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-mesh-border-strong hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Target</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Max Limit</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Priority</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Rate</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Status</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-mesh-text-mute">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredMtQueues === null ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i} className="border-mesh-border-strong">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-20 bg-mesh-surface-1" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredMtQueues.length === 0 ? (
                        <TableRow className="border-mesh-border-strong hover:bg-transparent">
                          <TableCell colSpan={7} className="py-12 text-center text-mesh-text-mute">
                            {search ? "No queues match your filter." : "No simple queues configured."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMtQueues.map((queue) => (
                          <TableRow
                            key={queue.id ?? queue.name}
                            className="border-mesh-border hover:bg-mesh-surface-2/55"
                          >
                            <TableCell className="font-medium text-white">{queue.name}</TableCell>
                            <TableCell className="text-mesh-text">{queue.target}</TableCell>
                            <TableCell className="font-mono text-xs text-mesh-text-dim">{queue.max_limit ?? "—"}</TableCell>
                            <TableCell className="text-mesh-text">{queue.priority ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-mesh-text-dim">
                              <RateDisplay rate={queue.rate} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  queue.disabled
                                    ? "border-mesh-border bg-mesh-surface-1 text-mesh-text-mute"
                                    : queue.dynamic
                                      ? "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]"
                                      : "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]",
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
                                      className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setPendingDeleteMtQueue(queue)}
                                      className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
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

            {/* Queue Tree Table */}
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Queue Tree</CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Hierarchical queue entries for packet-mark based shaping.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-mesh-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-mesh-border-strong hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Parent</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Packet Mark</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Max Limit</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Priority</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Rate</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-mesh-text-mute">Status</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-mesh-text-mute">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredMtTree === null ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <TableRow key={i} className="border-mesh-border-strong">
                            {Array.from({ length: 8 }).map((_, j) => (
                              <TableCell key={j}>
                                <Skeleton className="h-4 w-20 bg-mesh-surface-1" />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredMtTree.length === 0 ? (
                        <TableRow className="border-mesh-border-strong hover:bg-transparent">
                          <TableCell colSpan={8} className="py-12 text-center text-mesh-text-mute">
                            {search ? "No tree entries match your filter." : "No queue tree entries."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMtTree.map((entry) => (
                          <TableRow
                            key={entry.id ?? entry.name}
                            className="border-mesh-border hover:bg-mesh-surface-2/55"
                          >
                            <TableCell className="font-medium text-white">{entry.name}</TableCell>
                            <TableCell className="text-mesh-text">{entry.parent ?? "—"}</TableCell>
                            <TableCell className="text-mesh-text">{entry.packet_mark ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-mesh-text-dim">{entry.max_limit ?? "—"}</TableCell>
                            <TableCell className="text-mesh-text">{entry.priority ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs text-mesh-text-dim">
                              <RateDisplay rate={entry.rate} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  entry.disabled
                                    ? "border-mesh-border bg-mesh-surface-1 text-mesh-text-mute"
                                    : entry.dynamic
                                      ? "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]"
                                      : "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]",
                                )}
                              >
                                {entry.disabled ? "disabled" : entry.dynamic ? "dynamic" : "active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {!entry.dynamic && entry.id && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditMtTree(entry)}
                                      className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setPendingDeleteMtTree(entry)}
                                      className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
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
          </TabsContent>
        </Tabs>

        {/* Simple Queue Form Dialog */}
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

        {/* Queue Tree Form Dialog */}
        <QueueTreeFormDialog
          open={showAddMtTree || editMtTree !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAddMtTree(false);
              setEditMtTree(null);
            }
          }}
          existing={editMtTree}
          onSaved={() => {
            setShowAddMtTree(false);
            setEditMtTree(null);
            loadMtQueues();
            load();
          }}
        />

        {/* Delete Simple Queue Confirmation */}
        <AlertDialog
          open={pendingDeleteMtQueue !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMtQueue(null);
          }}
        >
          <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Simple Queue</AlertDialogTitle>
              <AlertDialogDescription className="text-mesh-text-dim">
                Are you sure you want to delete queue{" "}
                <span className="font-medium text-white">{pendingDeleteMtQueue?.name}</span>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMtQueue}
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Queue Tree Confirmation */}
        <AlertDialog
          open={pendingDeleteMtTree !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMtTree(null);
          }}
        >
          <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Queue Tree Entry</AlertDialogTitle>
              <AlertDialogDescription className="text-mesh-text-dim">
                Are you sure you want to delete queue tree entry{" "}
                <span className="font-medium text-white">{pendingDeleteMtTree?.name}</span>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMtTree}
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
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

// ── Rate Display ──────────────────────────────────────────

function RateDisplay({ rate }: { rate: string | null }) {
  if (!rate || rate === "0/0" || rate === "0") return <span className="text-mesh-text-mute">—</span>;
  return <span className="text-mesh-accent">{rate}</span>;
}

// ── Summary Card ──────────────────────────────────────────

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
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mesh-text-mute">{title}</p>
          {available === null ? (
            <Skeleton className="mt-2 h-6 w-14 bg-mesh-surface-1" />
          ) : available ? (
            <p className="mt-1 text-2xl font-semibold text-white">{value ?? 0}</p>
          ) : (
            <p className="mt-1 text-sm text-mesh-text-mute">Not configured</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Simple Queue Form Dialog ──────────────────────────────

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
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isEdit ? "Edit Simple Queue" : "Add Simple Queue"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="queue-name" className="text-xs text-mesh-text-dim">
              Name
            </Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="download-limit-pc"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-target" className="text-xs text-mesh-text-dim">
              Target (IP or subnet)
            </Label>
            <Input
              id="queue-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="192.168.1.100/32"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-max-limit" className="text-xs text-mesh-text-dim">
              Max Limit (upload/download)
            </Label>
            <Input
              id="queue-max-limit"
              value={maxLimit}
              onChange={(e) => setMaxLimit(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="10M/10M"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Limit</Label>
              <Input
                value={burstLimit}
                onChange={(e) => setBurstLimit(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="15M/15M"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Threshold</Label>
              <Input
                value={burstThreshold}
                onChange={(e) => setBurstThreshold(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="8M/8M"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Time</Label>
              <Input
                value={burstTime}
                onChange={(e) => setBurstTime(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="10s/10s"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Priority</Label>
              <Input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-mesh-text-dim">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="Optional comment"
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-mesh-primary text-white hover:bg-mesh-primary">
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Queue Tree Form Dialog ────────────────────────────────

function QueueTreeFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: MikrotikQueueTree | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [packetMark, setPacketMark] = useState("");
  const [priority, setPriority] = useState("");
  const [maxLimit, setMaxLimit] = useState("");
  const [burstLimit, setBurstLimit] = useState("");
  const [burstThreshold, setBurstThreshold] = useState("");
  const [burstTime, setBurstTime] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setParent(existing.parent ?? "");
        setPacketMark(existing.packet_mark ?? "");
        setPriority(existing.priority ?? "");
        setMaxLimit(existing.max_limit ?? "");
        setBurstLimit(existing.burst_limit ?? "");
        setBurstThreshold(existing.burst_threshold ?? "");
        setBurstTime(existing.burst_time ?? "");
        setComment(existing.comment ?? "");
      } else {
        setName("");
        setParent("global");
        setPacketMark("");
        setPriority("");
        setMaxLimit("");
        setBurstLimit("");
        setBurstThreshold("");
        setBurstTime("");
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
    if (!parent.trim()) {
      setFormError("Parent is required (e.g. global)");
      return;
    }

    setLoading(true);
    try {
      const body = {
        name: name.trim(),
        parent: parent.trim(),
        packet_mark: packetMark.trim() || undefined,
        priority: priority.trim() || undefined,
        max_limit: maxLimit.trim() || undefined,
        burst_limit: burstLimit.trim() || undefined,
        burst_threshold: burstThreshold.trim() || undefined,
        burst_time: burstTime.trim() || undefined,
        comment: comment.trim() || undefined,
      };

      if (isEdit && existing?.id) {
        await updateMikrotikQueueTree(existing.id, body);
        toast.success(`Updated tree entry '${name.trim()}'`);
      } else {
        await createMikrotikQueueTree(body);
        toast.success(`Created tree entry '${name.trim()}'`);
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save queue tree entry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-mesh-border bg-mesh-surface-1/95 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isEdit ? "Edit Queue Tree Entry" : "Add Queue Tree Entry"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tree-name" className="text-xs text-mesh-text-dim">
              Name
            </Label>
            <Input
              id="tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="voip-priority"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tree-parent" className="text-xs text-mesh-text-dim">
              Parent
            </Label>
            <Input
              id="tree-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="global"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tree-packet-mark" className="text-xs text-mesh-text-dim">
              Packet Mark
            </Label>
            <Input
              id="tree-packet-mark"
              value={packetMark}
              onChange={(e) => setPacketMark(e.target.value)}
              className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
              placeholder="voip-mark"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Max Limit</Label>
              <Input
                value={maxLimit}
                onChange={(e) => setMaxLimit(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="10M"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Priority</Label>
              <Input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Limit</Label>
              <Input
                value={burstLimit}
                onChange={(e) => setBurstLimit(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="15M"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Threshold</Label>
              <Input
                value={burstThreshold}
                onChange={(e) => setBurstThreshold(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="8M"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Burst Time</Label>
              <Input
                value={burstTime}
                onChange={(e) => setBurstTime(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="10s"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-mesh-text-dim">Comment</Label>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="border-mesh-border bg-mesh-surface-1/95 text-white placeholder:text-mesh-text-mute"
                placeholder="Optional comment"
              />
            </div>
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-mesh-primary text-white hover:bg-mesh-primary">
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
