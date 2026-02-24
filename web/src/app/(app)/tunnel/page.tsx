"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudOff,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Server,
  Timer,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { PageTransition } from "@/components/PageTransition";
import {
  fetchCfTunnelStatus,
  addCfTunnelRoute,
  deleteCfTunnelRoute,
} from "@/lib/api";
import type { CfTunnelOverview } from "@/lib/types";
import { toast } from "sonner";

/** Format a date string into a human-friendly relative time. */
function timeAgo(dateStr: string): string {
  if (!dateStr) return "—";
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 0) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TunnelPage() {
  const [data, setData] = useState<CfTunnelOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteHostname, setDeleteHostname] = useState<string | null>(null);

  // Add route form state
  const [newHostname, setNewHostname] = useState("");
  const [newService, setNewService] = useState("");
  const [newPath, setNewPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCfTunnelStatus();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const filteredRoutes = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.routes;
    const q = search.toLowerCase();
    return data.routes.filter(
      (r) =>
        r.hostname.toLowerCase().includes(q) ||
        r.service.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleAddRoute = async () => {
    if (!newHostname || !newService) return;
    try {
      const result = await addCfTunnelRoute({
        hostname: newHostname,
        service: newService,
        path: newPath || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setAddOpen(false);
        setNewHostname("");
        setNewService("");
        setNewPath("");
        load();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to add route");
    }
  };

  const handleDeleteRoute = async () => {
    if (!deleteHostname) return;
    try {
      await deleteCfTunnelRoute(deleteHostname);
      toast.success(`Route for '${deleteHostname}' removed`);
      setDeleteHostname(null);
      load();
    } catch {
      toast.error("Failed to remove route");
    }
  };

  const tunnelStatus = data?.status ?? "unknown";
  const isHealthy = tunnelStatus === "healthy";
  const isConfigured = data?.configured ?? false;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-semibold text-white">
              Cloudflare Tunnel
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Not configured state */}
        {!loading && !isConfigured && (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="py-12 text-center">
              <CloudOff className="mx-auto h-10 w-10 text-slate-600" />
              <p className="mt-4 text-sm text-slate-400">
                Cloudflare Tunnel is not configured. Go to{" "}
                <span className="font-medium text-white">Settings</span> and
                add your Cloudflare API token, account ID, and tunnel ID.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Configured state */}
        {(loading || isConfigured) && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <SummaryCard
                title="Tunnel Status"
                value={loading && !data ? null : tunnelStatus}
                loading={loading && !data}
                icon={
                  isHealthy ? (
                    <Cloud className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <CloudOff className="h-4 w-4 text-rose-400" />
                  )
                }
                badge={
                  data ? (
                    <Badge
                      variant="outline"
                      className={
                        isHealthy
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-rose-500/30 text-rose-400"
                      }
                    >
                      {tunnelStatus}
                    </Badge>
                  ) : undefined
                }
              />
              <SummaryCard
                title="Active Routes"
                value={data?.routes.length ?? null}
                loading={loading && !data}
                icon={<Globe className="h-4 w-4 text-blue-400" />}
              />
              <SummaryCard
                title="Connectors"
                value={data?.connections.length ?? null}
                loading={loading && !data}
                icon={<Server className="h-4 w-4 text-cyan-400" />}
              />
              <SummaryCard
                title="Tunnel Name"
                value={data?.name || "—"}
                loading={loading && !data}
                icon={<Cloud className="h-4 w-4 text-orange-400" />}
                isText
              />
            </div>

            {/* Connectors */}
            {data && data.connections.length > 0 && (
              <Card className="border-slate-800 bg-slate-900">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-white">
                    Connectors
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Active cloudflared connector instances.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Colo</TableHead>
                        <TableHead className="text-slate-400">
                          Origin IP
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Opened
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.connections.map((conn) => (
                        <TableRow
                          key={conn.id}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            {conn.colo_name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {conn.origin_ip || "—"}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {timeAgo(conn.opened_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                conn.is_pending_reconnect
                                  ? "border-amber-500/30 text-amber-400"
                                  : "border-emerald-500/30 text-emerald-400"
                              }
                            >
                              {conn.is_pending_reconnect
                                ? "reconnecting"
                                : "connected"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Routes */}
            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Tunnel Routes</CardTitle>
                    <CardDescription className="text-slate-400">
                      Hostname to backend service mapping via Cloudflare Tunnel
                      ingress rules.
                    </CardDescription>
                  </div>
                  {isConfigured && (
                    <Button
                      size="sm"
                      onClick={() => setAddOpen(true)}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Route
                    </Button>
                  )}
                </div>
                {data && data.routes.length > 0 && (
                  <div className="relative mt-3 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      placeholder="Filter routes..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="border-slate-800 bg-slate-950 pl-10 text-white placeholder:text-slate-600"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {loading && !data ? (
                  <div className="space-y-3 p-6">
                    <Skeleton className="h-8 w-full bg-slate-800" />
                    <Skeleton className="h-8 w-full bg-slate-800" />
                    <Skeleton className="h-8 w-full bg-slate-800" />
                  </div>
                ) : filteredRoutes.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    {search
                      ? "No routes match your filter."
                      : "No routes configured."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">
                          Hostname
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Backend Service
                        </TableHead>
                        <TableHead className="text-slate-400">Path</TableHead>
                        <TableHead className="text-right text-slate-400">
                          Latency
                        </TableHead>
                        <TableHead className="text-right text-slate-400">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoutes.map((route) => (
                        <TableRow
                          key={route.hostname}
                          className="border-slate-800 hover:bg-slate-800/30"
                        >
                          <TableCell className="font-medium text-white">
                            <div className="flex items-center gap-2">
                              <Globe className="h-3.5 w-3.5 text-blue-400" />
                              {route.hostname}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">
                            {route.service}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {route.path || "/"}
                          </TableCell>
                          <TableCell className="text-right">
                            {route.latency_ms != null ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Timer className="h-3 w-3 text-slate-500" />
                                <span
                                  className={
                                    route.latency_ms < 200
                                      ? "text-emerald-400"
                                      : route.latency_ms < 500
                                        ? "text-amber-400"
                                        : "text-rose-400"
                                  }
                                >
                                  {route.latency_ms}ms
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteHostname(route.hostname)
                              }
                              className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Add Route Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="border-slate-800 bg-slate-900 text-white">
            <DialogHeader>
              <DialogTitle>Add Tunnel Route</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Hostname</Label>
                <Input
                  placeholder="app.example.com"
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Backend Service</Label>
                <Input
                  placeholder="http://localhost:8080"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">
                  Path{" "}
                  <span className="text-slate-500">(optional)</span>
                </Label>
                <Input
                  placeholder="/"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddOpen(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRoute}
                disabled={!newHostname || !newService}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Add Route
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteHostname}
          onOpenChange={(open) => !open && setDeleteHostname(null)}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-900 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Route</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to remove the route for{" "}
                <span className="font-medium text-white">
                  {deleteHostname}
                </span>
                ? This will update the tunnel configuration immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRoute}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Summary Card ──────────────────────────────────────────

function SummaryCard({
  title,
  value,
  loading,
  icon,
  isText,
  badge,
}: {
  title: string;
  value: number | string | null;
  loading: boolean;
  icon: React.ReactNode;
  isText?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800">
          {icon}
        </div>
        <div>
          <p className="text-xs text-slate-500">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12 bg-slate-800" />
          ) : badge ? (
            <div className="mt-1">{badge}</div>
          ) : isText ? (
            <p className="text-lg font-bold text-white">{value ?? "—"}</p>
          ) : (
            <p className="text-2xl font-bold text-white">{value ?? 0}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
