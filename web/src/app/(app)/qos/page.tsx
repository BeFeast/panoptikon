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
import {
  fetchSettings,
  fetchQosSummary,
  fetchVyosTrafficPolicies,
  createVyosTrafficPolicy,
  deleteVyosTrafficPolicy,
  fetchMikrotikSimpleQueues,
  createMikrotikSimpleQueue,
  updateMikrotikSimpleQueue,
  deleteMikrotikSimpleQueue,
  fetchMikrotikQueueTree,
} from "@/lib/api";
import type {
  QosSummary,
  VyosTrafficPolicy,
  MikrotikSimpleQueue,
  MikrotikQueueTree,
} from "@/lib/types";
import { toast } from "sonner";

export default function QosPage() {
  const [summary, setSummary] = useState<QosSummary | null>(null);
  const [legacyRoutersEnabled, setLegacyRoutersEnabled] = useState(false);
  const [vyosPolicies, setVyosPolicies] = useState<
    VyosTrafficPolicy[] | null
  >(null);
  const [mtQueues, setMtQueues] = useState<MikrotikSimpleQueue[] | null>(null);
  const [mtTree, setMtTree] = useState<MikrotikQueueTree[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const vyosVisible = legacyRoutersEnabled && !!summary?.vyos_available;

  // Dialogs
  const [showAddVyos, setShowAddVyos] = useState(false);
  const [showAddMtQueue, setShowAddMtQueue] = useState(false);
  const [editMtQueue, setEditMtQueue] = useState<MikrotikSimpleQueue | null>(
    null
  );
  const [pendingDeleteVyos, setPendingDeleteVyos] =
    useState<VyosTrafficPolicy | null>(null);
  const [pendingDeleteMtQueue, setPendingDeleteMtQueue] =
    useState<MikrotikSimpleQueue | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchQosSummary();
      setSummary(s);
    } catch {
      // summary is best-effort
    }
  }, []);

  const loadVyos = useCallback(async () => {
    try {
      const data = await fetchVyosTrafficPolicies();
      setVyosPolicies(data.policies);
    } catch {
      setVyosPolicies([]);
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
    fetchSettings()
      .then((settings) => setLegacyRoutersEnabled(settings.show_legacy_routers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "vyos") loadVyos();
    if (activeTab === "mikrotik") loadMtQueues();
  }, [activeTab, loadVyos, loadMtQueues]);

  useEffect(() => {
    if (!vyosVisible && activeTab === "vyos") {
      setActiveTab("overview");
    }
  }, [activeTab, vyosVisible]);

  // -- Filter helpers --
  const filteredVyos = useMemo(() => {
    if (!vyosPolicies) return null;
    if (!search.trim()) return vyosPolicies;
    const q = search.toLowerCase();
    return vyosPolicies.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.policy_type.toLowerCase().includes(q)
    );
  }, [vyosPolicies, search]);

  const filteredMtQueues = useMemo(() => {
    if (!mtQueues) return null;
    if (!search.trim()) return mtQueues;
    const q = search.toLowerCase();
    return mtQueues.filter(
      (queue) =>
        queue.name.toLowerCase().includes(q) ||
        queue.target.toLowerCase().includes(q) ||
        (queue.comment ?? "").toLowerCase().includes(q)
    );
  }, [mtQueues, search]);

  const filteredMtTree = useMemo(() => {
    if (!mtTree) return null;
    if (!search.trim()) return mtTree;
    const q = search.toLowerCase();
    return mtTree.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.parent ?? "").toLowerCase().includes(q)
    );
  }, [mtTree, search]);

  // -- Handlers --
  async function handleDeleteVyosPolicy() {
    if (!pendingDeleteVyos) return;
    try {
      await deleteVyosTrafficPolicy(
        pendingDeleteVyos.policy_type,
        pendingDeleteVyos.name
      );
      setVyosPolicies(
        (prev) =>
          prev?.filter((p) => p.name !== pendingDeleteVyos.name) ?? null
      );
      toast.success(`Deleted policy '${pendingDeleteVyos.name}'`);
      load();
    } catch {
      toast.error("Failed to delete traffic policy");
    } finally {
      setPendingDeleteVyos(null);
    }
  }

  async function handleDeleteMtQueue() {
    if (!pendingDeleteMtQueue || !pendingDeleteMtQueue.id) return;
    try {
      await deleteMikrotikSimpleQueue(pendingDeleteMtQueue.id);
      setMtQueues(
        (prev) =>
          prev?.filter((q) => q.id !== pendingDeleteMtQueue.id) ?? null
      );
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
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gauge className="h-6 w-6 text-blue-500" />
            <h1 className="text-2xl font-semibold text-white">
              QoS / Traffic Shaping
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              load();
              if (activeTab === "vyos") loadVyos();
              if (activeTab === "mikrotik") loadMtQueues();
            }}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className={`grid gap-4 ${vyosVisible ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {vyosVisible && (
            <SummaryCard
              title="VyOS Policies"
              value={summary?.vyos_policy_count ?? null}
              available={vyosVisible}
              icon={<Router className="h-4 w-4 text-blue-400" />}
            />
          )}
          <SummaryCard
            title="MikroTik Simple Queues"
            value={summary?.mikrotik_simple_queue_count ?? null}
            available={summary?.mikrotik_available ?? null}
            icon={<Network className="h-4 w-4 text-orange-400" />}
          />
          <SummaryCard
            title="MikroTik Queue Tree"
            value={summary?.mikrotik_queue_tree_count ?? null}
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
            {vyosVisible && (
              <TabsTrigger
                value="vyos"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                VyOS Policies
                <span className="ml-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-400">
                  Legacy
                </span>
              </TabsTrigger>
            )}
            {summary?.mikrotik_available && (
              <TabsTrigger
                value="mikrotik"
                className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
              >
                MikroTik Queues
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-white">
                  Traffic Shaping Overview
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Manage bandwidth queues and traffic policies across your
                  routers.{vyosVisible ? " Use VyOS traffic policies for HTB/HFSC shaping, or MikroTik" : " Use MikroTik"} simple queues for per-device bandwidth limits.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-slate-400">
                  {vyosVisible && (
                    <p>
                      VyOS router configured with{" "}
                      <span className="font-medium text-white">
                        {summary.vyos_policy_count}
                      </span>{" "}
                      traffic{" "}
                      {summary.vyos_policy_count === 1 ? "policy" : "policies"}.
                    </p>
                  )}
                  {summary?.mikrotik_available && (
                    <p>
                      MikroTik router configured with{" "}
                      <span className="font-medium text-white">
                        {summary.mikrotik_simple_queue_count}
                      </span>{" "}
                      simple{" "}
                      {summary.mikrotik_simple_queue_count === 1
                        ? "queue"
                        : "queues"}{" "}
                      and{" "}
                      <span className="font-medium text-white">
                        {summary.mikrotik_queue_tree_count}
                      </span>{" "}
                      queue tree{" "}
                      {summary.mikrotik_queue_tree_count === 1
                        ? "entry"
                        : "entries"}
                      .
                    </p>
                  )}
                  {!vyosVisible && !summary?.mikrotik_available && (
                    <p>
                      No router is configured. Go to{" "}
                      <span className="font-medium text-white">Settings</span>{" "}
                      to configure a router.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* VyOS Policies Tab */}
          <TabsContent value="vyos" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Filter policies..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
                />
              </div>
              <Button
                size="sm"
                onClick={() => setShowAddVyos(true)}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Policy
              </Button>
            </div>

            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">Type</TableHead>
                      <TableHead className="text-slate-400">
                        Bandwidth
                      </TableHead>
                      <TableHead className="text-slate-400">Classes</TableHead>
                      <TableHead className="text-right text-slate-400">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVyos === null ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i} className="border-slate-800">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-24 bg-slate-800" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredVyos.length === 0 ? (
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-12 text-center text-slate-500"
                        >
                          {search
                            ? "No policies match your filter."
                            : "No traffic policies configured."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredVyos.map((policy) => (
                        <TableRow
                          key={`${policy.policy_type}-${policy.name}`}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            {policy.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="border-blue-500/30 text-blue-400"
                            >
                              {policy.policy_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {policy.bandwidth ?? "—"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {policy.classes.length}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDeleteVyos(policy)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MikroTik Queues Tab */}
          <TabsContent value="mikrotik" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Filter queues..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
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

            {/* Simple Queues */}
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-white">
                  Simple Queues
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Per-target bandwidth limits (IP/subnet).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">Target</TableHead>
                      <TableHead className="text-slate-400">
                        Max Limit
                      </TableHead>
                      <TableHead className="text-slate-400">
                        Priority
                      </TableHead>
                      <TableHead className="text-slate-400">Rate</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-right text-slate-400">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMtQueues === null ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i} className="border-slate-800">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-20 bg-slate-800" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredMtQueues.length === 0 ? (
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="py-12 text-center text-slate-500"
                        >
                          {search
                            ? "No queues match your filter."
                            : "No simple queues configured."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMtQueues.map((queue) => (
                        <TableRow
                          key={queue.id ?? queue.name}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            {queue.name}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {queue.target}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {queue.max_limit ?? "—"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {queue.priority ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {queue.rate ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                queue.disabled
                                  ? "border-slate-700 text-slate-500"
                                  : queue.dynamic
                                    ? "border-amber-500/30 text-amber-400"
                                    : "border-emerald-500/30 text-emerald-400"
                              }
                            >
                              {queue.disabled
                                ? "disabled"
                                : queue.dynamic
                                  ? "dynamic"
                                  : "active"}
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
                                    onClick={() =>
                                      setPendingDeleteMtQueue(queue)
                                    }
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
              </CardContent>
            </Card>

            {/* Queue Tree (read-only) */}
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-white">
                  Queue Tree
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Hierarchical queue entries (read-only view).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-400">Name</TableHead>
                      <TableHead className="text-slate-400">Parent</TableHead>
                      <TableHead className="text-slate-400">
                        Packet Mark
                      </TableHead>
                      <TableHead className="text-slate-400">
                        Max Limit
                      </TableHead>
                      <TableHead className="text-slate-400">
                        Priority
                      </TableHead>
                      <TableHead className="text-slate-400">Rate</TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMtTree === null ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <TableRow key={i} className="border-slate-800">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-20 bg-slate-800" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredMtTree.length === 0 ? (
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="py-12 text-center text-slate-500"
                        >
                          {search
                            ? "No tree entries match your filter."
                            : "No queue tree entries."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMtTree.map((entry) => (
                        <TableRow
                          key={entry.id ?? entry.name}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            {entry.name}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {entry.parent ?? "—"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {entry.packet_mark ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {entry.max_limit ?? "—"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {entry.priority ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {entry.rate ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                entry.disabled
                                  ? "border-slate-700 text-slate-500"
                                  : "border-emerald-500/30 text-emerald-400"
                              }
                            >
                              {entry.disabled ? "disabled" : "active"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* VyOS Add Policy Dialog */}
        <VyosPolicyFormDialog
          open={showAddVyos}
          onOpenChange={setShowAddVyos}
          onSaved={() => {
            setShowAddVyos(false);
            loadVyos();
            load();
          }}
        />

        {/* MikroTik Add/Edit Queue Dialog */}
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

        {/* VyOS Delete Confirmation */}
        <AlertDialog
          open={pendingDeleteVyos !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteVyos(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Traffic Policy
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete the{" "}
                <span className="font-medium text-white">
                  {pendingDeleteVyos?.policy_type}
                </span>{" "}
                policy{" "}
                <span className="font-medium text-white">
                  {pendingDeleteVyos?.name}
                </span>
                ? This will commit the change to VyOS immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-800 text-slate-300 hover:bg-slate-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteVyosPolicy}
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MikroTik Delete Confirmation */}
        <AlertDialog
          open={pendingDeleteMtQueue !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteMtQueue(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Simple Queue
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete queue{" "}
                <span className="font-medium text-white">
                  {pendingDeleteMtQueue?.name}
                </span>
                ?
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

// ─── Summary Card ──────────────────────────────────────────

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
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          {available === null ? (
            <Skeleton className="mt-1 h-6 w-8 bg-slate-800" />
          ) : available ? (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          ) : (
            <p className="text-sm text-slate-600">Not configured</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── VyOS Policy Form ──────────────────────────────────────

function VyosPolicyFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [policyType, setPolicyType] = useState("shaper");
  const [bandwidth, setBandwidth] = useState("");
  const [defaultBandwidth, setDefaultBandwidth] = useState("");
  const [defaultCeiling, setDefaultCeiling] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPolicyType("shaper");
      setBandwidth("");
      setDefaultBandwidth("");
      setDefaultCeiling("");
      setDescription("");
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!bandwidth.trim()) {
      setFormError("Bandwidth is required (e.g. 100mbit)");
      return;
    }

    setLoading(true);
    try {
      await createVyosTrafficPolicy({
        name: name.trim(),
        policy_type: policyType,
        bandwidth: bandwidth.trim(),
        default_bandwidth: defaultBandwidth.trim() || undefined,
        default_ceiling: defaultCeiling.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success(`Created traffic policy '${name.trim()}'`);
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create policy"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Add VyOS Traffic Policy
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="policy-name" className="text-xs text-slate-400">
              Policy Name
            </Label>
            <Input
              id="policy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="my-shaper"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="policy-type"
                className="text-xs text-slate-400"
              >
                Type
              </Label>
              <select
                id="policy-type"
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white"
              >
                <option value="shaper">shaper</option>
                <option value="limiter">limiter</option>
                <option value="round-robin">round-robin</option>
                <option value="priority-queue">priority-queue</option>
                <option value="rate-control">rate-control</option>
                <option value="shaper-hfsc">shaper-hfsc</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="policy-bandwidth"
                className="text-xs text-slate-400"
              >
                Bandwidth
              </Label>
              <Input
                id="policy-bandwidth"
                value={bandwidth}
                onChange={(e) => setBandwidth(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="100mbit"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">
                Default Bandwidth
              </Label>
              <Input
                value={defaultBandwidth}
                onChange={(e) => setDefaultBandwidth(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="10mbit"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">
                Default Ceiling
              </Label>
              <Input
                value={defaultCeiling}
                onChange={(e) => setDefaultCeiling(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="50mbit"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
              placeholder="Optional description"
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
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {loading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── MikroTik Queue Form ───────────────────────────────────

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
      setFormError(
        err instanceof Error ? err.message : "Failed to save queue"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Simple Queue" : "Add Simple Queue"}
          </DialogTitle>
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
            <Label
              htmlFor="queue-max-limit"
              className="text-xs text-slate-400"
            >
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
              <Label className="text-xs text-slate-400">
                Burst Threshold
              </Label>
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
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {loading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
