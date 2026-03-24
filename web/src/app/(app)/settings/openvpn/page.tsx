"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOvpnServer,
  updateOvpnServer,
  fetchOvpnClients,
  createOvpnClient,
  deleteOvpnClient,
  fetchOvpnCertificates,
  exportOvpnClientConfig,
} from "@/lib/api";
import type {
  OvpnServerConfig,
  OvpnClientAccount,
  MtCertificate,
} from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnSettingsPage() {
  const [server, setServer] = useState<OvpnServerConfig | null>(null);
  const [clients, setClients] = useState<OvpnClientAccount[]>([]);
  const [certs, setCerts] = useState<MtCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OvpnClientAccount | null>(
    null,
  );
  const [exporting, setExporting] = useState<string | null>(null);

  // Server config form state
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState("1194");
  const [protocol, setProtocol] = useState("tcp");
  const [cipher, setCipher] = useState("aes256-cbc");
  const [auth, setAuth] = useState("sha1");
  const [certificate, setCertificate] = useState("");
  const [requireClientCert, setRequireClientCert] = useState(false);

  // New client form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newComment, setNewComment] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  const load = useCallback(async () => {
    try {
      const [srv, cls, cts] = await Promise.all([
        fetchOvpnServer().catch(() => null),
        fetchOvpnClients().catch(() => []),
        fetchOvpnCertificates().catch(() => []),
      ]);
      if (srv) {
        setServer(srv);
        setEnabled(srv.enabled);
        setPort(String(srv.port ?? 1194));
        setProtocol(srv.protocol ?? "tcp");
        setCipher(srv.cipher ?? "aes256-cbc");
        setAuth(srv.auth ?? "sha1");
        setCertificate(srv.certificate ?? "");
        setRequireClientCert(srv.require_client_certificate);
      }
      setClients(cls);
      setCerts(cts);
    } catch {
      toast.error("Failed to load OpenVPN settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateOvpnServer({
        enabled,
        port: parseInt(port) || 1194,
        protocol,
        cipher,
        auth,
        certificate: certificate || null,
        require_client_certificate: requireClientCert,
      });
      toast.success("OpenVPN server configuration saved");
      load();
    } catch (e) {
      toast.error(
        `Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddClient() {
    if (!newName.trim()) return;
    setAddingClient(true);
    try {
      await createOvpnClient({
        name: newName.trim(),
        password: newPassword || undefined,
        service: "ovpn",
        comment: newComment || undefined,
      });
      toast.success(`Client "${newName}" created`);
      setShowAddClient(false);
      setNewName("");
      setNewPassword("");
      setNewComment("");
      load();
    } catch (e) {
      toast.error(
        `Failed to create client: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setAddingClient(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteOvpnClient(deleteTarget.id);
      toast.success(`Client "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(
        `Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  async function handleExport(name: string) {
    setExporting(name);
    try {
      const result = await exportOvpnClientConfig(name);
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.filename}`);
    } catch (e) {
      toast.error(
        `Failed to export: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 bg-slate-800" />
          <Skeleton className="h-64 w-full bg-slate-800" />
        </div>
      </PageTransition>
    );
  }

  if (!server) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Shield className="h-12 w-12 text-slate-600" />
          <h2 className="text-lg font-medium text-white">
            MikroTik Not Configured
          </h2>
          <p className="max-w-md text-center text-sm text-slate-400">
            Configure your MikroTik router in Settings to manage OpenVPN.
          </p>
          <Link href="/settings/router">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300"
            >
              Go to Router Settings
            </Button>
          </Link>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>

        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-yellow-500/10 text-orange-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                OpenVPN Server
              </h1>
              <p className="text-sm text-slate-400">
                Configure OpenVPN server on MikroTik, manage clients and export
                configs.
              </p>
            </div>
          </div>
        </section>

        {/* Server Configuration */}
        <Card className={surfaceClass}>
          <CardHeader>
            <CardTitle className="text-base text-white">
              Server Configuration
            </CardTitle>
            <CardDescription className="text-sm text-slate-400">
              OpenVPN server settings on the MikroTik router.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-200">Enable Server</Label>
                <p className="text-xs text-slate-500">
                  Enable the OpenVPN server on MikroTik
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Port</Label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white"
                  placeholder="1194"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Protocol</Label>
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Cipher</Label>
                <select
                  value={cipher}
                  onChange={(e) => setCipher(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="aes128-cbc">AES-128-CBC</option>
                  <option value="aes192-cbc">AES-192-CBC</option>
                  <option value="aes256-cbc">AES-256-CBC</option>
                  <option value="aes128-gcm">AES-128-GCM</option>
                  <option value="aes256-gcm">AES-256-GCM</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Auth Hash</Label>
                <select
                  value={auth}
                  onChange={(e) => setAuth(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="sha1">SHA1</option>
                  <option value="sha256">SHA256</option>
                  <option value="sha512">SHA512</option>
                  <option value="md5">MD5</option>
                </select>
              </div>
            </div>

            {certs.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">
                  Server Certificate
                </Label>
                <select
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a certificate</option>
                  {certs.map((c) => (
                    <option
                      key={c.id}
                      value={c.name ?? c.common_name ?? c.id}
                    >
                      {c.name ?? c.common_name ?? c.id}
                      {c.ca ? " (CA)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-200">
                  Require Client Certificate
                </Label>
                <p className="text-xs text-slate-500">
                  Require TLS client certificate authentication
                </p>
              </div>
              <Switch
                checked={requireClientCert}
                onCheckedChange={setRequireClientCert}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {saving && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save Configuration
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Client Accounts */}
        <Card className={surfaceClass}>
          <CardHeader>
            <div className="flex items-center justify-between">
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
                onClick={() => setShowAddClient(true)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Client
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-slate-800/70">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800/70 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Service
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Profile
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Remote Address
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.length === 0 ? (
                    <TableRow className="border-slate-800/70 hover:bg-transparent">
                      <TableCell
                        colSpan={6}
                        className="py-9 text-center text-sm text-slate-500"
                      >
                        No client accounts configured.
                      </TableCell>
                    </TableRow>
                  ) : (
                    clients.map((client) => (
                      <TableRow
                        key={client.id}
                        className="border-slate-800/70 hover:bg-slate-800/35"
                      >
                        <TableCell className="font-medium text-white">
                          {client.name}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {client.service ?? "any"}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {client.profile ?? "default"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">
                          {client.remote_address ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              client.disabled
                                ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            }
                          >
                            {client.disabled ? "disabled" : "enabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExport(client.name)}
                              disabled={exporting === client.name}
                              className="h-8 px-2 text-slate-400 hover:text-white"
                              title="Export .ovpn config"
                            >
                              {exporting === client.name ? (
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Certificates */}
        <Card className={surfaceClass}>
          <CardHeader>
            <CardTitle className="text-base text-white">
              Certificates ({certs.length})
            </CardTitle>
            <CardDescription className="text-sm text-slate-400">
              MikroTik PKI certificates available for VPN authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-slate-800/70">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800/70 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Common Name
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Type
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Valid Until
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.length === 0 ? (
                    <TableRow className="border-slate-800/70 hover:bg-transparent">
                      <TableCell
                        colSpan={5}
                        className="py-9 text-center text-sm text-slate-500"
                      >
                        No certificates found on the router.
                      </TableCell>
                    </TableRow>
                  ) : (
                    certs.map((cert) => (
                      <TableRow
                        key={cert.id}
                        className="border-slate-800/70 hover:bg-slate-800/35"
                      >
                        <TableCell className="font-medium text-white">
                          {cert.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {cert.common_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {cert.ca && (
                              <Badge
                                variant="outline"
                                className="border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-300"
                              >
                                CA
                              </Badge>
                            )}
                            {cert.has_private_key && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-300"
                              >
                                Key
                              </Badge>
                            )}
                            {cert.authority && (
                              <Badge
                                variant="outline"
                                className="border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-300"
                              >
                                Authority
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {cert.invalid_after ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              cert.expired
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                : cert.trusted
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-slate-700 bg-slate-900/70 text-slate-400"
                            }
                          >
                            {cert.expired
                              ? "expired"
                              : cert.trusted
                                ? "trusted"
                                : "untrusted"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Add Client Dialog */}
        <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
          <DialogContent className="border-slate-800 bg-slate-900 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Client Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Username</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white"
                  placeholder="vpn-user"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white"
                  placeholder="Enter password"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">
                  Comment (optional)
                </Label>
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="border-slate-800 bg-slate-950 text-white"
                  placeholder="VPN user description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddClient(false)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddClient}
                disabled={!newName.trim() || addingClient}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {addingClient && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
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
                Delete Client Account
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
                onClick={handleDelete}
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
