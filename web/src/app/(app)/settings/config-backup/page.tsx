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
import { PageTransition } from "@/components/PageTransition";
import {
  fetchConfigBackups,
  fetchConfigBackup,
  createConfigBackup,
  deleteConfigBackup,
  fetchCurrentConfig,
  fetchConfigDiff,
} from "@/lib/api";
import type { ConfigBackupSummary, ConfigDiffResponse } from "@/lib/types";

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

/** Trigger a browser download of a text string as a file. */
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
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Download running config
  const [downloading, setDownloading] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Diff/Restore dialog
  const [diffData, setDiffData] = useState<ConfigDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState<number | null>(null);

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
      const data = await fetchCurrentConfig();
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadTextFile(data.config_text, `vyos-config-${ts}.conf`);
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
        text: err instanceof Error ? err.message : "Failed to save snapshot.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadBackup(id: number) {
    try {
      const backup = await fetchConfigBackup(id);
      const ts = backup.created_at.replace(/[: ]/g, "-");
      const label = backup.label ? `-${backup.label.replace(/\s+/g, "_")}` : "";
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
            <h1 className="text-2xl font-semibold text-white">Config Backup</h1>
            <p className="text-sm text-slate-500">
              Download, snapshot, and compare VyOS router configurations.
            </p>
          </div>
        </div>

        {/* Actions card: Download + Save */}
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
            {/* Download current config */}
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

            {/* Save snapshot */}
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

        {/* Backup history table */}
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-white">
              Backup History
              {total > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  ({total} snapshot{total !== 1 ? "s" : ""})
                </span>
              )}
            </CardTitle>
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
                          {b.label || (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">
                          {formatBytes(b.size_bytes)}
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
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                            </button>
                            {deleteId === b.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  className="rounded bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-500"
                                  onClick={() => handleDelete(b.id)}
                                  disabled={deleting}
                                >
                                  {deleting ? "…" : "Confirm"}
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
          <DiffDialog
            data={diffData}
            onClose={() => setDiffData(null)}
          />
        )}
      </div>
    </PageTransition>
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
  const backupLines = data.backup.split("\n");
  const currentLines = data.current.split("\n");

  // Build simple line-by-line diff
  const maxLen = Math.max(backupLines.length, currentLines.length);
  const diffLines: { type: "same" | "added" | "removed" | "changed"; line: string; num: number }[] = [];

  // Use a simple set-based approach: lines in backup but not current = removed,
  // lines in current but not backup = added, rest are the same.
  // For a more useful display, do a sequential comparison.
  const backupSet = new Set(backupLines);
  const currentSet = new Set(currentLines);

  // Lines removed (in backup but not in current)
  const removed = backupLines.filter((l) => !currentSet.has(l));
  // Lines added (in current but not in backup)
  const added = currentLines.filter((l) => !backupSet.has(l));

  const hasChanges = removed.length > 0 || added.length > 0;

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
              Backup: {data.backup_label || "Unlabeled"} — {formatDate(data.backup_created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {!hasChanges ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="mb-3 h-8 w-8 text-emerald-400" />
              <p className="text-sm text-slate-300">
                The backup and current config are identical.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/60" />
                  {removed.length} line{removed.length !== 1 ? "s" : ""} in
                  backup only
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/60" />
                  {added.length} line{added.length !== 1 ? "s" : ""} in
                  current only
                </span>
              </div>

              {removed.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-rose-400">
                    Lines in backup (missing from current):
                  </p>
                  <pre className="max-h-48 overflow-auto rounded border border-rose-500/20 bg-rose-500/5 p-3 text-xs leading-5 text-rose-300">
                    {removed.join("\n")}
                  </pre>
                </div>
              )}

              {added.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-emerald-400">
                    Lines in current (not in backup):
                  </p>
                  <pre className="max-h-48 overflow-auto rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-300">
                    {added.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <p className="text-xs text-slate-500">
            To restore, download the backup and apply via SSH:{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
              configure &amp;&amp; load /path/to/backup.conf &amp;&amp; commit
            </code>
          </p>
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
