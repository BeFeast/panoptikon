"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  Users,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
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
  AlertDialogTrigger,
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchOvpnServer,
  updateOvpnServer,
  fetchOvpnClients,
  createOvpnClient,
  deleteOvpnClient,
  fetchCertificates,
} from "@/lib/api";
import type {
  OvpnServerResponse,
  OvpnClientResponse,
  CertificateResponse,
} from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnPage() {
  const [server, setServer] = useState<OvpnServerResponse | null>(null);
  const [clients, setClients] = useState<OvpnClientResponse[]>([]);
  const [certificates, setCertificates] = useState<CertificateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("server");

  // Server form state
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState("1194");
  const [protocol, setProtocol] = useState("tcp");
  const [cipher, setCipher] = useState("aes256-cbc");
  const [auth, setAuth] = useState("sha1");
  const [certificate, setCertificate] = useState("");
  const [requireClientCert, setRequireClientCert] = useState(false);

  // New client dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [newClientComment, setNewClientComment] = useState("");
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [srv, cls, certs] = await Promise.all([
        fetchOvpnServer().catch(() => null),
        fetchOvpnClients().catch(() => []),
        fetchCertificates().catch(() => []),
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
      setCertificates(certs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveServer = async () => {
    setSaving(true);
    try {
      await updateOvpnServer({
        enabled,
        port: parseInt(port, 10),
        protocol,
        cipher,
        auth,
        certificate: certificate || undefined,
        require_client_certificate: requireClientCert,
      });
      toast.success("OpenVPN server configuration saved.");
      await loadAll();
    } catch (e) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim() || !newClientPassword.trim()) return;
    setCreating(true);
    try {
      await createOvpnClient({
        name: newClientName.trim(),
        password: newClientPassword.trim(),
        comment: newClientComment.trim() || undefined,
      });
      toast.success(`Client "${newClientName}" created.`);
      setDialogOpen(false);
      setNewClientName("");
      setNewClientPassword("");
      setNewClientComment("");
      await loadAll();
    } catch (e) {
      toast.error(`Failed to create client: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    try {
      await deleteOvpnClient(id);
      toast.success(`Client "${name}" deleted.`);
      await loadAll();
    } catch (e) {
      toast.error(`Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const handleExport = (name: string) => {
    const url = `/api/v1/openvpn/clients/${encodeURIComponent(name)}/export`;
    window.open(url, "_blank");
  };

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
              <h1 className="text-2xl font-semibold tracking-tight text-white">OpenVPN</h1>
              <p className="text-sm text-slate-400">
                Server configuration, client management, and certificate PKI.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        {/* Summary Cards */}
        <section className="grid gap-5 sm:grid-cols-3">
          <Card className={surfaceClass}>
            <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/15">
                <Server className="h-4 w-4 text-orange-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Server</p>
                {loading ? (
                  <Skeleton className="mt-2 h-6 w-20 bg-slate-800" />
                ) : (
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1 rounded-md border text-xs",
                      server?.enabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-700 bg-slate-900/70 text-slate-500",
                    )}
                  >
                    {server?.available ? (server.enabled ? "Enabled" : "Disabled") : "Unavailable"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className={surfaceClass}>
            <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/15">
                <Users className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Clients</p>
                {loading ? (
                  <Skeleton className="mt-2 h-6 w-20 bg-slate-800" />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-white">{clients.length}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className={surfaceClass}>
            <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15">
                <Shield className="h-4 w-4 text-indigo-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Certificates</p>
                {loading ? (
                  <Skeleton className="mt-2 h-6 w-20 bg-slate-800" />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-white">{certificates.length}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto rounded-xl border border-slate-800/80 bg-slate-900/70 p-1">
            <TabsTrigger
              value="server"
              className="rounded-lg px-4 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              Server Config
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

          {/* Server Config Tab */}
          <TabsContent value="server" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">OpenVPN Server Configuration</CardTitle>
                <CardDescription className="text-sm text-slate-400">
                  Configure the OpenVPN server on your MikroTik router.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!server?.available && !loading ? (
                  <p className="text-sm text-slate-400">
                    MikroTik router is not configured or not reachable. Configure router credentials in Settings.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={enabled}
                        onCheckedChange={setEnabled}
                        id="ovpn-enabled"
                      />
                      <Label htmlFor="ovpn-enabled" className="text-sm text-slate-200">
                        Enable OpenVPN Server
                      </Label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-400">Port</Label>
                        <Input
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                          className="border-slate-800 bg-slate-950/70 text-white"
                          type="number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-400">Protocol</Label>
                        <Select value={protocol} onValueChange={setProtocol}>
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
                        <Label className="text-xs text-slate-400">Cipher</Label>
                        <Select value={cipher} onValueChange={setCipher}>
                          <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aes256-cbc">AES-256-CBC</SelectItem>
                            <SelectItem value="aes128-cbc">AES-128-CBC</SelectItem>
                            <SelectItem value="aes256-gcm">AES-256-GCM</SelectItem>
                            <SelectItem value="aes128-gcm">AES-128-GCM</SelectItem>
                            <SelectItem value="blowfish128">Blowfish-128</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-400">Auth Digest</Label>
                        <Select value={auth} onValueChange={setAuth}>
                          <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sha1">SHA1</SelectItem>
                            <SelectItem value="sha256">SHA256</SelectItem>
                            <SelectItem value="md5">MD5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-400">Certificate</Label>
                        <Select value={certificate} onValueChange={setCertificate}>
                          <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                            <SelectValue placeholder="Select certificate..." />
                          </SelectTrigger>
                          <SelectContent>
                            {certificates.map((c) => (
                              <SelectItem key={c.id} value={c.name ?? c.id}>
                                {c.name ?? c.common_name ?? c.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Switch
                        checked={requireClientCert}
                        onCheckedChange={setRequireClientCert}
                        id="ovpn-require-client-cert"
                      />
                      <Label htmlFor="ovpn-require-client-cert" className="text-sm text-slate-200">
                        Require Client Certificate
                      </Label>
                    </div>

                    <Button
                      onClick={handleSaveServer}
                      disabled={saving || loading}
                      className="bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      {saving ? "Saving..." : "Save Configuration"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">
                VPN Client Credentials (PPP Secrets)
              </h2>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-700">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-slate-800 bg-slate-950">
                  <DialogHeader>
                    <DialogTitle className="text-white">Add OpenVPN Client</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Create a new PPP secret for OpenVPN authentication.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-400">Username</Label>
                      <Input
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        className="border-slate-800 bg-slate-900/70 text-white"
                        placeholder="client-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-400">Password</Label>
                      <Input
                        type="password"
                        value={newClientPassword}
                        onChange={(e) => setNewClientPassword(e.target.value)}
                        className="border-slate-800 bg-slate-900/70 text-white"
                        placeholder="Strong password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-400">Comment (optional)</Label>
                      <Input
                        value={newClientComment}
                        onChange={(e) => setNewClientComment(e.target.value)}
                        className="border-slate-800 bg-slate-900/70 text-white"
                        placeholder="e.g. John's laptop"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={handleCreateClient}
                      disabled={creating || !newClientName.trim() || !newClientPassword.trim()}
                      className="bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      {creating ? "Creating..." : "Create Client"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className={surfaceClass}>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Service</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Profile</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Remote IP</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Comment</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell colSpan={7} className="py-9 text-center text-sm text-slate-500">
                            No OpenVPN clients configured.
                          </TableCell>
                        </TableRow>
                      ) : (
                        clients.map((c) => (
                          <TableRow key={c.id} className="border-slate-800/70 hover:bg-slate-800/35">
                            <TableCell className="font-medium text-white">{c.name}</TableCell>
                            <TableCell className="text-slate-400">{c.service ?? "any"}</TableCell>
                            <TableCell className="text-slate-400">{c.profile ?? "default"}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">{c.remote_address ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  c.disabled
                                    ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                                )}
                              >
                                {c.disabled ? "disabled" : "active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-slate-500">{c.comment ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-300"
                                  title="Export .ovpn config"
                                  onClick={() => handleExport(c.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                                      title="Delete client"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="border-slate-800 bg-slate-950">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-white">Delete Client</AlertDialogTitle>
                                      <AlertDialogDescription className="text-slate-400">
                                        Are you sure you want to delete &quot;{c.name}&quot;? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200">Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteClient(c.id, c.name)}
                                        className="bg-rose-600 text-white hover:bg-rose-700"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
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

          {/* Certificates Tab */}
          <TabsContent value="certificates" className="space-y-4 pt-2">
            <Card className={surfaceClass}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">System Certificates</CardTitle>
                <CardDescription className="text-sm text-slate-400">
                  Certificates from the MikroTik PKI store. Used for OpenVPN server and client authentication.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-slate-800/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Common Name</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Type</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Key</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Expires</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">Trusted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell colSpan={6} className="py-9 text-center text-sm text-slate-500">
                            No certificates found on the router.
                          </TableCell>
                        </TableRow>
                      ) : (
                        certificates.map((cert) => (
                          <TableRow key={cert.id} className="border-slate-800/70 hover:bg-slate-800/35">
                            <TableCell className="font-medium text-white">{cert.name ?? "—"}</TableCell>
                            <TableCell className="text-slate-400">{cert.common_name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  cert.ca
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                    : "border-slate-700 bg-slate-900/70 text-slate-400",
                                )}
                              >
                                {cert.ca ? "CA" : "Leaf"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {cert.key_type ?? "—"}{cert.key_size ? ` ${cert.key_size}` : ""}
                            </TableCell>
                            <TableCell className="text-slate-400">{cert.expires_after ?? "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md border text-[11px] uppercase",
                                  cert.trusted
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-slate-700 bg-slate-900/70 text-slate-500",
                                )}
                              >
                                {cert.trusted ? "Yes" : "No"}
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
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
