"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  RefreshCw,
  Download,
  Save,
  Users,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageTransition } from "@/components/PageTransition";
import { fetchOvpnStatus, updateOvpnServer, exportOvpnClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { OvpnStatusResponse, OvpnServerUpdateRequest } from "@/lib/types";

const surfaceClass =
  "border-slate-800/70 bg-gradient-to-b from-slate-900/80 to-slate-900/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function OpenVpnSettingsPage() {
  const [data, setData] = useState<OvpnStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [port, setPort] = useState("1194");
  const [protocol, setProtocol] = useState("tcp");
  const [cipher, setCipher] = useState("aes256-cbc");
  const [auth, setAuth] = useState("sha1");
  const [requireClientCert, setRequireClientCert] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOvpnStatus();
      setData(result);
      // Populate form with current server config
      if (result.server) {
        setEnabled(result.server.enabled);
        if (result.server.port) setPort(String(result.server.port));
        if (result.server.protocol) setProtocol(result.server.protocol);
        if (result.server.cipher) setCipher(result.server.cipher);
        if (result.server.auth) setAuth(result.server.auth);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const req: OvpnServerUpdateRequest = {
        enabled,
        port: Number(port),
        protocol,
        cipher,
        auth,
        require_client_certificate: requireClientCert,
      };
      await updateOvpnServer(req);
      toast.success("OpenVPN server configuration saved");
      await load();
    } catch {
      toast.error("Failed to save OpenVPN configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportOvpnClient();
      // Trigger download
      const blob = new Blob([result.config], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Client configuration exported");
    } catch {
      toast.error("Failed to export client configuration");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <section className="flex flex-col gap-5 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-yellow-500/10 text-orange-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                OpenVPN
              </h1>
              <p className="text-sm text-slate-400">
                Configure OpenVPN server on MikroTik and export client configs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || !data?.server.available}
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
            >
              {exporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Export Client Config
            </Button>
          </div>
        </section>

        {!data && loading && (
          <Card className={surfaceClass}>
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-6 w-48 bg-slate-800" />
              <Skeleton className="h-10 w-full bg-slate-800" />
              <Skeleton className="h-10 w-full bg-slate-800" />
            </CardContent>
          </Card>
        )}

        {data && !data.server.available && (
          <Card className={surfaceClass}>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-slate-400">
                MikroTik is not configured. Configure router credentials in{" "}
                <a href="/settings/router" className="text-cyan-400 underline">
                  Settings → Router
                </a>{" "}
                first.
              </p>
            </CardContent>
          </Card>
        )}

        {data?.server.available && (
          <>
            {/* Server Configuration */}
            <Card className={surfaceClass}>
              <CardHeader>
                <CardTitle className="text-base text-white">
                  Server Configuration
                </CardTitle>
                <CardDescription className="text-sm text-slate-400">
                  Configure the OpenVPN server running on your MikroTik router.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-slate-300">
                    Enable OpenVPN Server
                  </Label>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-slate-400">Port</Label>
                    <Input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="border-slate-800 bg-slate-950/70 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-slate-400">Protocol</Label>
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
                    <Label className="text-sm text-slate-400">Cipher</Label>
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
                    <Label className="text-sm text-slate-400">Auth</Label>
                    <Select value={auth} onValueChange={setAuth}>
                      <SelectTrigger className="border-slate-800 bg-slate-950/70 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sha1">SHA1</SelectItem>
                        <SelectItem value="sha256">SHA256</SelectItem>
                        <SelectItem value="sha512">SHA512</SelectItem>
                        <SelectItem value="md5">MD5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>

            {/* Connected Clients */}
            <Card className={surfaceClass}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-white">
                      Connected Clients
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-400">
                      Currently connected OpenVPN clients.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md border text-xs",
                      data.clients.length > 0
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-700 bg-slate-900/60 text-slate-400",
                    )}
                  >
                    <Users className="mr-1 h-3 w-3" />
                    {data.clients.length} connected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t border-slate-800/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800/70 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Client
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Address
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Uptime
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-slate-500">
                          Encoding
                        </TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                          RX
                        </TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide text-slate-500">
                          TX
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.clients.length === 0 ? (
                        <TableRow className="border-slate-800/70 hover:bg-transparent">
                          <TableCell
                            colSpan={6}
                            className="py-9 text-center text-sm text-slate-500"
                          >
                            No clients currently connected.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.clients.map((client, idx) => (
                          <TableRow
                            key={`${client.name}-${idx}`}
                            className="border-slate-800/70 hover:bg-slate-800/35"
                          >
                            <TableCell className="font-medium text-white">
                              {client.name || "Unknown"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">
                              {client.client_address ?? "—"}
                            </TableCell>
                            <TableCell className="text-slate-400">
                              {client.uptime ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-slate-400">
                              {client.encoding ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-slate-400">
                              {formatBytes(client.rx_bytes)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-slate-400">
                              {formatBytes(client.tx_bytes)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}
