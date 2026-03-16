"use client";

import { useCallback, useState } from "react";
import { FileArchive, Plus, RotateCcw, Diff, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  fetchPfsenseConfigBackups,
  createPfsenseConfigBackup,
  fetchPfsenseConfigDiff,
  restorePfsenseConfigBackup,
  fetchPfsenseAudit,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseConfigSnapshot, PfsenseConfigDiff } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ConfigTab() {
  const snapshotsFetcher = useCallback(() => fetchPfsenseConfigBackups(), []);
  const auditFetcher = useCallback(() => fetchPfsenseAudit(), []);
  const { data: snapshots, loading: snapshotsLoading, reload: reloadSnapshots } = useData(snapshotsFetcher);
  const { data: audit, loading: auditLoading } = useData(auditFetcher);

  const [creating, setCreating] = useState(false);
  const [diffData, setDiffData] = useState<PfsenseConfigDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PfsenseConfigSnapshot | null>(null);

  const handleCreateSnapshot = async () => {
    setCreating(true);
    try {
      await createPfsenseConfigBackup();
      toast.success("Config snapshot created");
      reloadSnapshots();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create snapshot");
    } finally {
      setCreating(false);
    }
  };

  const handleViewDiff = async (id: string) => {
    setDiffLoading(true);
    try {
      const diff = await fetchPfsenseConfigDiff(id);
      setDiffData(diff);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load diff");
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restorePfsenseConfigBackup(restoreTarget.id);
      toast.success("Config restored successfully");
      setRestoreTarget(null);
      reloadSnapshots();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to restore config");
    }
  };

  return (
    <div className="space-y-6">
      {/* Config Backups */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <FileArchive className="h-4 w-4 text-blue-400" />
            Config Backups
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleCreateSnapshot}
            disabled={creating}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {creating ? "Creating..." : "Create Snapshot"}
          </Button>
        </CardHeader>
        <CardContent>
          {snapshotsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshots ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                        No config backups
                      </td>
                    </tr>
                  ) : (
                    (snapshots ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-white">{new Date(s.timestamp).toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-400">{s.description ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-slate-400">{formatBytes(s.size_bytes)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:text-white"
                              onClick={() => handleViewDiff(s.id)}
                              disabled={diffLoading}
                            >
                              <Diff className="mr-1 h-3.5 w-3.5" />
                              Diff
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-amber-400 hover:text-amber-300"
                              onClick={() => setRestoreTarget(s)}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Restore
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <FileArchive className="h-4 w-4 text-blue-400" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                        No audit entries
                      </td>
                    </tr>
                  ) : (
                    (audit ?? []).map((a) => (
                      <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-300">{new Date(a.timestamp).toLocaleString()}</td>
                        <td className="px-3 py-2 font-medium text-white">{a.action}</td>
                        <td className="px-3 py-2 text-slate-400">{a.description}</td>
                        <td className="px-3 py-2">
                          {a.success ? (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
                              <XCircle className="mr-1 h-3 w-3" />
                              Failed
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diff Dialog */}
      <Dialog open={!!diffData} onOpenChange={(o) => !o && setDiffData(null)}>
        <DialogContent className="max-h-[80vh] border-slate-800 bg-slate-900 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Config Diff</DialogTitle>
          </DialogHeader>
          {diffData && (
            <div className="max-h-[60vh] overflow-auto">
              <pre className="rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
                {diffData.diff || "No differences found"}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirm */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Restore Config</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Restore config from {restoreTarget ? new Date(restoreTarget.timestamp).toLocaleString() : ""}?
              This will overwrite the current configuration and reload all services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={handleRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
