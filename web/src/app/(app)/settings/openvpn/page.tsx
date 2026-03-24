"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SaveButton } from "@/components/settings/SaveButton";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchOpenvpnStatus,
  updateOpenvpnServer,
  exportOpenvpnClientConfig,
} from "@/lib/api";
import type { OvpnStatusResponse } from "@/lib/types";

type SaveStatus = "idle" | "loading" | "success" | "error";

export default function OpenVpnSettingsPage() {
  const [data, setData] = useState<OvpnStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState("1194");
  const [protocol, setProtocol] = useState("tcp");
  const [cipher, setCipher] = useState("aes256-cbc");
  const [auth, setAuth] = useState("sha1");
  const [certificate, setCertificate] = useState("");
  const [requireClientCert, setRequireClientCert] = useState(false);
  const [mode, setMode] = useState("ip");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOpenvpnStatus();
      setData(result);
      if (result.settings) {
        setEnabled(result.settings.enabled);
        setPort(String(result.settings.port ?? 1194));
        setProtocol(result.settings.protocol ?? "tcp");
        setCipher(result.settings.cipher ?? "aes256-cbc");
        setAuth(result.settings.auth ?? "sha1");
        setCertificate(result.settings.certificate ?? "");
        setRequireClientCert(result.settings.require_client_certificate);
        setMode(result.settings.mode ?? "ip");
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

  const handleSave = async () => {
    setSaveStatus("loading");
    try {
      await updateOpenvpnServer({
        enabled,
        port: Number(port),
        protocol,
        cipher,
        auth,
        certificate: certificate || undefined,
        require_client_certificate: requireClientCert,
        mode,
      });
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportOpenvpnClientConfig();
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    }
  };

  if (loading && !data) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 bg-slate-800" />
          <Skeleton className="h-64 w-full bg-slate-800" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            OpenVPN
          </h1>
        </div>

        {!data?.mikrotik_available && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
            MikroTik integration is not configured. Enable it in{" "}
            <Link href="/settings/router" className="text-cyan-400 hover:underline">
              Router Settings
            </Link>{" "}
            first.
          </div>
        )}

        {data?.mikrotik_available && (
          <>
            {/* Server Configuration */}
            <SettingsSection
              icon={<Shield className="h-4 w-4 text-indigo-300" />}
              iconBg="bg-indigo-500/15 border border-indigo-500/30"
              title="OpenVPN Server"
              description="Configure the OpenVPN server running on MikroTik."
              headerRight={
                <SaveButton status={saveStatus} onClick={handleSave} />
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between sm:col-span-2">
                  <Label htmlFor="ovpn-enabled" className="text-slate-300">
                    Enabled
                  </Label>
                  <Switch
                    id="ovpn-enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-port" className="text-slate-300">
                    Port
                  </Label>
                  <Input
                    id="ovpn-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="border-slate-700 bg-slate-950/70 text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-protocol" className="text-slate-300">
                    Protocol
                  </Label>
                  <Select value={protocol} onValueChange={setProtocol}>
                    <SelectTrigger
                      id="ovpn-protocol"
                      className="border-slate-700 bg-slate-950/70 text-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-900">
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-cipher" className="text-slate-300">
                    Cipher
                  </Label>
                  <Select value={cipher} onValueChange={setCipher}>
                    <SelectTrigger
                      id="ovpn-cipher"
                      className="border-slate-700 bg-slate-950/70 text-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-900">
                      <SelectItem value="aes128-cbc">AES-128-CBC</SelectItem>
                      <SelectItem value="aes192-cbc">AES-192-CBC</SelectItem>
                      <SelectItem value="aes256-cbc">AES-256-CBC</SelectItem>
                      <SelectItem value="aes128-gcm">AES-128-GCM</SelectItem>
                      <SelectItem value="aes256-gcm">AES-256-GCM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-auth" className="text-slate-300">
                    Auth
                  </Label>
                  <Select value={auth} onValueChange={setAuth}>
                    <SelectTrigger
                      id="ovpn-auth"
                      className="border-slate-700 bg-slate-950/70 text-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-900">
                      <SelectItem value="sha1">SHA1</SelectItem>
                      <SelectItem value="sha256">SHA256</SelectItem>
                      <SelectItem value="sha512">SHA512</SelectItem>
                      <SelectItem value="md5">MD5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-mode" className="text-slate-300">
                    Mode
                  </Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger
                      id="ovpn-mode"
                      className="border-slate-700 bg-slate-950/70 text-white"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-700 bg-slate-900">
                      <SelectItem value="ip">IP (tun)</SelectItem>
                      <SelectItem value="ethernet">Ethernet (tap)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ovpn-certificate" className="text-slate-300">
                    Certificate
                  </Label>
                  <Input
                    id="ovpn-certificate"
                    value={certificate}
                    onChange={(e) => setCertificate(e.target.value)}
                    placeholder="Certificate name"
                    className="border-slate-700 bg-slate-950/70 text-white placeholder:text-slate-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="ovpn-require-cert" className="text-slate-300">
                    Require Client Certificate
                  </Label>
                  <Switch
                    id="ovpn-require-cert"
                    checked={requireClientCert}
                    onCheckedChange={setRequireClientCert}
                  />
                </div>
              </div>
            </SettingsSection>

            {/* Client Config Export */}
            <SettingsSection
              icon={<Download className="h-4 w-4 text-cyan-300" />}
              iconBg="bg-cyan-500/15 border border-cyan-500/30"
              title="Client Configuration"
              description="Export an .ovpn client configuration file."
            >
              <Button
                variant="outline"
                onClick={handleExport}
                className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export .ovpn Config
              </Button>
            </SettingsSection>

            {/* VPN Certificates */}
            <SettingsSection
              icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
              iconBg="bg-emerald-500/15 border border-emerald-500/30"
              title="VPN Certificates"
              description="Certificates available on the MikroTik router for VPN authentication."
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
              {data.certificates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No certificates found on the router.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
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
                          Key
                        </TableHead>
                        <TableHead className="text-xs uppercase text-slate-500">
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.certificates.map((cert) => (
                        <TableRow
                          key={cert.name}
                          className="border-slate-800 hover:bg-slate-800/35"
                        >
                          <TableCell className="font-medium text-white">
                            {cert.name}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {cert.common_name ?? "—"}
                          </TableCell>
                          <TableCell>
                            {cert.ca ? (
                              <Badge
                                variant="outline"
                                className="rounded-md border-amber-500/30 bg-amber-500/10 text-[11px] uppercase text-amber-300"
                                data-cert-type="ca"
                              >
                                CA
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="rounded-md border-slate-700 bg-slate-900/60 text-[11px] uppercase text-slate-400"
                                data-cert-type="leaf"
                              >
                                Leaf
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {cert.has_private_key ? (
                              <Lock className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <span className="text-xs text-slate-600">
                                No key
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {cert.expired ? (
                              <Badge
                                variant="outline"
                                className="rounded-md border-rose-500/30 bg-rose-500/10 text-[11px] uppercase text-rose-300"
                              >
                                Expired
                              </Badge>
                            ) : cert.revoked ? (
                              <Badge
                                variant="outline"
                                className="rounded-md border-rose-500/30 bg-rose-500/10 text-[11px] uppercase text-rose-300"
                              >
                                Revoked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="rounded-md border-emerald-500/30 bg-emerald-500/10 text-[11px] uppercase text-emerald-300"
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
          </>
        )}
      </div>
    </PageTransition>
  );
}
