"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Key,
  Plus,
  RefreshCw,
  Settings,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOpenVpnOverview,
  updateOpenVpnServer,
  createOpenVpnClient,
  deleteOpenVpnClient,
  exportOpenVpnClientConfig,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  OpenVpnOverviewResponse,
  OpenVpnClient,
  VpnCertificate,
} from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

export default function OpenVpnPage() {
  const [data, setData] = useState<OpenVpnOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("server");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOpenVpnOverview();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageTransition>
      <div className="space-y-8">
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
                Server configuration, client management, and certificate overview.
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

        {!data?.mikrotik_available && !loading && (
          <Card className={surfaceClass}>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              MikroTik router is not configured. Go to Settings to configure router credentials.
            </CardContent>
          </Card>
        )}

        {(data?.mikrotik_available || loading) && (
          <>
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Server Status"
                value={data?.server ? (data.server.enabled ? "Enabled" : "Disabled") : null}
                loading={loading && !data}
                icon={<Settings className="h-4 w-4 text-orange-300" />}
                iconClass="border-orange-500/30 bg-orange-500/15"
                isText
              />
              <SummaryCard
                title="Clients"
                value={data ? data.clients.length : null}
                loading={loading && !data}
                icon={<Users className="h-4 w-4 text-cyan-300" />}
                iconClass="border-cyan-500/30 bg-cyan-500/15"
              />
              <SummaryCard
                title="Certificates"
                value={data ? data.certificates.length : null}
                loading={loading && !data}
                icon={<Key className="h-4 w-4 text-emerald-300" />}
                iconClass="border-emerald-500/30 bg-emerald-500/15"
              />
              <SummaryCard
                title="Protocol"
                value={data?.server?.protocol?.toUpperCase() ?? null}
                loading={loading && !data}
                icon={<Shield className="h-4 w-4 text-indigo-300" />}
                iconClass="border-indigo-500/30 bg-indigo-500/15"
                isText
              />
            </section>

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

              <TabsContent value="server" className="space-y-4 pt-2">
                <ServerConfigCard data={data} loading={loading} onSave={load} />
              </TabsContent>

              <TabsContent value="clients" className="space-y-4 pt-2">
                <ClientsCard clients={data?.clients ?? []} loading={loading} onRefresh={load} />
              </TabsContent>

              <TabsContent value="certificates" className="space-y-4 pt-2">
                <CertificatesCard certificates={data?.certificates ?? []} loading={loading} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </PageTransition>
  );
}

function SummaryCard({
  title,
  value,
  loading,
  icon,
  iconClass,
  isText,
}: {
  title: string;
  value: number | string | null;
  loading: boolean;
  icon: React.ReactNode;
  iconClass: string;
  isText?: boolean;
}) {
  return (
    <Card className={surfaceClass}>
      <CardContent className="flex min-h-[96px] items-center gap-5 p-4">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", iconClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-20 bg-slate-800" />
          ) : (
            <p className={cn("mt-1 font-semibold text-white", isText ? "text-base" : "text-2xl")}>
              {value ?? "—"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ServerConfigCard({
  data,
  loading,
  onSave,
}: {
  data: OpenVpnOverviewResponse | null;
  loading: boolean;
  onSave: () => void;
}) {
  const server = data?.server;
  const [saving, setSaving] = useState(false);
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("");
  const [cipher, setCipher] = useState("");
  const [auth, setAuth] = useState("");

  useEffect(() => {
    if (server) {
      setPort(server.port?.toString() ?? "1194");
      setProtocol(server.protocol ?? "tcp");
      setCipher(server.cipher ?? "aes256-cbc");
      setAuth(server.auth ?? "sha1");
    }
  }, [server]);

  const handleToggle = async () => {
    if (!server) return;
    setSaving(true);
    try {
      await updateOpenVpnServer({ enabled: !server.enabled });
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateOpenVpnServer({
        port: parseInt(port) || 1194,
        protocol,
        cipher,
        auth,
      });
      onSave();
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <Card className={surfaceClass}>
        <CardContent className="p-6">
          <Skeleton className="h-40 w-full bg-slate-800" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={surfaceClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-white">Server Configuration</CardTitle>
            <CardDescription className="text-sm text-slate-400">
              MikroTik OpenVPN server settings.
            </CardDescription>
          </div>
          {server && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              disabled={saving}
              className={cn(
                "border-slate-700 text-sm",
                server.enabled
                  ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "bg-slate-900/60 text-slate-400 hover:bg-slate-800",
              )}
            >
              {server.enabled ? "Enabled" : "Disabled"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {server ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-slate-400">Port</Label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Protocol</Label>
                <Input
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Cipher</Label>
                <Input
                  value={cipher}
                  onChange={(e) => setCipher(e.target.value)}
                  className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Auth</Label>
                <Input
                  value={auth}
                  onChange={(e) => setAuth(e.target.value)}
                  className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                />
              </div>
            </div>
            <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Certificate</p>
                <p className="mt-1 font-mono text-white">{server.certificate ?? "—"}</p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Mode</p>
                <p className="mt-1 text-white">{server.mode ?? "—"}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-cyan-600 text-white hover:bg-cyan-500"
              >
                Save Configuration
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            OpenVPN server is not configured on the router.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ClientsCard({
  clients,
  loading,
  onRefresh,
}: {
  clients: OpenVpnClient[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createOpenVpnClient({
        name: newName.trim(),
        password: newPassword || undefined,
        service: "ovpn",
      });
      setDialogOpen(false);
      setNewName("");
      setNewPassword("");
      onRefresh();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteOpenVpnClient(id);
      onRefresh();
    } catch {
      // Error handled by API layer
    }
  };

  const handleExport = async (name: string) => {
    try {
      const result = await exportOpenVpnClientConfig(name);
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Error handled by API layer
    }
  };

  return (
    <Card className={surfaceClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-white">VPN Clients</CardTitle>
            <CardDescription className="text-sm text-slate-400">
              PPP secrets configured for OpenVPN access.
            </CardDescription>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="border-slate-800 bg-slate-950">
              <DialogHeader>
                <DialogTitle className="text-white">Add OpenVPN Client</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Create a new PPP secret for OpenVPN access.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-xs text-slate-400">Username</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="vpn-user"
                    className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                    className="mt-1 border-slate-800 bg-slate-950/70 text-white"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  Create Client
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto border-t border-slate-800/70">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800/70 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Name</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Service</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Local IP</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Remote IP</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && clients.length === 0 ? (
                <TableRow className="border-slate-800/70">
                  <TableCell colSpan={6} className="py-9 text-center">
                    <Skeleton className="mx-auto h-6 w-40 bg-slate-800" />
                  </TableCell>
                </TableRow>
              ) : clients.length === 0 ? (
                <TableRow className="border-slate-800/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="py-9 text-center text-sm text-slate-500">
                    No OpenVPN clients configured.
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                  <TableRow
                    key={client.id ?? client.name}
                    className="border-slate-800/70 hover:bg-slate-800/35"
                  >
                    <TableCell className="font-medium text-white">
                      {client.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-400">
                      {client.service ?? "ovpn"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">
                      {client.local_address ?? "—"}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExport(client.name ?? "")}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-300"
                          title="Export .ovpn config"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {client.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-300"
                                title="Delete client"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-slate-800 bg-slate-950">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-white">Delete client?</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400">
                                  This will permanently delete the PPP secret for &quot;{client.name}&quot;.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-300">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(client.id!)}
                                  className="bg-rose-600 text-white hover:bg-rose-500"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
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
  );
}

function CertificatesCard({
  certificates,
  loading,
}: {
  certificates: VpnCertificate[];
  loading: boolean;
}) {
  return (
    <Card className={surfaceClass}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-white">Certificates</CardTitle>
        <CardDescription className="text-sm text-slate-400">
          PKI certificates available on the MikroTik router.
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
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Key Size</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Valid Until</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-slate-500">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && certificates.length === 0 ? (
                <TableRow className="border-slate-800/70">
                  <TableCell colSpan={6} className="py-9 text-center">
                    <Skeleton className="mx-auto h-6 w-40 bg-slate-800" />
                  </TableCell>
                </TableRow>
              ) : certificates.length === 0 ? (
                <TableRow className="border-slate-800/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="py-9 text-center text-sm text-slate-500">
                    No certificates found on the router.
                  </TableCell>
                </TableRow>
              ) : (
                certificates.map((cert) => (
                  <TableRow
                    key={cert.id ?? cert.name}
                    className="border-slate-800/70 hover:bg-slate-800/35"
                  >
                    <TableCell className="font-medium text-white">
                      {cert.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-400">
                      {cert.common_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {cert.ca && (
                          <Badge variant="outline" className="rounded-md border-amber-500/30 bg-amber-500/10 text-[11px] uppercase text-amber-300">
                            CA
                          </Badge>
                        )}
                        {cert.has_private_key && (
                          <Badge variant="outline" className="rounded-md border-cyan-500/30 bg-cyan-500/10 text-[11px] uppercase text-cyan-300">
                            Key
                          </Badge>
                        )}
                        {cert.trusted && (
                          <Badge variant="outline" className="rounded-md border-emerald-500/30 bg-emerald-500/10 text-[11px] uppercase text-emerald-300">
                            Trusted
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-400">
                      {cert.key_size ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-400">
                      {cert.invalid_after ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-md border text-[11px] uppercase",
                          cert.expired
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                        )}
                      >
                        {cert.expired ? "expired" : "valid"}
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
  );
}
