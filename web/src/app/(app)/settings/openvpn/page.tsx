"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  RefreshCw,
  Shield,
  ShieldCheck,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageTransition } from "@/components/PageTransition";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import {
  fetchOpenVpnStatus,
  updateOpenVpnServer,
  exportOpenVpnClientConfig,
} from "@/lib/api";
import type {
  OpenVpnStatusResponse,
  OpenVpnCertificateInfo,
} from "@/lib/types";
import Link from "next/link";
import { toast } from "sonner";

type Status = "idle" | "loading" | "success" | "error";

export default function OpenVpnSettingsPage() {
  const [data, setData] = useState<OpenVpnStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Server config form state
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState("1194");
  const [mode, setMode] = useState("ip");
  const [protocol, setProtocol] = useState("tcp");
  const [cipher, setCipher] = useState("aes256-cbc");
  const [auth, setAuth] = useState("sha1");
  const [certificate, setCertificate] = useState("");
  const [requireClientCert, setRequireClientCert] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOpenVpnStatus();
      setData(result);
      if (result.server.available) {
        setEnabled(result.server.enabled);
        setPort(String(result.server.port ?? 1194));
        setMode(result.server.mode ?? "ip");
        setProtocol(result.server.protocol ?? "tcp");
        setCipher(result.server.cipher ?? "aes256-cbc");
        setAuth(result.server.auth ?? "sha1");
        setCertificate(result.server.certificate ?? "");
        setRequireClientCert(result.server.require_client_certificate);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaveStatus("loading");
    try {
      await updateOpenVpnServer({
        enabled,
        port: Number(port),
        mode,
        protocol,
        cipher,
        auth,
        certificate: certificate || undefined,
        require_client_certificate: requireClientCert,
      });
      setSaveStatus("success");
      toast.success("OpenVPN server settings saved");
    } catch {
      setSaveStatus("error");
      toast.error("Failed to save OpenVPN settings");
    }
  }

  async function handleExportConfig() {
    try {
      const result = await exportOpenVpnClientConfig();
      // Create a downloadable blob
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Client config downloaded");
    } catch {
      toast.error("Failed to export client config");
    }
  }

  async function handleCopyConfig() {
    try {
      const result = await exportOpenVpnClientConfig();
      await navigator.clipboard.writeText(result.config);
      toast.success("Config copied to clipboard");
    } catch {
      toast.error("Failed to copy config");
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              OpenVPN Settings
            </h1>
            <p className="text-sm text-slate-400">
              Configure OpenVPN server on MikroTik, manage certificates, and
              export client configs.
            </p>
          </div>
        </div>

        {/* Server Configuration */}
        <SettingsSection
          icon={<Shield className="h-4 w-4 text-green-400" />}
          iconBg="bg-green-500/10"
          title="Server"
          description="OpenVPN server configuration on MikroTik."
          headerRight={
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        >
          {loading && !data ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full bg-slate-800" />
              <Skeleton className="h-10 w-full bg-slate-800" />
              <Skeleton className="h-10 w-full bg-slate-800" />
            </div>
          ) : !data?.server.available ? (
            <p className="text-sm text-slate-400">
              MikroTik router is not configured. Please configure router
              credentials in{" "}
              <Link href="/settings/router" className="text-blue-400 underline">
                Router Settings
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">
                  Enable OpenVPN Server
                </Label>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Port</Label>
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="border-slate-700 bg-slate-950/70 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Protocol</Label>
                  <Select value={protocol} onValueChange={setProtocol}>
                    <SelectTrigger className="border-slate-700 bg-slate-950/70 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="border-slate-700 bg-slate-950/70 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ip">IP (tun)</SelectItem>
                      <SelectItem value="ethernet">Ethernet (tap)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Cipher</Label>
                  <Select value={cipher} onValueChange={setCipher}>
                    <SelectTrigger className="border-slate-700 bg-slate-950/70 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aes128-cbc">AES-128-CBC</SelectItem>
                      <SelectItem value="aes192-cbc">AES-192-CBC</SelectItem>
                      <SelectItem value="aes256-cbc">AES-256-CBC</SelectItem>
                      <SelectItem value="aes128-gcm">AES-128-GCM</SelectItem>
                      <SelectItem value="aes256-gcm">AES-256-GCM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">
                  Certificate Name
                </Label>
                <Input
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                  placeholder="e.g. ovpn-server"
                  className="border-slate-700 bg-slate-950/70 text-white placeholder:text-slate-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300">
                  Require Client Certificate
                </Label>
                <Switch
                  checked={requireClientCert}
                  onCheckedChange={setRequireClientCert}
                />
              </div>

              <div className="flex justify-end">
                <SaveButton status={saveStatus} onClick={handleSave} />
              </div>
            </div>
          )}
        </SettingsSection>

        {/* Certificates */}
        <SettingsSection
          icon={<ShieldCheck className="h-4 w-4 text-cyan-400" />}
          iconBg="bg-cyan-500/10"
          title="VPN Certificates"
          description="Certificates available on the MikroTik router for VPN use."
        >
          {loading && !data ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full bg-slate-800" />
              <Skeleton className="h-8 w-full bg-slate-800" />
            </div>
          ) : !data || data.certificates.length === 0 ? (
            <p className="text-sm text-slate-500">
              No certificates found on the router.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800/70">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800/70 hover:bg-transparent">
                    <TableHead className="text-xs uppercase text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500">
                      Common Name
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500">
                      Type
                    </TableHead>
                    <TableHead className="text-xs uppercase text-slate-500">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.certificates.map((cert: OpenVpnCertificateInfo) => (
                    <TableRow
                      key={cert.id}
                      className="border-slate-800/70 hover:bg-slate-800/35"
                    >
                      <TableCell className="font-medium text-white">
                        {cert.name}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {cert.common_name ?? "---"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {cert.is_authority && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300"
                            >
                              CA
                            </Badge>
                          )}
                          {cert.has_private_key && (
                            <Badge
                              variant="outline"
                              className="border-blue-500/30 bg-blue-500/10 text-[11px] text-blue-300"
                            >
                              Key
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {cert.expired ? (
                          <Badge
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-[11px] text-rose-300"
                          >
                            Expired
                          </Badge>
                        ) : cert.trusted ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-300"
                          >
                            Trusted
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-700 bg-slate-900/70 text-[11px] text-slate-400"
                          >
                            Valid
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SettingsSection>

        {/* Client Config Export */}
        <SettingsSection
          icon={<Key className="h-4 w-4 text-violet-400" />}
          iconBg="bg-violet-500/10"
          title="Client Config Export"
          description="Generate and download OpenVPN client configuration files."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportConfig}
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download .ovpn
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyConfig}
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy to Clipboard
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            The generated config template will need CA/client certificates
            pasted in before use.
          </p>
        </SettingsSection>
      </div>
    </PageTransition>
  );
}
