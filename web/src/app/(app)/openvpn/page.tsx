"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOvpnServer,
  updateOvpnServer,
  fetchOvpnClients,
  createOvpnClient,
  deleteOvpnClient,
  fetchOvpnCertificates,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  OvpnServerResponse,
  OvpnClient,
  OvpnCertificate,
} from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnPage() {
  const [server, setServer] = useState<OvpnServerResponse | null>(null);
  const [clients, setClients] = useState<OvpnClient[]>([]);
  const [certs, setCerts] = useState<OvpnCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useHashTab("server", [
    "server",
    "clients",
    "certificates",
  ]);

  // New client form
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newComment, setNewComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [srv, cli, cer] = await Promise.all([
        fetchOvpnServer(),
        fetchOvpnClients(),
        fetchOvpnCertificates(),
      ]);
      setServer(srv);
      setClients(cli.clients);
      setCerts(cer.certificates);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.comment ?? "").toLowerCase().includes(q) ||
        (c.service ?? "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  const filteredCerts = useMemo(() => {
    if (!search.trim()) return certs;
    const q = search.toLowerCase();
    return certs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.common_name ?? "").toLowerCase().includes(q) ||
        (c.issuer ?? "").toLowerCase().includes(q),
    );
  }, [certs, search]);

  async function handleToggleServer() {
    if (!server) return;
    setSaving(true);
    try {
      await updateOvpnServer({ enabled: !server.enabled });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateClient() {
    if (!newName.trim() || !newPassword.trim()) return;
    setSaving(true);
    try {
      await createOvpnClient({
        name: newName.trim(),
        password: newPassword.trim(),
        comment: newComment.trim() || undefined,
      });
      setNewClientOpen(false);
      setNewName("");
      setNewPassword("");
      setNewComment("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(id: string) {
    await deleteOvpnClient(id);
    await load();
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-red-500/10 text-amber-300">
              <KeyRound className="h-6 w-6" />
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

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </section>

        {!server?.available && !loading && (
          <Card className={surfaceClass}>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              MikroTik router is not configured. Configure router credentials in
              Settings → Router to manage OpenVPN.
            </CardContent>
          </Card>
        )}

        {(server?.available || loading) && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
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

            {/* ── Server Tab ── */}
            <TabsContent value="server" className="space-y-4 pt-2">
              <Card className={surfaceClass}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white">
                    OpenVPN Server Configuration
                  </CardTitle>
                  <CardDescription className="text-sm text-slate-400">
                    Configure the OpenVPN server on your MikroTik router.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {loading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-full bg-slate-800" />
                      <Skeleton className="h-10 w-full bg-slate-800" />
                    </div>
                  ) : server ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/50 p-4">
                        <div>
                          <p className="text-sm font-medium text-white">
                            Server Enabled
                          </p>
                          <p className="text-xs text-slate-400">
                            Enable or disable the OpenVPN server on MikroTik.
                          </p>
                        </div>
                        <Switch
                          checked={server.enabled}
                          onCheckedChange={handleToggleServer}
                          disabled={saving}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <InfoField label="Port" value={server.port?.toString() ?? "—"} />
                        <InfoField label="Protocol" value={server.protocol ?? "—"} />
                        <InfoField label="Cipher" value={server.cipher ?? "—"} />
                        <InfoField label="Auth" value={server.auth ?? "—"} />
                        <InfoField label="Certificate" value={server.certificate ?? "—"} />
                        <InfoField label="Default Profile" value={server.default_profile ?? "—"} />
                        <InfoField
                          label="Require Client Certificate"
                          value={server.require_client_certificate ? "Yes" : "No"}
                        />
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Clients Tab ── */}
            <TabsContent value="clients" className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Filter clients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border-slate-800 bg-slate-950/70 pl-10 text-white placeholder:text-slate-600"
                  />
                </div>

                <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
                      variant="outline"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Client
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-slate-800 bg-slate-950">
                    <DialogHeader>
                      <DialogTitle className="text-white">
                        Add OpenVPN Client
                      </DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Create a new PPP secret for OpenVPN authentication.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="client-name" className="text-slate-300">
                          Username
                        </Label>
                        <Input
                          id="client-name"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="border-slate-800 bg-slate-900 text-white"
                          placeholder="vpn-user"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-password" className="text-slate-300">
                          Password
                        </Label>
                        <Input
                          id="client-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="border-slate-800 bg-slate-900 text-white"
                          placeholder="Secure password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client-comment" className="text-slate-300">
                          Comment (optional)
                        </Label>
                        <Input
                          id="client-comment"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          className="border-slate-800 bg-slate-900 text-white"
                          placeholder="e.g. John's laptop"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleCreateClient}
                        disabled={saving || !newName.trim() || !newPassword.trim()}
                        className="bg-cyan-600 text-white hover:bg-cyan-700"
                      >
                        Create Client
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
                        {loading ? (
                          <TableRow className="border-slate-800/70">
                            <TableCell colSpan={6}>
                              <Skeleton className="h-8 w-full bg-slate-800" />
                            </TableCell>
                          </TableRow>
                        ) : filteredClients.length === 0 ? (
                          <TableRow className="border-slate-800/70 hover:bg-transparent">
                            <TableCell
                              colSpan={6}
                              className="py-9 text-center text-sm text-slate-500"
                            >
                              {search
                                ? "No clients match your filter."
                                : "No PPP secrets configured."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredClients.map((client) => (
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
                                  className={cn(
                                    "rounded-md border text-[11px] uppercase",
                                    client.disabled
                                      ? "border-slate-700 bg-slate-900/70 text-slate-500"
                                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                                  )}
                                >
                                  {client.disabled ? "disabled" : "active"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <a
                                    href={`/api/v1/openvpn/clients/${encodeURIComponent(client.name)}/export`}
                                    download
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                                      title="Export .ovpn config"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                                        title="Delete client"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="border-slate-800 bg-slate-950">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle className="text-white">
                                          Delete Client
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-400">
                                          Remove PPP secret &quot;{client.name}&quot;? This
                                          will disconnect any active session.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-300">
                                          Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeleteClient(client.id)}
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

            {/* ── Certificates Tab ── */}
            <TabsContent value="certificates" className="space-y-4 pt-2">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Filter certificates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border-slate-800 bg-slate-950/70 pl-10 text-white placeholder:text-slate-600"
                />
              </div>

              <Card className={surfaceClass}>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
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
                            Issuer
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                            Type
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                            Key Size
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                            Expires
                          </TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                            Trusted
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow className="border-slate-800/70">
                            <TableCell colSpan={7}>
                              <Skeleton className="h-8 w-full bg-slate-800" />
                            </TableCell>
                          </TableRow>
                        ) : filteredCerts.length === 0 ? (
                          <TableRow className="border-slate-800/70 hover:bg-transparent">
                            <TableCell
                              colSpan={7}
                              className="py-9 text-center text-sm text-slate-500"
                            >
                              {search
                                ? "No certificates match your filter."
                                : "No certificates found on the router."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCerts.map((cert) => (
                            <TableRow
                              key={cert.id}
                              className="border-slate-800/70 hover:bg-slate-800/35"
                            >
                              <TableCell className="font-medium text-white">
                                {cert.name}
                              </TableCell>
                              <TableCell className="text-slate-400">
                                {cert.common_name ?? "—"}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-slate-400">
                                {cert.issuer ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "rounded-md border text-[11px] uppercase",
                                    cert.ca
                                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : "border-slate-700 bg-slate-900/60 text-slate-400",
                                  )}
                                >
                                  {cert.ca ? "CA" : "leaf"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-400">
                                {cert.key_size ?? "—"}
                              </TableCell>
                              <TableCell className="text-slate-400">
                                {cert.expires_after ?? cert.invalid_after ?? "—"}
                              </TableCell>
                              <TableCell>
                                {cert.trusted ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <span className="text-xs text-slate-600">—</span>
                                )}
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
        )}
      </div>
    </PageTransition>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-200">{value}</p>
    </div>
  );
}
