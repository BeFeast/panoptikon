"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { HelpTooltip } from "@/components/HelpTooltip";
import { PageTransition } from "@/components/PageTransition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  fetchCaddyCertificates,
  probeCaddyCertificates,
} from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type {
  CaddyCertificate,
  CaddyCertificatesResponse,
} from "@/lib/types";

function intervalLabel(seconds: number): string {
  if (seconds === 0) return "disabled";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatExpiry(cert: CaddyCertificate): string {
  if (!cert.not_after || cert.days_remaining === null) return "—";
  const date = new Date(cert.not_after).toISOString().slice(0, 10);
  if (cert.days_remaining < 0) {
    return `${Math.abs(cert.days_remaining)} days ago · ${date}`;
  }
  return `in ${cert.days_remaining} days · ${date}`;
}

function statusClass(status: CaddyCertificate["status"]): string {
  switch (status) {
    case "ok":
      return "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]";
    case "expiring":
      return "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]";
    case "expired":
    case "error":
      return "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]";
  }
}

function StatusIcon({ status }: { status: CaddyCertificate["status"] }) {
  switch (status) {
    case "ok":
      return <CheckCircle className="h-3.5 w-3.5" />;
    case "expiring":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "expired":
      return <XCircle className="h-3.5 w-3.5" />;
    case "error":
      return <Clock className="h-3.5 w-3.5" />;
  }
}

function StatusBadge({ cert }: { cert: CaddyCertificate }) {
  const text =
    cert.status === "ok"
      ? "Valid"
      : cert.status === "expiring"
        ? `Expiring in ${cert.days_remaining ?? 0}d`
        : cert.status === "expired"
          ? "Expired"
          : "Error";
  const badge = (
    <Badge className={`gap-1 ${statusClass(cert.status)}`}>
      <StatusIcon status={cert.status} />
      {text}
    </Badge>
  );

  if (cert.status !== "error") return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-sm">{cert.error}</TooltipContent>
    </Tooltip>
  );
}

function ChainStatus({ cert }: { cert: CaddyCertificate }) {
  if (cert.chain_valid === null) {
    return <span className="text-mesh-text-mute">—</span>;
  }
  if (cert.chain_valid) {
    return (
      <Tooltip>
        <TooltipTrigger aria-label="Publicly trusted certificate chain">
          <ShieldCheck className="h-4 w-4 text-[#4ade80]" />
        </TooltipTrigger>
        <TooltipContent>Trusted by the public root store</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger aria-label="Certificate chain is not publicly trusted">
        <ShieldAlert className="h-4 w-4 text-[#fbbf24]" />
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

  const load = useCallback(async () => {
    try {
      const response = await fetchCaddyCertificates();
      setData(response);
      setPolling(response.probe_running);
      setError(null);
      return response;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load certificates"
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load, polling]);

  async function handleProbe() {
    setPolling(true);
    try {
      await probeCaddyCertificates();
      toast.success("Certificate probe started");
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (message.includes("API error 409")) {
        toast.info("Probe already running");
        setPolling(true);
        await load();
      } else {
        setPolling(false);
        toast.error(`Failed to start probe${message ? `: ${message}` : ""}`);
      }
    }
  }

  const isProbing = polling || data?.probe_running === true;

  return (
    <PageTransition>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="t-display" style={{ margin: 0 }}>
                SSL Certificates
              </h1>
              <HelpTooltip text="Inspect the leaf certificate Caddy serves for every TLS-enabled proxy host." />
            </div>
            <p className="mt-1 text-sm text-mesh-text-dim">
              Live TLS visibility for Caddy-served hosts
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleProbe}
            disabled={isProbing || loading}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isProbing ? "animate-spin" : ""}`}
            />
            {isProbing ? "Probing…" : "Probe now"}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-96 max-w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error && !data ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : data ? (
          <>
            <p className="font-mono text-xs text-mesh-text-mute">
              Last probe: {data.last_probe_at ? timeAgo(data.last_probe_at) : "never"}
              {" · "}every {intervalLabel(data.interval_secs)}
              {" · "}target {data.probe_host}:{data.probe_port}
            </p>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-mesh-accent/20 bg-mesh-accent/10">
                    <Shield className="h-4 w-4 text-mesh-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-mesh-text">
                      Certificates ({data.certificates.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-mesh-text-mute">
                      Observed from Caddy&apos;s TLS listener using each domain as SNI
                    </CardDescription>
                  </div>
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
                          <TableHead
                            key={heading}
                            className="text-mesh-text-dim"
                          >
                            {heading}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.certificates.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="p-6">
                            <EmptyState
                              icon={Shield}
                              title="No TLS-enabled hosts"
                              description="Enable TLS on a Caddy proxy host, then run a certificate probe."
                              actionLabel="Manage Caddy hosts"
                              actionHref="/caddy"
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.certificates.map((cert) => (
                          <TableRow
                            key={cert.domain}
                            className="border-mesh-border-strong hover:bg-mesh-surface-2/55"
                          >
                            <TableCell className="font-medium">
                              <a
                                href={`https://${cert.domain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-mesh-primary hover:underline"
                              >
                                {cert.domain}
                              </a>
                            </TableCell>
                            <TableCell
                              className="max-w-64 truncate text-mesh-text-dim"
                              title={cert.issuer ?? undefined}
                            >
                              {cert.issuer ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-mesh-text-dim">
                              {formatExpiry(cert)}
                            </TableCell>
                            <TableCell>
                              <ChainStatus cert={cert} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge cert={cert} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs text-mesh-text-mute">
                              {timeAgo(cert.probed_at)}
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
        ) : null}
      </div>
    </PageTransition>
  );
}
