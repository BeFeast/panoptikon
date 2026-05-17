"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Shield,
  Globe,
  Clock,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchDnsQueries, fetchDnsQueryStats } from "@/lib/api";
import type {
  DnsQueriesResponse,
  DnsQueryStats,
} from "@/lib/types";
import { PageTransition } from "@/components/PageTransition";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

type TimeRange = "1h" | "6h" | "24h" | "48h" | "7d";

const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: "1h", label: "1h", hours: 1 },
  { value: "6h", label: "6h", hours: 6 },
  { value: "24h", label: "24h", hours: 24 },
  { value: "48h", label: "48h", hours: 48 },
  { value: "7d", label: "7d", hours: 168 },
];

type BlockedFilter = "all" | "allowed" | "blocked";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr + "Z");
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function DnsQueriesPage() {
  const [logData, setLogData] = useState<DnsQueriesResponse | null>(null);
  const [stats, setStats] = useState<DnsQueryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [domainSearch, setDomainSearch] = useState("");
  const [blockedFilter, setBlockedFilter] = useState<BlockedFilter>("all");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const hours = TIME_RANGES.find((t) => t.value === timeRange)?.hours ?? 24;

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchDnsQueryStats(hours);
      setStats(data);
    } catch {
      // stats are optional, don't block the page
    }
  }, [hours]);

  const loadLog = useCallback(async () => {
    try {
      const params: Parameters<typeof fetchDnsQueries>[0] = {
        page,
        per_page: perPage,
        hours,
      };
      if (domainSearch.trim()) params.domain = domainSearch.trim();
      if (blockedFilter === "blocked") params.blocked = true;
      if (blockedFilter === "allowed") params.blocked = false;

      const data = await fetchDnsQueries(params);
      setLogData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DNS queries");
    }
  }, [page, hours, domainSearch, blockedFilter]);

  useEffect(() => {
    loadStats();
    loadLog();
  }, [loadStats, loadLog]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadStats();
      loadLog();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadStats, loadLog]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [timeRange, domainSearch, blockedFilter]);

  const totalPages = logData ? Math.ceil(logData.total / perPage) : 0;

  if (error && !logData) {
    return <ErrorState message={error} onRetry={loadLog} />;
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white">DNS Query Log</h1>
            {stats && (
              <Badge variant="secondary" className="gap-1">
                <Globe className="h-3 w-3" />
                {stats.total_queries.toLocaleString()} queries
              </Badge>
            )}
          </div>
        </div>

        {/* Stats cards */}
        {stats === null ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-mesh-border-strong bg-mesh-surface-1/95">
                <CardContent className="py-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Globe className="h-3.5 w-3.5" />
                  Total Queries
                </div>
                <p className="text-2xl font-semibold text-white">
                  {stats.total_queries.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Blocked
                </div>
                <p className="text-2xl font-semibold text-rose-400">
                  {stats.blocked_queries.toLocaleString()}
                  {stats.total_queries > 0 && (
                    <span className="ml-2 text-sm text-slate-500">
                      ({((stats.blocked_queries / stats.total_queries) * 100).toFixed(1)}%)
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Search className="h-3.5 w-3.5" />
                  Unique Domains
                </div>
                <p className="text-2xl font-semibold text-white">
                  {stats.unique_domains.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Users className="h-3.5 w-3.5" />
                  Clients
                </div>
                <p className="text-2xl font-semibold text-white">
                  {stats.unique_clients.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Top domains + Per-device stats */}
        {stats && (stats.top_queried_domains.length > 0 || stats.per_device_stats.length > 0) && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Top queried domains */}
            {stats.top_queried_domains.length > 0 && (
              <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-400">
                    <BarChart3 className="h-4 w-4" />
                    Top Queried Domains
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stats.top_queried_domains.slice(0, 10).map((d, i) => (
                    <div key={d.domain} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate text-slate-300">
                        <span className="text-xs text-slate-600 w-4">{i + 1}.</span>
                        {d.domain}
                      </span>
                      <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                        {d.count.toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Top blocked domains */}
            {stats.top_blocked_domains.length > 0 && (
              <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-400">
                    <Shield className="h-4 w-4" />
                    Top Blocked Domains
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stats.top_blocked_domains.slice(0, 10).map((d, i) => (
                    <div key={d.domain} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate text-rose-400">
                        <span className="text-xs text-slate-600 w-4">{i + 1}.</span>
                        {d.domain}
                      </span>
                      <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs shrink-0 ml-2">
                        {d.count.toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Per-device stats */}
            {stats.per_device_stats.length > 0 && (
              <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-400">
                    <Users className="h-4 w-4" />
                    Per-Device Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {stats.per_device_stats.slice(0, 10).map((d) => (
                    <div key={d.client_ip} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-300">
                        {d.device_name || d.client_ip}
                        {d.device_name && (
                          <span className="ml-1.5 text-xs text-slate-600">{d.client_ip}</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="secondary" className="text-xs">
                          {d.total_queries.toLocaleString()}
                        </Badge>
                        {d.blocked_queries > 0 && (
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs">
                            {d.blocked_queries}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Time range */}
          <div className="flex gap-1">
            {TIME_RANGES.map((t) => (
              <Button
                key={t.value}
                variant={timeRange === t.value ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(t.value)}
                className={
                  timeRange === t.value
                    ? ""
                    : "border-gray-700 text-slate-400 hover:text-gray-200"
                }
              >
                {t.label}
              </Button>
            ))}
          </div>

          {/* Blocked filter */}
          <div className="flex gap-1">
            {(["all", "allowed", "blocked"] as BlockedFilter[]).map((f) => (
              <Button
                key={f}
                variant={blockedFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setBlockedFilter(f)}
                className={
                  blockedFilter === f
                    ? ""
                    : "border-gray-700 text-slate-400 hover:text-gray-200"
                }
              >
                {f === "all" ? "All" : f === "blocked" ? "Blocked" : "Allowed"}
              </Button>
            ))}
          </div>

          {/* Domain search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Filter by domain..."
              value={domainSearch}
              onChange={(e) => setDomainSearch(e.target.value)}
              className="pl-9 bg-[#12121a] border-slate-800 text-sm"
            />
          </div>
        </div>

        {/* Query log table */}
        {logData === null ? (
          <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
            <CardContent className="py-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : logData.items.length === 0 ? (
          <Card className="border-mesh-border-strong bg-mesh-surface-1/95">
            <CardContent>
              <EmptyState
                icon={Globe}
                title="No DNS queries recorded"
                description="No queries match the selected filters. Check that DNS logging is enabled in Settings → DNS."
                actionLabel="DNS Settings"
                actionHref="/settings/dns"
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-mesh-border-strong bg-mesh-surface-1/95 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-500">Time</TableHead>
                    <TableHead className="text-slate-500">Client</TableHead>
                    <TableHead className="text-slate-500">Domain</TableHead>
                    <TableHead className="text-slate-500">Type</TableHead>
                    <TableHead className="text-slate-500">Status</TableHead>
                    <TableHead className="text-slate-500">Response</TableHead>
                    <TableHead className="text-slate-500 text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logData.items.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="border-slate-800 hover:bg-mesh-surface-2/55"
                    >
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          {timeAgo(entry.queried_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>
                          {entry.device_name ? (
                            <>
                              <span className="text-slate-300">{entry.device_name}</span>
                              <span className="ml-1.5 text-xs text-slate-600">{entry.client_ip}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">{entry.client_ip}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px]">
                        <span
                          className={`truncate block ${
                            entry.blocked ? "text-rose-400" : "text-slate-300"
                          }`}
                          title={entry.domain}
                        >
                          {entry.domain}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-slate-700 text-slate-400"
                        >
                          {entry.query_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {entry.blocked ? (
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px]">
                            BLOCKED
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                            ALLOWED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border-slate-700 ${
                            entry.response_code === "NOERROR"
                              ? "text-emerald-400 border-emerald-700/30"
                              : entry.response_code === "NXDOMAIN"
                                ? "text-amber-400 border-amber-700/30"
                                : "text-slate-400"
                          }`}
                        >
                          {entry.response_code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-slate-500">
                        {entry.response_time_ms != null
                          ? `${entry.response_time_ms}ms`
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-mesh-border px-4 py-3">
                <span className="text-xs text-slate-500">
                  Page {logData.page} of {totalPages} ({logData.total.toLocaleString()} entries)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="border-gray-700 text-slate-400 h-7 px-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="border-gray-700 text-slate-400 h-7 px-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
