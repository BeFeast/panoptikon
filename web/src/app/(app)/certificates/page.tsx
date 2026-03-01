"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
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
import {
  fetchNpmCertificates,
  fetchNpmStatus,
  createLetsEncryptCert,
  uploadCustomCert,
  renewNpmCertificate,
  deleteNpmCertificate,
} from "@/lib/api";
import type { NpmCertificate, NpmConnectionStatus } from "@/lib/types";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Status badge helpers ──────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "valid":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "expiring":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "expired":
      return "border-rose-500/30 bg-rose-500/10 text-rose-400";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-400";
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "valid":
      return <CheckCircle className="h-3.5 w-3.5" />;
    case "expiring":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "expired":
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <Clock className="h-3.5 w-3.5" />;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Page ──────────────────────────────────────────────────

export default function CertificatesPage() {
  const [certs, setCerts] = useState<NpmCertificate[]>([]);
  const [npmStatus, setNpmStatus] = useState<NpmConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [leDialogOpen, setLeDialogOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NpmCertificate | null>(null);
  const [renewingId, setRenewingId] = useState<number | null>(null);

  // Let's Encrypt form
  const [leDomains, setLeDomains] = useState("");
  const [leEmail, setLeEmail] = useState("");
  const [leDns, setLeDns] = useState(false);
  const [leSubmitting, setLeSubmitting] = useState(false);

  // Custom cert form
  const [customName, setCustomName] = useState("");
  const [customCert, setCustomCert] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customSubmitting, setCustomSubmitting] = useState(false);

  const loadCerts = useCallback(async () => {
    try {
      const [statusResult, certsResult] = await Promise.all([
        fetchNpmStatus(),
        fetchNpmCertificates().catch(() => [] as NpmCertificate[]),
      ]);
      setNpmStatus(statusResult);
      if (statusResult.configured && statusResult.reachable) {
        setCerts(certsResult);
      }
    } catch {
      // status fetch failed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCerts();
  }, [loadCerts]);

  // ─── Handlers ──────────────────────────────────────────

  async function handleCreateLetsEncrypt() {
    const domains = leDomains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domains.length === 0 || !leEmail) return;

    setLeSubmitting(true);
    try {
      await createLetsEncryptCert({
        domain_names: domains,
        email: leEmail,
        dns_challenge: leDns,
      });
      toast.success("Let's Encrypt certificate requested");
      setLeDialogOpen(false);
      setLeDomains("");
      setLeEmail("");
      setLeDns(false);
      loadCerts();
    } catch (e) {
      toast.error(
        `Failed to request certificate: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    } finally {
      setLeSubmitting(false);
    }
  }

  async function handleUploadCustom() {
    if (!customName || !customCert || !customKey) return;

    setCustomSubmitting(true);
    try {
      await uploadCustomCert({
        nice_name: customName,
        certificate: customCert,
        certificate_key: customKey,
      });
      toast.success("Custom certificate uploaded");
      setCustomDialogOpen(false);
      setCustomName("");
      setCustomCert("");
      setCustomKey("");
      loadCerts();
    } catch (e) {
      toast.error(
        `Failed to upload certificate: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    } finally {
      setCustomSubmitting(false);
    }
  }

  async function handleRenew(cert: NpmCertificate) {
    setRenewingId(cert.id);
    try {
      await renewNpmCertificate(cert.id);
      toast.success(`Certificate "${cert.nice_name}" renewed`);
      loadCerts();
    } catch (e) {
      toast.error(
        `Failed to renew: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    } finally {
      setRenewingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteNpmCertificate(deleteTarget.id);
      toast.success(`Certificate "${deleteTarget.nice_name}" deleted`);
      setDeleteTarget(null);
      loadCerts();
    } catch (e) {
      toast.error(
        `Failed to delete: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    }
  }

  function handleCertFileRead(
    setter: (v: string) => void,
    file: File | undefined
  ) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setter(reader.result);
    };
    reader.readAsText(file);
  }

  // ─── Render ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!npmStatus?.configured) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Shield className="h-12 w-12 text-slate-600" />
        <h2 className="text-lg font-medium text-white">
          NPM Not Configured
        </h2>
        <p className="max-w-md text-center text-sm text-slate-400">
          Configure your Nginx Proxy Manager connection in Settings to manage
          SSL certificates.
        </p>
      </div>
    );
  }

  if (!npmStatus.reachable) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-lg font-medium text-white">NPM Unreachable</h2>
        <p className="max-w-md text-center text-sm text-slate-400">
          Could not connect to your Nginx Proxy Manager instance. Check your
          settings and ensure the service is running.
        </p>
      </div>
    );
  }

  const expiringCount = certs.filter(
    (c) => c.status === "expiring" || c.status === "expired"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">
              SSL Certificates
            </h1>
            <HelpTooltip text="View and manage SSL/TLS certificates provisioned through Nginx Proxy Manager. Request free Let's Encrypt certs or upload your own." />
          </div>
          <p className="text-sm text-slate-400">
            Manage SSL certificates via Nginx Proxy Manager
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setLeDialogOpen(true)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Let&apos;s Encrypt
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
              Request a free SSL certificate from Let&apos;s Encrypt via DNS challenge
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setCustomDialogOpen(true)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload Custom
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs border-slate-700 bg-slate-800 text-slate-200">
              Upload your own SSL certificate and private key
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Expiry warning banner */}
      {expiringCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-400">
            {expiringCount} certificate{expiringCount > 1 ? "s" : ""}{" "}
            {expiringCount > 1 ? "are" : "is"} expiring or expired.
          </p>
        </div>
      )}

      {/* Certificates table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
              <Shield className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">
                Certificates ({certs.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                All SSL certificates managed by NPM
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {certs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="mb-4 h-12 w-12 text-slate-600" />
              <p className="text-lg font-medium text-slate-400">No certificates yet</p>
              <p className="mt-1 max-w-sm text-sm text-slate-600">
                Request a free Let&apos;s Encrypt certificate or upload your own using the buttons above. Make sure NPM is configured in Settings first.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Domains</TableHead>
                    <TableHead className="text-slate-400">Provider</TableHead>
                    <TableHead className="text-slate-400">Expires</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-right text-slate-400">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.map((cert) => (
                    <TableRow
                      key={cert.id}
                      className="border-slate-800 hover:bg-slate-800/50"
                    >
                      <TableCell className="font-medium text-white">
                        {cert.nice_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cert.domain_names.map((d) => (
                            <Badge
                              key={d}
                              variant="outline"
                              className="border-slate-700 text-xs text-slate-300"
                            >
                              {d}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {cert.provider === "letsencrypt"
                          ? "Let's Encrypt"
                          : cert.provider === "other"
                            ? "Custom"
                            : cert.provider}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        <span>{formatDate(cert.expires_on)}</span>
                        {cert.days_remaining !== null && (
                          <span className="ml-1.5 text-xs text-slate-600">
                            ({cert.days_remaining}d)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`gap-1 ${statusColor(cert.status)}`}
                        >
                          <StatusIcon status={cert.status} />
                          {cert.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {cert.provider === "letsencrypt" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRenew(cert)}
                              disabled={renewingId === cert.id}
                              className="h-8 px-2 text-slate-400 hover:text-white"
                              title="Renew"
                            >
                              {renewingId === cert.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(cert)}
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

      {/* Let's Encrypt Dialog */}
      <Dialog open={leDialogOpen} onOpenChange={setLeDialogOpen}>
        <DialogContent className="border-slate-800 bg-slate-900 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Let&apos;s Encrypt Certificate</DialogTitle>
            <DialogDescription className="text-slate-400">
              Provide domain names and an email for Let&apos;s Encrypt
              validation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="le-domains" className="text-xs text-slate-400">
                Domain Names (comma-separated)
              </Label>
              <Input
                id="le-domains"
                value={leDomains}
                onChange={(e) => setLeDomains(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="example.com, *.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="le-email" className="text-xs text-slate-400">
                Email
              </Label>
              <Input
                id="le-email"
                type="email"
                value={leEmail}
                onChange={(e) => setLeEmail(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="admin@example.com"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={leDns}
                onChange={(e) => setLeDns(e.target.checked)}
                className="rounded border-slate-700"
              />
              Use DNS challenge
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLeDialogOpen(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateLetsEncrypt}
              disabled={!leDomains.trim() || !leEmail.trim() || leSubmitting}
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {leSubmitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Request Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Custom Certificate Dialog */}
      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent className="border-slate-800 bg-slate-900 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Custom Certificate</DialogTitle>
            <DialogDescription className="text-slate-400">
              Upload PEM-encoded certificate and private key files, or paste
              them directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="custom-name"
                className="text-xs text-slate-400"
              >
                Certificate Name
              </Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="border-slate-800 bg-slate-950 text-white placeholder:text-slate-600"
                placeholder="My Certificate"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="custom-cert"
                  className="text-xs text-slate-400"
                >
                  Certificate (PEM)
                </Label>
                <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300">
                  <input
                    type="file"
                    accept=".pem,.crt,.cer"
                    className="hidden"
                    onChange={(e) =>
                      handleCertFileRead(setCustomCert, e.target.files?.[0])
                    }
                  />
                  Choose file
                </label>
              </div>
              <textarea
                id="custom-cert"
                value={customCert}
                onChange={(e) => setCustomCert(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="custom-key"
                  className="text-xs text-slate-400"
                >
                  Private Key (PEM)
                </Label>
                <label className="cursor-pointer text-xs text-blue-400 hover:text-blue-300">
                  <input
                    type="file"
                    accept=".pem,.key"
                    className="hidden"
                    onChange={(e) =>
                      handleCertFileRead(setCustomKey, e.target.files?.[0])
                    }
                  />
                  Choose file
                </label>
              </div>
              <textarea
                id="custom-key"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomDialogOpen(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadCustom}
              disabled={
                !customName.trim() ||
                !customCert.trim() ||
                !customKey.trim() ||
                customSubmitting
              }
              className="bg-blue-600 text-white hover:bg-blue-500"
            >
              {customSubmitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Upload Certificate
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
              Delete Certificate
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete &ldquo;{deleteTarget?.nice_name}
              &rdquo;? This action cannot be undone. Any proxy hosts using this
              certificate will lose their SSL configuration.
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
  );
}
