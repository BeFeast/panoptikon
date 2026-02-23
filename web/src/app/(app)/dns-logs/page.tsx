"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  ShieldBan,
  Globe,
  Monitor,
  Clock,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PageTransition } from "@/components/PageTransition";
import { fetchDnsQueryLog, fetchDnsStats, purgeDnsLogs } from "@/lib/api";
import type {
  DnsQueryLogEntry,
  DnsStatsResponse,
  DnsQueryLogResponse,
} from "@/lib/types";

const PAGE_SIZE = 50;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DnsLogsPage() {
  const [tab, setTab] = useState("log");
  const [logData, setLogData] = useState<DnsQueryLogResponse | null>(null);
  const [stats, setStats] = useState<DnsStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [domainFilter, setDomainFilter] = useState("");
  const [clientIpFilter, setClientIpFilter] = useState("");
  const [blockedFilter, setBlockedFilter] = useState<boolean | undefined>(
    undefined
  );

  const loadLog = useCallback(async () => {
    try {
      const data = await fetchDnsQueryLog({
        domain: domainFilter || undefined,
        client_ip: clientIpFilter || undefined,
        blocked: blockedFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setLogData(data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [domainFilter, clientIpFilter, blockedFilter, page]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchDnsStats();
      setStats(data);
    } catch {
      // silently ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadLog();
  }, [loadLog]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handlePurge = async () => {
    try {
      const res = await purgeDnsLogs();
      toast.success(`Purged ${res.deleted} DNS log entries`);
      setPage(0);
      loadLog();
      loadStats();
    } catch {
      toast.error("Failed to purge DNS logs");
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setStatsLoading(true);
    loadLog();
    loadStats();
  };

  const totalPages = logData ? Math.ceil(logData.total / PAGE_SIZE) : 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              DNS Query Log
            </h1>
            <p className="text-muted-foreground">
              Per-device DNS query history and statistics (7-day retention)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Purge All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Purge DNS query logs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all DNS query log entries. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePurge}>
                    Purge
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Queries
              </CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.total_queries.toLocaleString() ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocked</CardTitle>
              <ShieldBan className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-red-400">
                  {stats?.total_blocked.toLocaleString() ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Unique Domains
              </CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.unique_domains.toLocaleString() ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clients</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {stats?.unique_clients.toLocaleString() ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Log / Stats */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="log">Query Log</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          {/* Query Log Tab */}
          <TabsContent value="log" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Filter by domain..."
                value={domainFilter}
                onChange={(e) => {
                  setDomainFilter(e.target.value);
                  setPage(0);
                }}
                className="w-64"
              />
              <Input
                placeholder="Filter by client IP..."
                value={clientIpFilter}
                onChange={(e) => {
                  setClientIpFilter(e.target.value);
                  setPage(0);
                }}
                className="w-48"
              />
              <div className="flex gap-1">
                <Button
                  variant={blockedFilter === undefined ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setBlockedFilter(undefined);
                    setPage(0);
                  }}
                >
                  All
                </Button>
                <Button
                  variant={blockedFilter === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setBlockedFilter(false);
                    setPage(0);
                  }}
                >
                  Allowed
                </Button>
                <Button
                  variant={blockedFilter === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setBlockedFilter(true);
                    setPage(0);
                  }}
                >
                  Blocked
                </Button>
              </div>
            </div>

            {/* Query Log Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : logData?.entries.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No DNS queries recorded yet. Configure Unbound log
                          ingestion to start collecting data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      logData?.entries.map((entry: DnsQueryLogEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            <Clock className="mr-1 inline h-3 w-3" />
                            {formatTime(entry.queried_at)}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate font-mono text-sm">
                            {entry.domain}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {entry.query_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.client_ip}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.device_name ?? (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.blocked ? (
                              <Badge variant="destructive" className="text-xs">
                                BLOCKED
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs text-green-400 border-green-400/30"
                              >
                                {entry.result}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {entry.response_time_ms != null
                              ? `${entry.response_time_ms}ms`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}&ndash;
                  {Math.min((page + 1) * PAGE_SIZE, logData?.total ?? 0)} of{" "}
                  {logData?.total.toLocaleString()} entries
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Queried Domains */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Queried Domains</CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full" />
                      ))}
                    </div>
                  ) : stats?.top_queried.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No data yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats?.top_queried.map((d, i) => (
                        <div
                          key={d.domain}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-5">
                              {i + 1}.
                            </span>
                            <span className="font-mono text-sm truncate max-w-[250px]">
                              {d.domain}
                            </span>
                          </div>
                          <Badge variant="secondary">
                            {d.count.toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Blocked Domains */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Blocked Domains</CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full" />
                      ))}
                    </div>
                  ) : stats?.top_blocked.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No blocked queries
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats?.top_blocked.map((d, i) => (
                        <div
                          key={d.domain}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-5">
                              {i + 1}.
                            </span>
                            <span className="font-mono text-sm truncate max-w-[250px]">
                              {d.domain}
                            </span>
                          </div>
                          <Badge variant="destructive">
                            {d.count.toLocaleString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Per-device Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Per-Device Statistics</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client IP</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead className="text-right">
                        Total Queries
                      </TableHead>
                      <TableHead className="text-right">Blocked</TableHead>
                      <TableHead className="text-right">
                        Unique Domains
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : stats?.device_stats.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-16 text-center text-muted-foreground"
                        >
                          No per-device data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      stats?.device_stats.map((ds) => (
                        <TableRow key={ds.client_ip}>
                          <TableCell className="font-mono text-sm">
                            {ds.client_ip}
                          </TableCell>
                          <TableCell>
                            {ds.device_name ?? (
                              <span className="text-muted-foreground">
                                Unknown
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {ds.total_queries.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-400">
                            {ds.blocked_queries > 0
                              ? ds.blocked_queries.toLocaleString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {ds.unique_domains.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
