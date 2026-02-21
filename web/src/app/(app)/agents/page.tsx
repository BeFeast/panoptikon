"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          // Reverse to chronological order (API returns DESC)
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

  const load = useCallback(async () => {
    try {
      const fetched = await fetchAgents();
      setAgents(fetched);
      loadSparklines(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    }
  }, [loadSparklines]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  // Refetch immediately when agent state changes arrive via WebSocket
  useWsEvent(["agent_online", "agent_offline", "agent_report"], load);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/v1/agents/${pendingDelete.id}`);
      setAgents((prev) => prev?.filter((a) => a.id !== pendingDelete.id) ?? null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Agents</h1>
        <AddAgentDialog
          onCreated={() => {
            fetchAgents().then(setAgents).catch(() => {});
          }}
        />
      </div>

      {/* Agents table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        {agents === null ? (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-500">Name</TableHead>
                <TableHead className="text-slate-500">Hostname</TableHead>
                <TableHead className="text-slate-500">OS</TableHead>
                <TableHead className="text-slate-500">Platform</TableHead>
                <TableHead className="text-slate-500">Version</TableHead>
                <TableHead className="text-slate-500">CPU Trend</TableHead>
                <TableHead className="text-slate-500">Last Report</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Terminal className="mb-4 h-12 w-12 text-slate-600" />
            <p className="text-lg font-medium text-slate-400">No agents yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Click &quot;Add Agent&quot; to generate an install command.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-500">Name</TableHead>
                <TableHead className="text-slate-500">Hostname</TableHead>
                <TableHead className="text-slate-500">OS</TableHead>
                <TableHead className="text-slate-500">Platform</TableHead>
                <TableHead className="text-slate-500">Version</TableHead>
                <TableHead className="text-slate-500">CPU Trend</TableHead>
                <TableHead className="text-slate-500">Last Report</TableHead>
                <TableHead className="text-slate-500">Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="border-slate-800">
                  <TableCell className="font-medium text-white">
                    {renamingId === agent.id ? (
                      <form
                        className="flex flex-col gap-1"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setRenameError(null);
                          try {
                            await apiPatch(`/api/v1/agents/${agent.id}`, { name: renameValue });
                            setAgents((prev) =>
                              prev?.map((a) =>
                                a.id === agent.id ? { ...a, name: renameValue } : a
                              ) ?? null
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
                            className="h-7 w-40 bg-slate-950 border-blue-500 text-white text-sm px-2"
                          />
                          <button type="submit" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(null); setRenameError(null); }}
                            className="text-slate-500 hover:text-slate-300"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {renameError && (
                          <p className="text-xs text-rose-400">{renameError}</p>
                        )}
                      </form>
                    ) : (
                      <span className="group flex items-center gap-1">
                        <Link
                          href={`/agents/detail?id=${agent.id}`}
                          className="hover:text-blue-400 transition-colors hover:underline"
                        >
                          {agent.name ?? agent.id.slice(0, 8)}
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(agent.id);
                            setRenameValue(agent.name ?? "");
                            setRenameError(null);
                          }}
                          className="opacity-0 group-hover:opacity-50 text-slate-400 hover:text-gray-200"
                        >
                          <Pencil size={12} />
                        </button>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-slate-400">
                    {agent.hostname ?? "—"}
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {agent.os_name ? `${agent.os_name} ${agent.os_version ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {agent.platform ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-xs text-slate-500">
                    {agent.version ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SparklineChart data={sparklines[agent.id] ?? []} />
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {agent.last_report_at ? timeAgo(agent.last_report_at) : "Never"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge online={agent.is_online} />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setPendingDelete(agent)}
                      className="rounded p-1 text-slate-600 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
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
        <AlertDialogContent className="border-slate-800 bg-slate-950">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <AlertDialogTitle className="text-white">Delete agent?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-400 pl-[52px]">
              <span className="font-medium text-white">
                {pendingDelete?.name ?? pendingDelete?.id.slice(0, 8)}
              </span>{" "}
              will be permanently removed. Any running agent process will stop reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-slate-800 bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              autoFocus
              className="bg-rose-600 text-white hover:bg-rose-500"
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
          ? "border-emerald-500/50 text-emerald-400"
          : "border-rose-500/50 text-rose-400"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online
            ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
            : "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline"
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-[680px] border-slate-800 bg-slate-950">
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
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button onClick={handleCreate} disabled={loading || !name.trim()} className="w-full">
              {loading ? "Creating…" : "Generate API Key"}
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-slate-400">API Key</Label>
              <CopyBlock text={result.api_key} />
              <p className="text-xs text-amber-400">
                ⚠ Save this key — it won&apos;t be shown again.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-400">Install Command</Label>
              <Tabs defaultValue="linux-amd64">
                <TabsList className="bg-slate-900">
                  <TabsTrigger value="linux-amd64">Linux x86_64</TabsTrigger>
                  <TabsTrigger value="linux-arm64">Linux ARM64</TabsTrigger>
                  <TabsTrigger value="darwin-arm64">macOS ARM (M1+)</TabsTrigger>
                  <TabsTrigger value="darwin-amd64">macOS Intel</TabsTrigger>
                </TabsList>
                <TabsContent value="linux-amd64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/linux-amd64?key=${result.api_key} | sh`}
                  />
                </TabsContent>
                <TabsContent value="linux-arm64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/linux-arm64?key=${result.api_key} | sh`}
                  />
                </TabsContent>
                <TabsContent value="darwin-arm64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/darwin-arm64?key=${result.api_key} | sh`}
                  />
                </TabsContent>
                <TabsContent value="darwin-amd64">
                  <CopyBlock
                    text={`curl -fsSL ${serverUrl}/api/v1/agent/install/darwin-amd64?key=${result.api_key} | sh`}
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
    // Modern clipboard API (HTTPS / localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {}
    }

    // HTTP fallback: execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText =
        "position:fixed;top:50%;left:50%;width:2em;height:2em;padding:0;border:none;outline:none;background:transparent;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {}

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
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
      {/* Header bar: copy button lives here, completely separate from scroll area */}
      <div className="flex items-center justify-end border-b border-slate-800 px-3 py-1.5">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-800/50 hover:text-white"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Scrollable pre — independent of the header bar */}
      <pre
        ref={preRef}
        className="overflow-x-auto p-3 font-mono text-xs text-slate-300 select-all cursor-text"
      >
        {text}
      </pre>
    </div>
  );
}
