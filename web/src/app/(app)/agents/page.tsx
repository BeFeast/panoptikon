"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus, Terminal, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiPatch, createAgent, fetchAgents } from "@/lib/api";
import type { Agent, AgentCreateResponse } from "@/lib/types";
import { timeAgo } from "@/lib/format";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setAgents(await fetchAgents());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      }
    }
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Agents</h1>
        <AddAgentDialog
          onCreated={() => {
            // refresh
            fetchAgents().then(setAgents).catch(() => {});
          }}
        />
      </div>

      {/* Agents table */}
      <div className="rounded-lg border border-[#2a2a3a] bg-[#16161f]">
        {agents === null ? (
          <div className="space-y-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-[#2a2a3a] p-4 last:border-0">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Terminal className="mb-4 h-12 w-12 text-gray-600" />
            <p className="text-lg font-medium text-gray-400">No agents yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Click &quot;Add Agent&quot; to generate an install command.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2a3a] hover:bg-transparent">
                <TableHead className="text-gray-500">Name</TableHead>
                <TableHead className="text-gray-500">Hostname</TableHead>
                <TableHead className="text-gray-500">OS</TableHead>
                <TableHead className="text-gray-500">Platform</TableHead>
                <TableHead className="text-gray-500">Version</TableHead>
                <TableHead className="text-gray-500">Last Report</TableHead>
                <TableHead className="text-gray-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id} className="border-[#2a2a3a]">
                  <TableCell className="font-medium text-white">
                    {renamingId === agent.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await apiPatch(`/api/v1/agents/${agent.id}`, { name: renameValue });
                          setAgents((prev) =>
                            prev?.map((a) =>
                              a.id === agent.id ? { ...a, name: renameValue } : a
                            ) ?? null
                          );
                          setRenamingId(null);
                        }}
                      >
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-7 w-40 bg-[#0a0a0f] border-blue-500 text-white text-sm px-2"
                        />
                        <button type="submit" className="text-green-400 hover:text-green-300">
                          <Check size={14} />
                        </button>
                        <button type="button" onClick={() => setRenamingId(null)} className="text-gray-500 hover:text-gray-300">
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <span
                        className="group flex items-center gap-1 cursor-pointer"
                        onClick={() => { setRenamingId(agent.id); setRenameValue(agent.name ?? ""); }}
                      >
                        {agent.name ?? agent.id.slice(0, 8)}
                        <Pencil size={12} className="opacity-0 group-hover:opacity-50 text-gray-400" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-gray-400">
                    {agent.hostname ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-400">
                    {agent.os_name
                      ? `${agent.os_name} ${agent.os_version ?? ""}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-gray-400">
                    {agent.platform ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-500">
                    {agent.version ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-400">
                    {agent.last_report_at
                      ? timeAgo(agent.last_report_at)
                      : "Never"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge online={agent.is_online} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        online
          ? "border-green-500/50 text-green-400"
          : "border-red-500/50 text-red-400"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online ? "bg-green-500 status-pulse" : "bg-red-500"
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
    // Reset state after close animation
    setTimeout(() => {
      setName("");
      setResult(null);
      setError(null);
    }, 200);
  };

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "http://YOUR_SERVER:8080";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(90vw,680px)] max-w-none overflow-hidden border-[#2a2a3a] bg-[#0d0d14]">
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
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                placeholder="e.g. docker-lxc, mini, pi-garage"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleCreate} disabled={loading || !name.trim()} className="w-full">
              {loading ? "Creating…" : "Generate API Key"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* API Key */}
            <div className="space-y-2">
              <Label className="text-gray-400">API Key</Label>
              <CopyBlock text={result.api_key} />
              <p className="text-xs text-amber-400">
                ⚠ Save this key — it won&apos;t be shown again.
              </p>
            </div>

            {/* Platform install commands */}
            <div className="space-y-2">
              <Label className="text-gray-400">Install Command</Label>
              <Tabs defaultValue="linux-amd64">
                <TabsList className="bg-[#16161f]">
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

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    // Method 1: Modern clipboard API (works on HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch {}
    }

    // Method 2: execCommand (HTTP fallback)
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;top:50%;left:50%;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {}

    // Method 3: Select the text in the pre element so user can Ctrl+C manually
    if (preRef.current) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(preRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Show "Press Ctrl+C" hint
      setCopied(true); // reuse state to show hint briefly
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="relative rounded-md bg-[#16161f]">
      <pre
        ref={preRef}
        className="overflow-x-auto p-3 pr-10 font-mono text-xs text-gray-300 select-all cursor-text"
      >
        {text}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-[#2a2a3a] hover:text-white"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
