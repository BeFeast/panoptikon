"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageTransition } from "@/components/PageTransition";
import { HelpTooltip } from "@/components/HelpTooltip";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchCaddyCertificates, probeCaddyCertificates } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type {
  CaddyCertificate,
  CaddyCertificatesResponse,
} from "@/lib/types";

function formatInterval(seconds: number): string {
  if (seconds === 0) return "disabled";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatExpiry(certificate: CaddyCertificate): string {
  if (!certificate.not_after || certificate.days_remaining === null) return "—";
  const date = certificate.not_after.slice(0, 10);
  if (certificate.days_remaining < 0) {
    return `${Math.abs(certificate.days_remaining)} days ago · ${date}`;
  }
  if (certificate.days_remaining === 0) return `today · ${date}`;
  return `in ${certificate.days_remaining} days · ${date}`;
}

function StatusBadge({ certificate }: { certificate: CaddyCertificate }) {
  const config = {
    ok: {
      label: "Valid",
      icon: CheckCircle,
      className: "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]",
    },
    expiring: {
      label: `Expiring in ${certificate.days_remaining ?? 0}d`,
      icon: AlertTriangle,
      className: "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]",
    },
    expired: {
      label: "Expired",
      icon: XCircle,
      className: "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]",
    },
    error: {
      label: "Error",
      icon: AlertTriangle,
      className: "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]",
    },
  }[certificate.status];
  const Icon = config.icon;
  const badge = (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );

  if (certificate.status !== "error") return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-sm">{certificate.error}</TooltipContent>
    </Tooltip>
  );
}

function ChainStatus({ certificate }: { certificate: CaddyCertificate }) {
  if (certificate.chain_valid === null) {
    return <span className="text-mesh-text-mute">—</span>;
  }
  if (certificate.chain_valid) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <ShieldCheck className="h-4 w-4 text-[#4ade80]" aria-label="Trusted chain" />
        </TooltipTrigger>
        <TooltipContent>Chain trusted by the public root store</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ShieldAlert className="h-4 w-4 text-[#fbbf24]" aria-label="Untrusted chain" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Chain not trusted by the public root store (internal CA or self-signed)
      </TooltipContent>
    </Tooltip>
  );
}

export default function CertificatesPage() {
  const [data, setData] = useState<CaddyCertificatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const loadCertificates = useCallback(async () => {
    try {
      const response = await fetchCaddyCertificates();
      setData(response);
      setError(null);
      if (!response.probe_running) setPolling(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load certificate probe results.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    if (!polling && !data?.probe_running) return;
    const timer = window.setInterval(loadCertificates, 3000);
    return () => window.clearInterval(timer);
  }, [data?.probe_running, loadCertificates, polling]);

  async function handleProbe() {
    setPolling(true);
    setData((current) =>
      current ? { ...current, probe_running: true } : current,
    );
    try {
      await probeCaddyCertificates();
      toast.success("Certificate probe started");
    } catch (probeError) {
      if (probeError instanceof Error && probeError.message.includes("409")) {
        toast.info("Probe already running");
      } else {
        setPolling(false);
        setData((current) =>
          current ? { ...current, probe_running: false } : current,
        );
        toast.error(
          probeError instanceof Error
            ? probeError.message
            : "Failed to start certificate probe",
        );
      }
    }
    await loadCertificates();
  }

  const probeRunning = polling || data?.probe_running === true;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="t-display" style={{ margin: 0 }}>
                SSL Certificates
              </h1>
              <HelpTooltip text="Inspect the leaf certificate Caddy actually serves for each TLS-enabled proxy host." />
            </div>
            {data && (
              <p className="mt-2 text-xs text-mesh-text-mute">
                Last probe: {data.last_probe_at ? timeAgo(data.last_probe_at) : "never"}
                {" · "}every {formatInterval(data.interval_secs)}
                {" · "}target {data.probe_host}:{data.probe_port}
              </p>
            )}
          </div>
          <Button size="sm" onClick={handleProbe} disabled={probeRunning || loading}>
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${probeRunning ? "animate-spin" : ""}`}
            />
            {probeRunning ? "Probing…" : "Probe now"}
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <ErrorState message={error} onRetry={loadCertificates} />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-mesh-accent/20 bg-mesh-accent/10">
                  <Shield className="h-4 w-4 text-mesh-accent" />
                </div>
                <CardTitle className="text-sm font-medium text-white">
                  Served certificates ({data?.certificates.length ?? 0})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-mesh-border-strong hover:bg-transparent">
                      {[
                        "Domain",
                        "Issuer",
                        "Expires",
                        "Chain",
                        "Status",
                        "Probed",
                      ].map((heading) => (
                        <TableHead key={heading} className="text-mesh-text-dim">
                          {heading}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.certificates.length === 0 ? (
                      <TableRow className="border-mesh-border-strong hover:bg-transparent">
                        <TableCell colSpan={6} className="p-5">
                          <EmptyState
                            icon={Shield}
                            title="No TLS-enabled hosts"
                            description="Enable TLS on a Caddy proxy host, then run a probe to inspect the served certificate."
                            actionLabel="Open Caddy"
                            actionHref="/caddy"
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.certificates.map((certificate) => (
                        <TableRow
                          key={certificate.domain}
                          className="border-mesh-border-strong hover:bg-mesh-surface-2/55"
                        >
                          <TableCell className="font-medium">
                            <a
                              href={`https://${certificate.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-mesh-primary hover:underline"
                            >
                              {certificate.domain}
                            </a>
                          </TableCell>
                          <TableCell
                            className="max-w-64 truncate text-mesh-text-dim"
                            title={certificate.issuer ?? undefined}
                          >
                            {certificate.issuer ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums text-mesh-text-dim">
                            {formatExpiry(certificate)}
                          </TableCell>
                          <TableCell>
                            <ChainStatus certificate={certificate} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge certificate={certificate} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums text-mesh-text-mute">
                            {timeAgo(certificate.probed_at)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
