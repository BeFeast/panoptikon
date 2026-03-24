"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Plus,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOvpnServer,
  fetchOvpnClients,
  createOvpnClient,
  deleteOvpnClient,
  exportOvpnClientConfig,
  fetchMtCertificates,
} from "@/lib/api";
import type {
  OvpnServerResponse,
  OvpnClientEntry,
  MtCertificateEntry,
} from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnSettingsPage() {
  const [server, setServer] = useState<OvpnServerResponse | null>(null);
  const [clients, setClients] = useState<OvpnClientEntry[]>([]);
  const [certificates, setCertificates] = useState<MtCertificateEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OvpnClientEntry | null>(null);
  const [exportingName, setExportingName] = useState<string | null>(null);

  // Add client form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [serverResult, clientsResult, certsResult] = await Promise.all([
        fetchOvpnServer(),
        fetchOvpnClients(),
        fetchMtCertificates(),
      ]);
      setServer(serverResult);
      setClients(clientsResult.clients);
      setCertificates(certsResult.certificates);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateClient() {
    if (!newName.trim() || !newPassword.trim()) return;
    setSubmitting(true);
    try {
      await createOvpnClient({
        name: newName.trim(),
        password: newPassword,
        comment: newComment.trim() || undefined,
      });
      toast.success(`Client "${newName}" created`);
      setAddDialogOpen(false);
      setNewName("");
      setNewPassword("");
      setNewComment("");
      loadData();
    } catch (e) {
      toast.error(
        `Failed to create client: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteClient() {
    if (!deleteTarget) return;
    try {
      await deleteOvpnClient(deleteTarget.id);
      toast.success(`Client "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      loadData();
    } catch (e) {
      toast.error(
        `Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  async function handleExport(name: string) {
    setExportingName(name);
    try {
      const result = await exportOvpnClientConfig(name);
      // Trigger a download
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Config exported as ${result.filename}`);
    } catch (e) {
      toast.error(
        `Failed to export: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setExportingName(null);
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageTransition>
    );
  }

  if (!server?.available) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Shield className="h-12 w-12 text-slate-600" />
          <h2 className="text-lg font-medium text-white">
            MikroTik Not Configured
          </h2>
          <p className="max-w-md text-center text-sm text-slate-400">
            Configure your MikroTik router connection in Settings &rarr; Router
            to manage OpenVPN.
          </p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-yellow-500/10 text-orange-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                OpenVPN Management
              </h1>
              <p className="text-sm text-slate-400">
                Server configuration, client accounts, and certificate management.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        {/* Server Status */}
        <Card className={surfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">Server Configuration</CardTitle>
            <CardDescription className="text-sm text-slate-400">
              OpenVPN server settings from MikroTik. Modify via the router admin interface.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Status</p>
                <Badge
                  variant="outline"
                  className={`mt-1 rounded-md border text-[11px] uppercase ${server.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}
                >
                  {server.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Port</p>
                <p className="mt-1 font-mono text-slate-200">{server.port ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Protocol</p>
                <p className="mt-1 text-slate-200">{server.protocol ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Mode</p>
                <p className="mt-1 text-slate-200">{server.mode ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Cipher</p>
                <p className="mt-1 font-mono text-slate-200">{server.cipher ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Certificate</p>
                <p className="mt-1 text-slate-200">{server.certificate ?? "None"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Accounts */}
        <Card className={surfaceClass}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base text-white">
                Client Accounts ({clients.length})
              </CardTitle>
              <CardDescription className="text-sm text-slate-400">
                PPP secrets used for OpenVPN authentication.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Client
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {clients.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No client accounts configured. Add one to get started.
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-slate-800/70">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/70 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Service</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Profile</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Remote Address</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id} className="border-slate-800/70 hover:bg-slate-800/35">
                        <TableCell className="font-medium text-white">{client.name}</TableCell>
                        <TableCell className="text-slate-400">{client.service ?? "any"}</TableCell>
                        <TableCell className="text-slate-400">{client.profile ?? "default"}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">{client.remote_address ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`rounded-md border text-[11px] uppercase ${client.disabled ? "border-slate-700 bg-slate-900/70 text-slate-500" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}
                          >
                            {client.disabled ? "disabled" : "active"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExport(client.name)}
                              disabled={exportingName === client.name}
                              className="h-8 px-2 text-slate-400 hover:text-white"
                              title="Export config"
                            >
                              {exportingName === client.name ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(client)}
                              className="h-8 px-2 text-slate-400 hover:text-rose-400"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Router Certificates */}
        <Card className={surfaceClass}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">
              Router Certificates ({certificates.length})
            </CardTitle>
            <CardDescription className="text-sm text-slate-400">
              Certificates from MikroTik certificate store. Used for VPN and SSL.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {certificates.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No certificates found on the router.
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-slate-800/70">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800/70 hover:bg-transparent">
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Common Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Type</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Valid Until</TableHead>
                      <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => (
                      <TableRow key={cert.id} className="border-slate-800/70 hover:bg-slate-800/35">
                        <TableCell className="font-medium text-white">{cert.name}</TableCell>
                        <TableCell className="text-slate-400">{cert.common_name ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {cert.ca && (
                              <Badge variant="outline" className="rounded-md border-blue-500/30 bg-blue-500/10 text-[11px] text-blue-300">
                                CA
                              </Badge>
                            )}
                            {cert.has_private_key && (
                              <Badge variant="outline" className="rounded-md border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300">
                                Key
                              </Badge>
                            )}
                            {cert.trusted && (
                              <Badge variant="outline" className="rounded-md border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-300">
                                Trusted
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-400">{cert.invalid_after ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`rounded-md border text-[11px] uppercase ${cert.expired ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}
                          >
                            {cert.expired ? "expired" : "valid"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Client Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="border-slate-800 bg-slate-900 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add OpenVPN Client</DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a new PPP secret for OpenVPN authentication.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="client-name" className="text-xs text-slate-400">
                  Username
                </Label>
                <Input
                  id="client-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="vpn-user-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-password" className="text-xs text-slate-400">
                  Password
                </Label>
                <Input
                  id="client-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="Secure password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-comment" className="text-xs text-slate-400">
                  Comment (optional)
                </Label>
                <Input
                  id="client-comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                  placeholder="Description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateClient}
                disabled={!newName.trim() || !newPassword.trim() || submitting}
                className="bg-cyan-600 text-white hover:bg-cyan-500"
              >
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Create Client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Client
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to delete &ldquo;{deleteTarget?.name}
                &rdquo;? This will revoke their VPN access.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteClient}
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
