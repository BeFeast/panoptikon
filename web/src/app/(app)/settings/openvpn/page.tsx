"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Download,
  Lock,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import {
  fetchOvpnOverview,
  updateOvpnServer,
  createOvpnClient,
  deleteOvpnClient,
  ovpnExportUrl,
} from "@/lib/api";
import type { OvpnOverview } from "@/lib/types";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

export default function OpenVpnSettingsPage() {
  const [overview, setOverview] = useState<OvpnOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server config form
  const [port, setPort] = useState("");
  const [protocol, setProtocol] = useState("");
  const [cipher, setCipher] = useState("");
  const [auth, setAuth] = useState("");
  const [saveStatus, setSaveStatus] = useState<Status>("idle");

  // Create client dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newComment, setNewComment] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOvpnOverview();
      setOverview(data);
      setPort(data.server.port?.toString() ?? "1194");
      setProtocol(data.server.protocol ?? "tcp");
      setCipher(data.server.cipher ?? "aes256-cbc");
      setAuth(data.server.auth ?? "sha1");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load OpenVPN configuration",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveServer() {
    setSaveStatus("loading");
    try {
      await updateOvpnServer({
        port: port ? parseInt(port, 10) : undefined,
        protocol: protocol || undefined,
        cipher: cipher || undefined,
        auth: auth || undefined,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
      loadData();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  async function handleCreateClient() {
    if (!newName.trim() || !newPassword.trim()) return;
    setCreateLoading(true);
    try {
      await createOvpnClient({
        name: newName.trim(),
        password: newPassword.trim(),
        comment: newComment.trim() || undefined,
      });
      setShowCreate(false);
      setNewName("");
      setNewPassword("");
      setNewComment("");
      loadData();
    } catch {
      // Error handling
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeleteClient(id: string) {
    try {
      await deleteOvpnClient(id);
      loadData();
    } catch {
      // Error handling
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              OpenVPN Settings
            </h1>
            <p className="text-sm text-slate-400">
              Manage OpenVPN server configuration and client accounts on
              MikroTik.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Server Configuration */}
        <SettingsSection
          icon={<Server className="h-4 w-4 text-indigo-400" />}
          iconBg="bg-indigo-500/10"
          title="Server Configuration"
          description="OpenVPN server settings on your MikroTik router."
          headerRight={
            <SaveButton
              status={saveStatus}
              disabled={loading}
              onClick={handleSaveServer}
            />
          }
        >
          {loading ? (
            <div className="h-20 animate-pulse rounded-lg bg-slate-800/50" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Port</Label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="1194"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Protocol</Label>
                <Input
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  placeholder="tcp"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Cipher</Label>
                <Input
                  value={cipher}
                  onChange={(e) => setCipher(e.target.value)}
                  placeholder="aes256-cbc"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Auth Hash</Label>
                <Input
                  value={auth}
                  onChange={(e) => setAuth(e.target.value)}
                  placeholder="sha1"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              {overview?.server.certificate && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-slate-400">Certificate</Label>
                  <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    {overview.server.certificate}
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsSection>

        {/* Connected Clients (live) */}
        <SettingsSection
          icon={<Lock className="h-4 w-4 text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          title="Active Connections"
          description="Currently connected OpenVPN clients."
        >
          {loading ? (
            <div className="h-20 animate-pulse rounded-lg bg-slate-800/50" />
          ) : overview?.active_connections.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No clients currently connected.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-xs text-slate-500">
                      Client
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Source IP
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      VPN IP
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Uptime
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Encoding
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview?.active_connections.map((conn) => (
                    <TableRow
                      key={conn.name}
                      className="border-slate-800 hover:bg-slate-800/35"
                    >
                      <TableCell className="font-medium text-white">
                        {conn.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">
                        {conn.caller_id ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">
                        {conn.address ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {conn.uptime ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {conn.encoding ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SettingsSection>

        {/* Client Accounts */}
        <SettingsSection
          icon={<Users className="h-4 w-4 text-blue-400" />}
          iconBg="bg-blue-500/10"
          title="Client Accounts"
          description="PPP secrets configured for OpenVPN. Export .ovpn client configs for easy setup."
          headerRight={
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Client
            </Button>
          }
        >
          {loading ? (
            <div className="h-20 animate-pulse rounded-lg bg-slate-800/50" />
          ) : overview?.clients.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No client accounts configured.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-xs text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Profile
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Remote Address
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-xs text-slate-500">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview?.clients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="border-slate-800 hover:bg-slate-800/35"
                    >
                      <TableCell className="font-medium text-white">
                        {client.name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
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
                              ? "border-slate-700 text-slate-500"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          }
                        >
                          {client.disabled ? "disabled" : "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={ovpnExportUrl(client.name)}
                            download
                            className="inline-flex"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-white"
                              title="Download .ovpn config"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-rose-400"
                            title="Delete client"
                            onClick={() => handleDeleteClient(client.id)}
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
        </SettingsSection>

        {/* Certificates */}
        {overview && overview.certificates.length > 0 && (
          <SettingsSection
            icon={<ShieldCheck className="h-4 w-4 text-amber-400" />}
            iconBg="bg-amber-500/10"
            title="Certificates"
            description="PKI certificates available on the MikroTik router."
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-xs text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Common Name
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Type
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Expires
                    </TableHead>
                    <TableHead className="text-xs text-slate-500">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.certificates.map((cert) => (
                    <TableRow
                      key={cert.id}
                      className="border-slate-800 hover:bg-slate-800/35"
                    >
                      <TableCell className="font-medium text-white">
                        {cert.name}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {cert.common_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            cert.is_ca
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border-slate-700 text-slate-400"
                          }
                        >
                          {cert.is_ca ? "CA" : "Cert"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {cert.expires ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            cert.expired
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          }
                        >
                          {cert.expired ? "expired" : "valid"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SettingsSection>
        )}

        {/* Create Client Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="border-slate-800 bg-slate-900 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">
                Add OpenVPN Client
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a new PPP secret for OpenVPN authentication.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Username</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="client-name"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Strong password"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">
                  Comment (optional)
                </Label>
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="e.g. John's laptop"
                  className="border-slate-700 bg-slate-800/50 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreate(false)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateClient}
                disabled={
                  !newName.trim() || !newPassword.trim() || createLoading
                }
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {createLoading ? "Creating..." : "Create Client"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
