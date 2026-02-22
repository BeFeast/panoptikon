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
      downloadTextFile(config_text, `vyos-config-${ts}.conf`);
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
      downloadTextFile(backup.config_text, `vyos-backup-${ts}${label}.conf`);
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
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        {/* Header with back link */}
        <div className="flex items-center gap-3">
          <a
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Config Backup & Rollback
            </h1>
            <p className="text-sm text-slate-500">
              Preview changes, commit, rollback, and manage VyOS config
              snapshots.
            </p>
          </div>
        </div>

        {/* Pending changes card */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <GitCompare className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base text-white">
                  Config Changes
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Review pending changes against the last snapshot, then apply or
                  discard.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
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
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-rose-500/30 bg-rose-500/10"
                }`}
              >
                {saveMsg.type === "success" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <p
                  className={`text-xs ${
                    saveMsg.type === "success"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {saveMsg.text}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Backup card */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <HardDrive className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Manual Backup
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Download the running config or save a snapshot to the database.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
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
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                />
              </div>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-500"
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
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <History className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base text-white">
                  Backup History & Rollback
                  {total > 0 && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      ({total} snapshot{total !== 1 ? "s" : ""})
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Compare, download, or restore any previous configuration.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No backups yet. Save a snapshot above to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Timestamp</th>
                      <th className="pb-2 pr-3 font-medium">Label</th>
                      <th className="pb-2 pr-3 font-medium">Size</th>
                      <th className="pb-2 pr-3 font-medium">By</th>
                      <th className="pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {items.map((b) => (
                      <tr key={b.id} className="group">
                        <td className="py-2.5 pr-3 text-slate-500">{b.id}</td>
                        <td className="py-2.5 pr-3 text-slate-300">
                          {formatDate(b.created_at)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-400">
                          {b.label ? (
                            <span className="inline-flex items-center">
                              {b.label.startsWith("auto:") ? (
                                <Badge
                                  variant="outline"
                                  className="border-slate-700 text-xs text-slate-500"
                                >
                                  {b.label}
                                </Badge>
                              ) : (
                                b.label
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-600">&mdash;</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">
                          {formatBytes(b.size_bytes)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">
                          {b.created_by}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="rounded px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-blue-500/10"
                              onClick={() => handleDownloadBackup(b.id)}
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded px-2 py-1 text-xs text-amber-400 transition-colors hover:bg-amber-500/10"
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
                                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
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
                                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white"
                                  onClick={() => setRestoreId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                className="rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10"
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
                                  className="rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
                                  onClick={() => handleDelete(b.id)}
                                  disabled={deleting}
                                >
                                  {deleting ? "..." : "Confirm"}
                                </button>
                                <button
                                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white"
                                  onClick={() => setDeleteId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                className="rounded px-2 py-1 text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
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
        <CheckCircle className="mb-3 h-8 w-8 text-emerald-400" />
        <p className="text-sm text-slate-300">No differences found.</p>
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded border border-slate-800 bg-slate-950 p-0 text-xs leading-5 font-mono">
      {lines.map((line, i) => {
        let bgClass = "";
        let textClass = "text-slate-400";
        let prefix = " ";

        if (line.tag === "add") {
          bgClass = "bg-emerald-500/10";
          textClass = "text-emerald-300";
          prefix = "+";
        } else if (line.tag === "remove") {
          bgClass = "bg-rose-500/10";
          textClass = "text-rose-300";
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
    <div className="flex items-center gap-3 text-xs text-slate-500">
      {additions > 0 && (
        <span className="flex items-center gap-1 text-emerald-400">
          <Plus className="h-3 w-3" />
          {additions} addition{additions !== 1 ? "s" : ""}
        </span>
      )}
      {deletions > 0 && (
        <span className="flex items-center gap-1 text-rose-400">
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
    downloadTextFile(data.backup, `vyos-backup-${ts}${label}.conf`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Config Comparison
            </h2>
            <p className="text-xs text-slate-500">
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
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
        <div className="flex items-center justify-end border-t border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={handleDownloadBackup}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download Backup
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
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
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {data.has_changes
                ? "Pending Configuration Changes"
                : "No Pending Changes"}
            </h2>
            <p className="text-xs text-slate-500">
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
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <p className="text-xs text-slate-500">
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
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
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
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
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
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
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
