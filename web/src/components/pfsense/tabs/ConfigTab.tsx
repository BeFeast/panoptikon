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
      <Card className="">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <FileArchive className="h-4 w-4 text-mesh-primary" />
            Config Backups
          </CardTitle>
          <Button
            size="sm"
            className="bg-mesh-primary hover:bg-mesh-primary"
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
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-mesh-text-mute">
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshots ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-mesh-text-mute">
                        No config backups
                      </td>
                    </tr>
                  ) : (
                    (snapshots ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-mesh-border hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 text-white">{new Date(s.timestamp).toLocaleString()}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{s.description ?? "\u2014"}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{formatBytes(s.size_bytes)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-mesh-text-dim hover:text-white"
                              onClick={() => handleViewDiff(s.id)}
                              disabled={diffLoading}
                            >
                              <Diff className="mr-1 h-3.5 w-3.5" />
                              Diff
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[#fbbf24] hover:text-[#fbbf24]"
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
      <Card className="">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <FileArchive className="h-4 w-4 text-mesh-primary" />
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
                  <tr className="border-b border-mesh-border-strong text-left text-xs uppercase tracking-wider text-mesh-text-mute">
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-mesh-text-mute">
                        No audit entries
                      </td>
                    </tr>
                  ) : (
                    (audit ?? []).map((a) => (
                      <tr key={a.id} className="border-b border-mesh-border hover:bg-mesh-surface-2">
                        <td className="px-3 py-2 text-mesh-text">{new Date(a.timestamp).toLocaleString()}</td>
                        <td className="px-3 py-2 font-medium text-white">{a.action}</td>
                        <td className="px-3 py-2 text-mesh-text-dim">{a.description}</td>
                        <td className="px-3 py-2">
                          {a.success ? (
                            <Badge variant="outline" className="border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]">
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
        <DialogContent className="max-h-[80vh] border-mesh-border bg-mesh-surface-1 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Config Diff</DialogTitle>
          </DialogHeader>
          {diffData && (
            <div className="max-h-[60vh] overflow-auto">
              <pre className="rounded-lg bg-mesh-surface-1 p-4 text-xs leading-relaxed text-mesh-text">
                {diffData.diff || "No differences found"}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore Confirm */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent className="border-mesh-border bg-mesh-surface-1">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Restore Config</AlertDialogTitle>
            <AlertDialogDescription className="text-mesh-text-dim">
              Restore config from {restoreTarget ? new Date(restoreTarget.timestamp).toLocaleString() : ""}?
              This will overwrite the current configuration and reload all services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-mesh-border-strong text-mesh-text-dim">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-[#fbbf24] hover:bg-[#fbbf24]" onClick={handleRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
