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
import { Textarea } from "@/components/ui/textarea";
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
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Status badge helpers ──────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "valid":
      return "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]";
    case "expiring":
      return "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]";
    case "expired":
      return "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]";
    default:
      return "border-mesh-text-mute/30 bg-mesh-text-mute/10 text-mesh-text-dim";
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
      <div className="space-y-8">
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
      <EmptyState
        icon={Shield}
        title="Caddy Not Configured"
        description="Configure your Caddy connection in Settings to manage SSL certificates."
        actionLabel="Open Settings"
        actionHref="/settings"
      />
    );
  }

  if (!npmStatus.reachable) {
    return (
      <ErrorState
        message="Could not connect to your Caddy instance. Check your settings and ensure the service is running."
        onRetry={loadCerts}
      />
    );
  }

  const expiringCount = certs.filter(
    (c) => c.status === "expiring" || c.status === "expired"
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="t-display" style={{ margin: 0 }}>
              SSL Certificates
            </h1>
            <HelpTooltip text="View and manage SSL/TLS certificates provisioned through Caddy. Request free Let's Encrypt certs or upload your own." />
          </div>
          <p className="text-sm text-mesh-text-dim">
            Manage SSL certificates via Caddy
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setLeDialogOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Let&apos;s Encrypt
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Request a free SSL certificate from Let&apos;s Encrypt via DNS challenge
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setCustomDialogOpen(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload Custom
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Upload your own SSL certificate and private key
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Expiry warning banner */}
      {expiringCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#fbbf24]" />
          <p className="text-sm text-[#fbbf24]">
            {expiringCount} certificate{expiringCount > 1 ? "s" : ""}{" "}
            {expiringCount > 1 ? "are" : "is"} expiring or expired.
          </p>
        </div>
      )}

      {/* Certificates table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-mesh-accent/20 bg-mesh-accent/10">
              <Shield className="h-4 w-4 text-mesh-accent" />
            </div>
            <div>
              <CardTitle className="text-base text-mesh-text">
                Certificates ({certs.length})
              </CardTitle>
              <CardDescription className="text-xs text-mesh-text-mute">
                All SSL certificates managed by Caddy
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {certs.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No certificates yet"
              description="Request a free Let's Encrypt certificate or upload your own using the buttons above."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-mesh-text-dim">Name</TableHead>
                    <TableHead className="text-mesh-text-dim">Domains</TableHead>
                    <TableHead className="text-mesh-text-dim">Provider</TableHead>
                    <TableHead className="text-mesh-text-dim">Expires</TableHead>
                    <TableHead className="text-mesh-text-dim">Status</TableHead>
                    <TableHead className="text-right text-mesh-text-dim">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell className="font-medium text-mesh-text">
                        {cert.nice_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cert.domain_names.map((d) => (
                            <Badge key={d} variant="outline" className="text-xs">
                              {d}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {cert.provider === "letsencrypt"
                          ? "Let's Encrypt"
                          : cert.provider === "other"
                            ? "Custom"
                            : cert.provider}
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        <span>{formatDate(cert.expires_on)}</span>
                        {cert.days_remaining !== null && (
                          <span className="ml-1.5 text-xs text-mesh-text-mute">
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
                              className="h-8 px-2 text-mesh-text-dim hover:text-mesh-text"
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
                            className="h-8 px-2 text-mesh-text-dim hover:text-[#fb7185]"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Let&apos;s Encrypt Certificate</DialogTitle>
            <DialogDescription>
              Provide domain names and an email for Let&apos;s Encrypt
              validation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="le-domains" className="text-xs text-mesh-text-dim">
                Domain Names (comma-separated)
              </Label>
              <Input
                id="le-domains"
                value={leDomains}
                onChange={(e) => setLeDomains(e.target.value)}
                placeholder="example.com, *.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="le-email" className="text-xs text-mesh-text-dim">
                Email
              </Label>
              <Input
                id="le-email"
                type="email"
                value={leEmail}
                onChange={(e) => setLeEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-mesh-text">
              <input
                type="checkbox"
                checked={leDns}
                onChange={(e) => setLeDns(e.target.checked)}
                className="rounded border-mesh-border-strong"
              />
              Use DNS challenge
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateLetsEncrypt}
              disabled={!leDomains.trim() || !leEmail.trim() || leSubmitting}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Custom Certificate</DialogTitle>
            <DialogDescription>
              Upload PEM-encoded certificate and private key files, or paste
              them directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="custom-name"
                className="text-xs text-mesh-text-dim"
              >
                Certificate Name
              </Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="My Certificate"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="custom-cert"
                  className="text-xs text-mesh-text-dim"
                >
                  Certificate (PEM)
                </Label>
                <label className="cursor-pointer text-xs text-mesh-accent hover:text-mesh-text">
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
              <Textarea
                id="custom-cert"
                value={customCert}
                onChange={(e) => setCustomCert(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="custom-key"
                  className="text-xs text-mesh-text-dim"
                >
                  Private Key (PEM)
                </Label>
                <label className="cursor-pointer text-xs text-mesh-accent hover:text-mesh-text">
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
              <Textarea
                id="custom-key"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.nice_name}
              &rdquo;? This action cannot be undone. Any proxy hosts using this
              certificate will lose their SSL configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
