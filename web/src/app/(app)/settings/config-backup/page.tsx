"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Save,
  Trash2,
  RotateCcw,
  Loader2,
  HardDrive,
  AlertCircle,
  CheckCircle,
  X,
  GitCompare,
  Play,
  Undo2,
  History,
  Plus,
  Minus,
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
import { PageTransition } from "@/components/PageTransition";
import {
  fetchConfigBackups,
  fetchConfigBackup,
  createConfigBackup,
  deleteConfigBackup,
  fetchConfigDiff,
  fetchPendingChanges,
  commitConfig,
  discardConfig,
  restoreConfigBackup,
} from "@/lib/api";
import type {
  ConfigBackupSummary,
  ConfigDiffResponse,
  DiffLine,
  PendingChangesResponse,
} from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + "Z");
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function downloadTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ConfigBackupPage() {
  const [items, setItems] = useState<ConfigBackupSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Save snapshot
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Download running config
  const [downloading, setDownloading] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Diff dialog
  const [diffData, setDiffData] = useState<ConfigDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState<number | null>(null);

  // Pending changes
  const [pendingData, setPendingData] = useState<PendingChangesResponse | null>(
    null
  );
  const [pendingLoading, setPendingLoading] = useState(false);

  // Restore
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Commit / discard
  const [committing, setCommitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConfigBackups(1, 100);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  async function handleDownloadCurrent() {
    setDownloading(true);
    try {
      const { config_text } = await import("@/lib/api").then((m) =>
        m.fetchCurrentConfig()
      );
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadTextFile(config_text, `router-config-${ts}.conf`);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  }

  async function handleSaveSnapshot() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await createConfigBackup(snapshotLabel || undefined);
      setSnapshotLabel("");
      setSaveMsg({ type: "success", text: "Snapshot saved." });
      setTimeout(() => setSaveMsg(null), 3000);
      loadBackups();
    } catch (err) {
      setSaveMsg({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to save snapshot.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadBackup(id: number) {
    try {
      const backup = await fetchConfigBackup(id);
      const ts = backup.created_at.replace(/[: ]/g, "-");
      const label = backup.label
        ? `-${backup.label.replace(/\s+/g, "_")}`
        : "";
      downloadTextFile(backup.config_text, `router-backup-${ts}${label}.conf`);
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      await deleteConfigBackup(id);
      setDeleteId(null);
      loadBackups();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  async function handleShowDiff(id: number) {
    setDiffLoading(id);
    try {
      const data = await fetchConfigDiff(id);
      setDiffData(data);
    } catch {
      // ignore
    } finally {
      setDiffLoading(null);
    }
  }

  async function handleCheckPending() {
    setPendingLoading(true);
    try {
      const data = await fetchPendingChanges();
      setPendingData(data);
    } catch {
      // ignore
    } finally {
      setPendingLoading(false);
    }
  }

  async function handleCommit() {
    setCommitting(true);
    try {
      await commitConfig();
      setPendingData(null);
      loadBackups();
      setSaveMsg({ type: "success", text: "Config committed and saved." });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Commit failed.",
      });
    } finally {
      setCommitting(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    try {
      await discardConfig();
      setPendingData(null);
      setSaveMsg({
        type: "success",
        text: "Uncommitted changes discarded.",
      });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Discard failed.",
      });
    } finally {
      setDiscarding(false);
    }
  }

  async function handleRestore(id: number) {
    setRestoring(true);
    try {
      const result = await restoreConfigBackup(id);
      setRestoreId(null);
      loadBackups();
      setSaveMsg({
        type: result.success ? "success" : "error",
        text: result.message,
      });
      setTimeout(() => setSaveMsg(null), 5000);
    } catch (err) {
      setSaveMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Restore failed.",
      });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-8 py-8">
        {/* Header with back link */}
        <div className="flex items-center gap-3">
          <a
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Config Backup & Rollback
            </h1>
            <p className="text-sm text-mesh-text-mute">
              Preview changes, commit, rollback, and manage router config
              snapshots.
            </p>
          </div>
        </div>

        {/* Pending changes card */}
        <Card className="">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mesh-primary/10">
                <GitCompare className="h-4 w-4 text-mesh-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                  Config Changes
                </CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Review pending changes against the last snapshot, then apply or
                  discard.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 hover:text-white"
              disabled={pendingLoading}
              onClick={handleCheckPending}
            >
              {pendingLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitCompare className="mr-2 h-4 w-4" />
              )}
              Check for Changes
            </Button>

            {saveMsg && (
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                  saveMsg.type === "success"
                    ? "border-[#4ade80]/30 bg-[#4ade80]/10"
                    : "border-[#fb7185]/30 bg-[#fb7185]/10"
                }`}
              >
                {saveMsg.type === "success" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-[#4ade80]" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
                )}
                <p
                  className={`text-xs ${
                    saveMsg.type === "success"
                      ? "text-[#4ade80]"
                      : "text-[#fb7185]"
                  }`}
                >
                  {saveMsg.text}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Backup card */}
        <Card className="">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4ade80]/10">
                <HardDrive className="h-4 w-4 text-[#4ade80]" />
              </div>
              <div>
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                  Manual Backup
                </CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Download the running config or save a snapshot to the database.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 hover:text-white"
              disabled={downloading}
              onClick={handleDownloadCurrent}
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download Running Config
            </Button>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="snapshot-label" className="sr-only">
                  Snapshot label
                </Label>
                <Input
                  id="snapshot-label"
                  placeholder="Optional label (e.g. Before firewall change)"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-white placeholder:text-mesh-text-mute"
                />
              </div>
              <Button
                className="bg-[#4ade80] text-white hover:bg-[#4ade80]"
                disabled={saving}
                onClick={handleSaveSnapshot}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Snapshot
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Backup history / rollback table */}
        <Card className="">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fbbf24]/10">
                <History className="h-4 w-4 text-[#fbbf24]" />
              </div>
              <div>
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-mesh-text-mute">
                  Backup History & Rollback
                  {total > 0 && (
                    <span className="ml-2 text-sm font-normal text-mesh-text-mute">
                      ({total} snapshot{total !== 1 ? "s" : ""})
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-mesh-text-mute">
                  Compare, download, or restore any previous configuration.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-mesh-text-mute" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-sm text-mesh-text-mute">
                No backups yet. Save a snapshot above to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-mesh-border text-left text-xs text-mesh-text-mute">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Timestamp</th>
                      <th className="pb-2 pr-3 font-medium">Label</th>
                      <th className="pb-2 pr-3 font-medium">Size</th>
                      <th className="pb-2 pr-3 font-medium">By</th>
                      <th className="pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mesh-border">
                    {items.map((b) => (
                      <tr key={b.id} className="group">
                        <td className="py-2.5 pr-3 text-mesh-text-mute">{b.id}</td>
                        <td className="py-2.5 pr-3 text-mesh-text">
                          {formatDate(b.created_at)}
                        </td>
                        <td className="py-2.5 pr-3 text-mesh-text-dim">
                          {b.label ? (
                            <span className="inline-flex items-center">
                              {b.label.startsWith("auto:") ? (
                                <Badge
                                  variant="outline"
                                  className="border-mesh-border-strong text-xs text-mesh-text-mute"
                                >
                                  {b.label}
                                </Badge>
                              ) : (
                                b.label
                              )}
                            </span>
                          ) : (
                            <span className="text-mesh-text-mute">&mdash;</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-mesh-text-mute">
                          {formatBytes(b.size_bytes)}
                        </td>
                        <td className="py-2.5 pr-3 text-mesh-text-mute">
                          {b.created_by}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="rounded px-2 py-1 text-xs text-mesh-primary transition-colors hover:bg-mesh-primary/10"
                              onClick={() => handleDownloadBackup(b.id)}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded px-2 py-1 text-xs text-[#fbbf24] transition-colors hover:bg-[#fbbf24]/10"
                              onClick={() => handleShowDiff(b.id)}
                              disabled={diffLoading === b.id}
                              title="Compare with current"
                            >
                              {diffLoading === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <GitCompare className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {/* Restore button */}
                            {restoreId === b.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  className="rounded bg-mesh-primary px-2 py-1 text-xs text-white hover:bg-mesh-primary"
                                  onClick={() => handleRestore(b.id)}
                                  disabled={restoring}
                                >
                                  {restoring ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Restore"
                                  )}
                                </button>
                                <button
                                  className="rounded px-2 py-1 text-xs text-mesh-text-dim hover:text-white"
                                  onClick={() => setRestoreId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                className="rounded px-2 py-1 text-xs text-[#4ade80] transition-colors hover:bg-[#4ade80]/10"
                                onClick={() => setRestoreId(b.id)}
                                title="Rollback to this config"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {/* Delete button */}
                            {deleteId === b.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  className="rounded bg-[#fb7185] px-2 py-1 text-xs text-white hover:bg-[#fb7185]"
                                  onClick={() => handleDelete(b.id)}
                                  disabled={deleting}
                                >
                                  {deleting ? "..." : "Confirm"}
                                </button>
                                <button
                                  className="rounded px-2 py-1 text-xs text-mesh-text-dim hover:text-white"
                                  onClick={() => setDeleteId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                className="rounded px-2 py-1 text-xs text-[#fb7185] transition-colors hover:bg-[#fb7185]/10"
                                onClick={() => setDeleteId(b.id)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diff overlay */}
        {diffData && (
          <DiffDialog data={diffData} onClose={() => setDiffData(null)} />
        )}

        {/* Pending changes overlay */}
        {pendingData && (
          <PendingChangesDialog
            data={pendingData}
            onClose={() => setPendingData(null)}
            onCommit={handleCommit}
            onDiscard={handleDiscard}
            committing={committing}
            discarding={discarding}
          />
        )}
      </div>
    </PageTransition>
  );
}

// ── Unified Diff Viewer ──────────────────────────────────────────────────────

function DiffLineView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CheckCircle className="mb-3 h-8 w-8 text-[#4ade80]" />
        <p className="text-sm text-mesh-text">No differences found.</p>
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded mesh-card p-0 text-xs leading-5 font-mono">
      {lines.map((line, i) => {
        let bgClass = "";
        let textClass = "text-mesh-text-dim";
        let prefix = " ";

        if (line.tag === "add") {
          bgClass = "bg-[#4ade80]/10";
          textClass = "text-[#4ade80]";
          prefix = "+";
        } else if (line.tag === "remove") {
          bgClass = "bg-[#fb7185]/10";
          textClass = "text-[#fb7185]";
          prefix = "-";
        }

        return (
          <div key={i} className={`px-3 py-0 ${bgClass} ${textClass}`}>
            <span className="inline-block w-4 select-none opacity-60">
              {prefix}
            </span>
            {line.content}
          </div>
        );
      })}
    </pre>
  );
}

function DiffStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-mesh-text-mute">
      {additions > 0 && (
        <span className="flex items-center gap-1 text-[#4ade80]">
          <Plus className="h-3 w-3" />
          {additions} addition{additions !== 1 ? "s" : ""}
        </span>
      )}
      {deletions > 0 && (
        <span className="flex items-center gap-1 text-[#fb7185]">
          <Minus className="h-3 w-3" />
          {deletions} deletion{deletions !== 1 ? "s" : ""}
        </span>
      )}
      {additions === 0 && deletions === 0 && (
        <span>No changes</span>
      )}
    </div>
  );
}

// ── Diff dialog component ────────────────────────────────────────────────────

function DiffDialog({
  data,
  onClose,
}: {
  data: ConfigDiffResponse;
  onClose: () => void;
}) {
  function handleDownloadBackup() {
    const label = data.backup_label
      ? `-${data.backup_label.replace(/\s+/g, "_")}`
      : "";
    const ts = data.backup_created_at.replace(/[: ]/g, "-");
    downloadTextFile(data.backup, `router-backup-${ts}${label}.conf`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col mesh-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mesh-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Config Comparison
            </h2>
            <p className="text-xs text-mesh-text-mute">
              Backup: {data.backup_label || "Unlabeled"} &mdash;{" "}
              {formatDate(data.backup_created_at)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DiffStats
              additions={data.additions}
              deletions={data.deletions}
            />
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          <DiffLineView lines={data.diff_lines} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-mesh-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text hover:bg-mesh-surface-2/55 hover:text-white"
              onClick={handleDownloadBackup}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download Backup
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pending changes dialog ───────────────────────────────────────────────────

function PendingChangesDialog({
  data,
  onClose,
  onCommit,
  onDiscard,
  committing,
  discarding,
}: {
  data: PendingChangesResponse;
  onClose: () => void;
  onCommit: () => void;
  onDiscard: () => void;
  committing: boolean;
  discarding: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col mesh-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mesh-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {data.has_changes
                ? "Pending Configuration Changes"
                : "No Pending Changes"}
            </h2>
            <p className="text-xs text-mesh-text-mute">
              Compared against the most recent snapshot
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DiffStats
              additions={data.additions}
              deletions={data.deletions}
            />
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-mesh-text-dim transition-colors hover:bg-mesh-surface-2/55 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          <DiffLineView lines={data.diff_lines} />
        </div>

        {/* Footer — Apply / Discard */}
        <div className="flex items-center justify-between border-t border-mesh-border px-5 py-4">
          <p className="text-xs text-mesh-text-mute">
            {data.has_changes
              ? "Apply commits and saves the config. Discard reverts staged changes."
              : "The running config matches the last snapshot."}
          </p>
          <div className="flex items-center gap-2">
            {data.has_changes && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#fb7185]/30 text-[#fb7185] hover:bg-[#fb7185]/10 hover:text-[#fb7185]"
                  onClick={onDiscard}
                  disabled={discarding || committing}
                >
                  {discarding ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Discard
                </Button>
                <Button
                  size="sm"
                  className="bg-[#4ade80] text-white hover:bg-[#4ade80]"
                  onClick={onCommit}
                  disabled={committing || discarding}
                >
                  {committing ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-3.5 w-3.5" />
                  )}
                  Apply
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
