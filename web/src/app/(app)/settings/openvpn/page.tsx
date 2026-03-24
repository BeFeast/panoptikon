"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Shield,
  Trash2,
  Users,
  Key,
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
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOvpnServer,
  updateOvpnServer,
  fetchOvpnClients,
  createOvpnClient,
  deleteOvpnClient,
  fetchOvpnCertificates,
  deleteOvpnCertificate,
} from "@/lib/api";
import type {
  OvpnServerConfig,
  PppSecret,
  MikrotikCertificate,
} from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnSettingsPage() {
  const [server, setServer] = useState<OvpnServerConfig | null>(null);
  const [clients, setClients] = useState<PppSecret[]>([]);
  const [certs, setCerts] = useState<MikrotikCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "client" | "cert";
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [srv, cls, cts] = await Promise.allSettled([
        fetchOvpnServer(),
        fetchOvpnClients(),
        fetchOvpnCertificates(),
      ]);
      if (srv.status === "fulfilled") setServer(srv.value);
      else setError("MikroTik not available or OpenVPN not supported");
      if (cls.status === "fulfilled") setClients(cls.value);
      if (cts.status === "fulfilled") setCerts(cts.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleServer(enabled: boolean) {
    setSaving(true);
    try {
      await updateOvpnServer({ enabled });
      setServer((s) => (s ? { ...s, enabled } : s));
      toast.success(`OpenVPN server ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update OpenVPN server");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveServer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!server) return;
    setSaving(true);
    try {
      await updateOvpnServer({
        port: server.port,
        protocol: server.protocol,
        cipher: server.cipher,
        auth: server.auth,
        certificate: server.certificate,
        require_client_certificate: server.require_client_certificate,
      });
      toast.success("OpenVPN server settings saved");
    } catch {
      toast.error("Failed to save OpenVPN server settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateClient(data: {
    name: string;
    password: string;
    service: string;
    comment: string;
  }) {
    try {
      await createOvpnClient({
        name: data.name,
        password: data.password || undefined,
        service: data.service || "ovpn",
        comment: data.comment || undefined,
      });
      toast.success(`Client "${data.name}" created`);
      setShowAddClient(false);
      load();
    } catch {
      toast.error("Failed to create client");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "client") {
        await deleteOvpnClient(deleteTarget.id);
        toast.success(`Client "${deleteTarget.name}" deleted`);
      } else {
        await deleteOvpnCertificate(deleteTarget.id);
        toast.success(`Certificate "${deleteTarget.name}" deleted`);
      }
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(`Failed to delete ${deleteTarget.type}`);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Link href="/settings">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-cyan-500/10 text-indigo-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                OpenVPN
              </h1>
              <p className="text-sm text-slate-400">
                Server configuration, client management, and certificates.
              </p>
            </div>
          </div>
        </section>

        {error && !loading && (
          <Card className={surfaceClass}>
            <CardContent className="py-8 text-center text-sm text-slate-400">
              {error}. Configure MikroTik credentials in{" "}
              <Link href="/settings/router" className="text-cyan-400 underline">
                Router Settings
              </Link>
              .
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full bg-slate-800/50" />
            <Skeleton className="h-48 w-full bg-slate-800/50" />
          </div>
        ) : (
          !error && (
            <Tabs defaultValue="server">
              <TabsList className="h-auto rounded-xl border border-slate-800/80 bg-slate-900/70 p-1">
                <TabsTrigger
                  value="server"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  Server
                </TabsTrigger>
                <TabsTrigger
                  value="clients"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  Clients
                </TabsTrigger>
                <TabsTrigger
                  value="certificates"
                  className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                >
                  Certificates
                </TabsTrigger>
              </TabsList>

              {/* Server Configuration */}
              <TabsContent value="server" className="space-y-4 pt-2">
                {server && (
                  <Card className={surfaceClass}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base text-white">
                            Server Configuration
                          </CardTitle>
                          <CardDescription className="text-sm text-slate-400">
                            Configure the MikroTik OpenVPN server instance.
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label
                            htmlFor="ovpn-enabled"
                            className="text-sm text-slate-400"
                          >
                            Enabled
                          </Label>
                          <Switch
                            id="ovpn-enabled"
                            checked={server.enabled}
                            onCheckedChange={handleToggleServer}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSaveServer} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-slate-300">Port</Label>
                            <Input
                              type="number"
                              value={server.port}
                              onChange={(e) =>
                                setServer({
                                  ...server,
                                  port: parseInt(e.target.value) || 1194,
                                })
                              }
                              className="border-slate-800 bg-slate-950/70 text-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-300">Protocol</Label>
                            <Select
                              value={server.protocol}
                              onValueChange={(v) =>
                                setServer({ ...server, protocol: v })
                              }
                            >
                              <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tcp">TCP</SelectItem>
                                <SelectItem value="udp">UDP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-300">Cipher</Label>
                            <Select
                              value={server.cipher}
                              onValueChange={(v) =>
                                setServer({ ...server, cipher: v })
                              }
                            >
                              <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="aes256-cbc">
                                  AES-256-CBC
                                </SelectItem>
                                <SelectItem value="aes128-cbc">
                                  AES-128-CBC
                                </SelectItem>
                                <SelectItem value="blowfish128">
                                  Blowfish-128
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-300">Auth</Label>
                            <Select
                              value={server.auth}
                              onValueChange={(v) =>
                                setServer({ ...server, auth: v })
                              }
                            >
                              <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sha1">SHA-1</SelectItem>
                                <SelectItem value="sha256">SHA-256</SelectItem>
                                <SelectItem value="md5">MD5</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-300">
                              Certificate
                            </Label>
                            <Input
                              value={server.certificate}
                              onChange={(e) =>
                                setServer({
                                  ...server,
                                  certificate: e.target.value,
                                })
                              }
                              placeholder="server-cert"
                              className="border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-600"
                            />
                          </div>
                          <div className="flex items-end gap-3 pb-1">
                            <div className="flex items-center gap-2">
                              <Switch
                                id="require-client-cert"
                                checked={server.require_client_certificate}
                                onCheckedChange={(v) =>
                                  setServer({
                                    ...server,
                                    require_client_certificate: v,
                                  })
                                }
                              />
                              <Label
                                htmlFor="require-client-cert"
                                className="text-sm text-slate-300"
                              >
                                Require client certificate
                              </Label>
                            </div>
                          </div>
                        </div>
                        <Button
                          type="submit"
                          disabled={saving}
                          className="bg-cyan-600 hover:bg-cyan-700"
                        >
                          {saving && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Save Configuration
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Clients */}
              <TabsContent value="clients" className="space-y-4 pt-2">
                <Card className={surfaceClass}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base text-white">
                          <Users className="h-4 w-4 text-indigo-300" />
                          VPN Clients (PPP Secrets)
                        </CardTitle>
                        <CardDescription className="text-sm text-slate-400">
                          Manage user accounts for OpenVPN connections.
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setShowAddClient(true)}
                        className="bg-cyan-600 hover:bg-cyan-700"
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
                              Local IP
                            </TableHead>
                            <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                              Remote IP
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
                                colSpan={7}
                                className="py-9 text-center text-sm text-slate-500"
                              >
                                No VPN clients configured.
                              </TableCell>
                            </TableRow>
                          ) : (
                            clients.map((c) => (
                              <TableRow
                                key={c.id}
                                className="border-slate-800/70 hover:bg-slate-800/35"
                              >
                                <TableCell className="font-medium text-white">
                                  {c.name}
                                </TableCell>
                                <TableCell className="text-slate-400">
                                  {c.service}
                                </TableCell>
                                <TableCell className="text-slate-400">
                                  {c.profile}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-400">
                                  {c.local_address || "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-slate-400">
                                  {c.remote_address || "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      c.disabled
                                        ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    }
                                  >
                                    {c.disabled ? "disabled" : "active"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <a
                                      href={`/api/v1/openvpn/export/${encodeURIComponent(c.name)}`}
                                      download
                                    >
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-slate-400 hover:text-white"
                                        title="Export .ovpn config"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </a>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-400 hover:text-rose-400"
                                      onClick={() =>
                                        setDeleteTarget({
                                          type: "client",
                                          id: c.id,
                                          name: c.name,
                                        })
                                      }
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
              </TabsContent>

              {/* Certificates */}
              <TabsContent value="certificates" className="space-y-4 pt-2">
                <Card className={surfaceClass}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-white">
                      <Key className="h-4 w-4 text-amber-300" />
                      Router Certificates
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-400">
                      Certificates installed on the MikroTik router for VPN
                      authentication.
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
                              Status
                            </TableHead>
                            <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                              Expires
                            </TableHead>
                            <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {certs.length === 0 ? (
                            <TableRow className="border-slate-800/70 hover:bg-transparent">
                              <TableCell
                                colSpan={6}
                                className="py-9 text-center text-sm text-slate-500"
                              >
                                No certificates found on the router.
                              </TableCell>
                            </TableRow>
                          ) : (
                            certs.map((c) => (
                              <TableRow
                                key={c.id}
                                className="border-slate-800/70 hover:bg-slate-800/35"
                              >
                                <TableCell className="font-medium text-white">
                                  {c.name}
                                </TableCell>
                                <TableCell className="text-slate-400">
                                  {c.common_name}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    {c.ca && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      >
                                        CA
                                      </Badge>
                                    )}
                                    {c.has_private_key && (
                                      <Badge
                                        variant="outline"
                                        className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                                      >
                                        Key
                                      </Badge>
                                    )}
                                    {c.trusted && (
                                      <Badge
                                        variant="outline"
                                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                      >
                                        Trusted
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={
                                      c.expired
                                        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    }
                                  >
                                    {c.expired ? "expired" : "valid"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-slate-400">
                                  {c.invalid_after || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-rose-400"
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: "cert",
                                        id: c.id,
                                        name: c.name,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )
        )}

        {/* Add Client Dialog */}
        <AddClientDialog
          open={showAddClient}
          onClose={() => setShowAddClient(false)}
          onSubmit={handleCreateClient}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete {deleteTarget?.type === "cert" ? "Certificate" : "Client"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deleteTarget?.name}
                &rdquo;? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-rose-600 hover:bg-rose-700"
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

function AddClientDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    password: string;
    service: string;
    comment: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [service, setService] = useState("ovpn");
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), password, service, comment });
    setName("");
    setPassword("");
    setService("ovpn");
    setComment("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-900">
        <DialogHeader>
          <DialogTitle className="text-white">Add VPN Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Username</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vpn-user"
              required
              className="border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-600"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Client password"
              className="border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-600"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Service</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ovpn">OpenVPN</SelectItem>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="l2tp">L2TP</SelectItem>
                <SelectItem value="pptp">PPTP</SelectItem>
                <SelectItem value="sstp">SSTP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Comment</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional description"
              className="border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-600"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700">
              Create Client
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
