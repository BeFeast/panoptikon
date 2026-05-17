"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Pencil, Plus, Terminal, Trash2, X } from "lucide-react";
import { SparklineChart } from "@/components/sparkline-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
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
import { apiDelete, apiPatch, createAgent, fetchAgents, fetchAgentReports } from "@/lib/api";
import type { Agent, AgentCreateResponse, AgentReport } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { copyToClipboard } from "@/lib/utils";
import { useApiFetch } from "@/hooks/useApiFetch";

export default function AgentsPage() {
  const router = useRouter();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  const loadSparklines = useCallback(async (agentList: Agent[]) => {
    const results: Record<string, number[]> = {};
    await Promise.allSettled(
      agentList.map(async (agent) => {
        try {
          const reports = await fetchAgentReports(agent.id, 20);
          results[agent.id] = reports
            .filter((r) => r.cpu_percent != null)
            .map((r) => r.cpu_percent!)
            .reverse();
        } catch {
          results[agent.id] = [];
        }
      })
    );
    setSparklines(results);
  }, []);

  const { data: agents, error, mutate } = useApiFetch<Agent[]>(
    "/api/v1/agents",
    async () => {
      const fetched = await fetchAgents();
      loadSparklines(fetched);
      return fetched;
    },
    { refreshInterval: 10_000 },
  );

  // Refetch immediately when agent state changes arrive via WebSocket
  useWsEvent(["agent_online", "agent_offline", "agent_report"], () => mutate());

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/v1/agents/${pendingDelete.id}`);
      mutate(
        (prev) => prev?.filter((a) => a.id !== pendingDelete.id) ?? [],
        { revalidate: false },
      );
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (error) {
    return <ErrorState message={error} onRetry={() => mutate()} />;
  }

  return (
    <PageTransition>
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Agents</h1>
          <HelpTooltip text="Lightweight agents installed on your machines that report system info (CPU, memory, disk, OS) back to Panoptikon." />
        </div>
        <AddAgentDialog
          onCreated={() => { mutate(); }}
        />
      </div>

      {/* Agents table */}
      <div className="rounded-lg border border-mesh-border bg-mesh-surface-1/95">
        {agents === null ? (
          <Table>
            <TableHeader>
              <TableRow className="border-mesh-border-strong hover:bg-transparent">
                <TableHead className="text-mesh-text-mute">Name</TableHead>
                <TableHead className="text-mesh-text-mute">Hostname</TableHead>
                <TableHead className="text-mesh-text-mute">OS</TableHead>
                <TableHead className="text-mesh-text-mute">Platform</TableHead>
                <TableHead className="text-mesh-text-mute">Version</TableHead>
                <TableHead className="text-mesh-text-mute">CPU Trend</TableHead>
                <TableHead className="text-mesh-text-mute">Last Report</TableHead>
                <TableHead className="text-mesh-text-mute">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-mesh-border-strong">
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : agents.length === 0 ? (
          <EmptyState
            icon={Terminal}
            title="No agents connected"
            description="Install a lightweight agent on your machines to collect system metrics like CPU, memory, and disk usage."
            actionLabel="Add Agent"
            onAction={() => {
              // Programmatically click the Add Agent button in the header
              const btn = document.querySelector<HTMLButtonElement>('[data-add-agent-trigger]');
              btn?.click();
            }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-mesh-border-strong hover:bg-transparent">
                <TableHead className="text-mesh-text-mute">Name</TableHead>
                <TableHead className="text-mesh-text-mute">Hostname</TableHead>
                <TableHead className="text-mesh-text-mute">OS</TableHead>
                <TableHead className="text-mesh-text-mute">Platform</TableHead>
                <TableHead className="text-mesh-text-mute">Version</TableHead>
                <TableHead className="text-mesh-text-mute">CPU Trend</TableHead>
                <TableHead className="text-mesh-text-mute">Last Report</TableHead>
                <TableHead className="text-mesh-text-mute">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="border-mesh-border cursor-pointer hover:bg-mesh-surface-2/55 transition-colors"
                  onClick={() => router.push(`/agents/detail?id=${agent.id}`)}
                >
                  <TableCell className="font-medium text-white">
                    {renamingId === agent.id ? (
                      <form
                        className="flex flex-col gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setRenameError(null);
                          try {
                            await apiPatch(`/api/v1/agents/${agent.id}`, { name: renameValue });
                            mutate(
                              (prev) =>
                                prev?.map((a) =>
                                  a.id === agent.id ? { ...a, name: renameValue } : a
                                ) ?? [],
                              { revalidate: false },
                            );
                            setRenamingId(null);
                          } catch {
                            setRenameError("Rename failed");
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-7 w-40 bg-mesh-surface-1 border-mesh-primary text-white text-sm px-2"
                          />
                          <button type="submit" className="text-[#4ade80] hover:text-[#4ade80] transition-colors">
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(null); setRenameError(null); }}
                            className="text-mesh-text-mute hover:text-mesh-text"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {renameError && (
                          <p className="text-xs text-[#fb7185]">{renameError}</p>
                        )}
                      </form>
                    ) : (
                      <span className="group flex items-center gap-1">
                        <span className="flex flex-col">
                          <span className="flex items-center gap-1">
                            <Link
                              href={`/agents/detail?id=${agent.id}`}
                              className="hover:text-mesh-primary transition-colors hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {agent.name ?? agent.id.slice(0, 8)}
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setRenamingId(agent.id);
                                setRenameValue(agent.name ?? "");
                                setRenameError(null);
                              }}
                              className="opacity-0 group-hover:opacity-50 text-mesh-text-dim hover:text-mesh-text"
                            >
                              <Pencil size={12} />
                            </button>
                          </span>
                          {agent.cpu_name && (
                            <span className="w-full min-w-0 truncate text-xs font-normal text-mesh-text-mute" title={agent.cpu_name}>
                              {agent.cpu_name}
                            </span>
                          )}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-mesh-text-dim">
                    {agent.hostname ?? "—"}
                  </TableCell>
                  <TableCell className="text-mesh-text-dim">
                    {agent.os_name ? `${agent.os_name} ${agent.os_version ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-mesh-text-dim">
                    {agent.platform ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-xs text-mesh-text-mute">
                    {agent.version ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SparklineChart data={sparklines[agent.id] ?? []} />
                  </TableCell>
                  <TableCell className="text-mesh-text-dim">
                    {agent.last_report_at ? timeAgo(agent.last_report_at) : "Never"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge online={agent.is_online} />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(agent); }}
                      className="rounded p-1 text-mesh-text-mute hover:bg-[#fb7185]/10 hover:text-[#fb7185] transition-colors"
                      title="Delete agent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fb7185]/10">
                <AlertTriangle className="h-5 w-5 text-[#fb7185]" />
              </div>
              <AlertDialogTitle className="text-white">Delete agent?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-mesh-text-dim pl-[52px]">
              <span className="font-medium text-white">
                {pendingDelete?.name ?? pendingDelete?.id.slice(0, 8)}
              </span>{" "}
              will be permanently removed. Any running agent process will stop reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-mesh-border bg-transparent text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              autoFocus
              className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PageTransition>
  );
}

// ─── Status Badge ───────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        online
          ? "border-[#4ade80]/50 text-[#4ade80]"
          : "border-[#fb7185]/50 text-[#fb7185]"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online
            ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30 status-glow-online"
            : "bg-[#fb7185] ring-2 ring-[#fb7185]/30 status-glow-offline"
        }`}
      />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

// ─── Add Agent Dialog ───────────────────────────────────

function AddAgentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentCreateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createAgent(name.trim());
      setResult(res);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setName("");
      setResult(null);
      setError(null);
    }, 200);
  };

  const serverUrl =
    typeof window !== "undefined" ? window.location.origin : "http://YOUR_SERVER:8080";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button data-add-agent-trigger>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-[680px] border-mesh-border bg-mesh-surface-1/95">
        <DialogHeader>
          <DialogTitle className="text-white">
            {result ? "Agent Created" : "Add New Agent"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "Copy the install command for your target platform."
              : "Give this agent a name, then install it on the target machine."}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                placeholder="e.g. docker-lxc, mini, pi-garage"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            {error && <p className="text-sm text-[#fb7185]">{error}</p>}
            <Button onClick={handleCreate} disabled={loading || !name.trim()} className="w-full">
              {loading ? "Creating…" : "Generate API Key"}
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-mesh-text-dim">API Key</Label>
              <CopyBlock text={result.api_key} />
              <p className="text-xs text-[#fbbf24]">
                ⚠ Save this key — it won&apos;t be shown again.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-mesh-text-dim">Install Command</Label>
              <Tabs defaultValue="linux-amd64">
                <TabsList className="bg-mesh-surface-1">
                  <TabsTrigger value="linux-amd64">Linux x86_64</TabsTrigger>
                  <TabsTrigger value="linux-arm64">Linux ARM64</TabsTrigger>
                  <TabsTrigger value="darwin-arm64">macOS ARM (M1+)</TabsTrigger>
                  <TabsTrigger value="darwin-amd64">macOS Intel</TabsTrigger>
                </TabsList>
                <TabsContent value="linux-amd64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/linux-amd64?key=${result.api_key}&id=${result.id} | sh`}
                  />
                </TabsContent>
                <TabsContent value="linux-arm64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/linux-arm64?key=${result.api_key}&id=${result.id} | sh`}
                  />
                </TabsContent>
                <TabsContent value="darwin-arm64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/darwin-arm64?key=${result.api_key}&id=${result.id} | sh`}
                  />
                </TabsContent>
                <TabsContent value="darwin-amd64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/darwin-amd64?key=${result.api_key}&id=${result.id} | sh`}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <Button onClick={handleClose} variant="secondary" className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Copy Block ─────────────────────────────────────────
// Header-bar layout: Copy button lives in a separate row ABOVE the <pre>.
// This avoids ALL overflow-x conflicts — the pre scrolls independently.

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    // Last resort: select text so user can Ctrl+C manually
    if (preRef.current) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(preRef.current);
      sel?.removeAllRanges();
      sel?.addRange(range);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-mesh-border bg-mesh-surface-1/95">
      {/* Header bar: copy button lives here, completely separate from scroll area */}
      <div className="flex items-center justify-end border-b border-mesh-border px-3 py-1.5">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-mesh-text-mute transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
        >
          {copied ? (
            <Check className="h-3 w-3 text-[#4ade80]" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Scrollable pre — independent of the header bar */}
      <pre
        ref={preRef}
        className="overflow-x-auto p-3 font-mono text-xs text-mesh-text select-all cursor-text"
      >
        {text}
      </pre>
    </div>
  );
}
