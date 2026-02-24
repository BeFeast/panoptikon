"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  fetchTunnelStatus,
  addTunnelRoute,
  removeTunnelRoute,
} from "@/lib/api";
import type {
  TunnelStatusResponse,
  TunnelRoute,
  AddTunnelRouteRequest,
} from "@/lib/types";
import { toast } from "sonner";

export default function CloudflareTunnelPage() {
  const [data, setData] = useState<TunnelStatusResponse | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TunnelRoute | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchTunnelStatus();
      setData(result);
    } catch {
      toast.error("Failed to load tunnel status");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleAdd = async (body: AddTunnelRouteRequest) => {
    try {
      const result = await addTunnelRoute(body);
      if (result.success) {
        toast.success(result.message);
        setShowAddDialog(false);
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(`Failed to add route: ${err}`);
    }
  };

  const handleRemove = async () => {
    if (!pendingRemove?.hostname) return;
    try {
      const result = await removeTunnelRoute(pendingRemove.hostname);
      if (result.success) {
        toast.success(result.message);
        setPendingRemove(null);
        load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(`Failed to remove route: ${err}`);
    }
  };

  // Separate named routes from the catch-all.
  const namedRoutes =
    data?.routes.filter((r) => r.hostname !== null) ?? [];
  const catchAll =
    data?.routes.find((r) => r.hostname === null) ?? null;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Cloudflare Tunnel
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your Cloudflare Tunnel routes and monitor status
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {data?.configured && (
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {data === null && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {/* Not configured state */}
        {data !== null && !data.configured && (
          <Card>
            <CardContent className="py-12 text-center">
              <Cloud className="mx-auto mb-4 h-12 w-12 text-slate-500" />
              <h2 className="text-lg font-semibold">
                Cloudflare Tunnel not configured
              </h2>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Configure your Cloudflare API token, account ID, and tunnel ID
                in Settings to manage your tunnel routes.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Configured state */}
        {data !== null && data.configured && (
          <>
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tunnel Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Tunnel Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TunnelStatusBadge status={data.status} />
                  </div>
                  {data.tunnel_name && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {data.tunnel_name}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Connections */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Connections
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.connections.length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Active connectors
                  </p>
                </CardContent>
              </Card>

              {/* Routes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Active Routes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {namedRoutes.length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hostname mappings
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Connector Details */}
            {data.connections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Connector Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Connector ID</TableHead>
                        <TableHead>Origin IP</TableHead>
                        <TableHead>Colo</TableHead>
                        <TableHead>Opened At</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.connections.map((conn) => (
                        <TableRow key={conn.id}>
                          <TableCell className="font-mono text-xs">
                            {conn.id.slice(0, 12)}...
                          </TableCell>
                          <TableCell>{conn.origin_ip ?? "—"}</TableCell>
                          <TableCell>{conn.colo_name ?? "—"}</TableCell>
                          <TableCell>
                            {conn.opened_at
                              ? timeAgo(conn.opened_at)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {conn.is_pending_reconnect ? (
                              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                                <AlertCircle className="mr-1 h-3 w-3" />
                                Reconnecting
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Connected
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Routes Table */}
            <Card>
              <CardHeader>
                <CardTitle>Ingress Routes</CardTitle>
              </CardHeader>
              <CardContent>
                {namedRoutes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No routes configured yet. Add a route to get started.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hostname</TableHead>
                        <TableHead></TableHead>
                        <TableHead>Backend Service</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Latency</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {namedRoutes.map((route, idx) => (
                        <TableRow key={route.hostname ?? idx}>
                          <TableCell className="font-medium">
                            {route.hostname}
                          </TableCell>
                          <TableCell>
                            <ArrowRight className="h-4 w-4 text-slate-500" />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {route.service}
                          </TableCell>
                          <TableCell>
                            {route.path ?? "—"}
                          </TableCell>
                          <TableCell>
                            {route.latency_ms !== null
                              ? `${route.latency_ms}ms`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPendingRemove(route)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Catch-all route */}
                {catchAll && (
                  <div className="mt-4 rounded-md border border-dashed border-slate-700 p-3 text-sm text-slate-500">
                    Catch-all: <span className="font-mono">{catchAll.service}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Add Route Dialog */}
        <AddRouteDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSave={handleAdd}
        />

        {/* Remove Confirmation */}
        <AlertDialog
          open={pendingRemove !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Tunnel Route?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the route for{" "}
                <strong>{pendingRemove?.hostname}</strong>? Traffic to this
                hostname will no longer be routed through the tunnel.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemove}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ── Helper Components ──────────────────────────────────────

function TunnelStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "healthy":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <CheckCircle className="mr-1 h-3 w-3" /> Connected
        </Badge>
      );
    case "inactive":
    case "down":
      return (
        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
          <XCircle className="mr-1 h-3 w-3" /> Disconnected
        </Badge>
      );
    case "degraded":
      return (
        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
          <AlertCircle className="mr-1 h-3 w-3" /> Degraded
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
          <XCircle className="mr-1 h-3 w-3" /> Error
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">
          <AlertCircle className="mr-1 h-3 w-3" /> {status ?? "Unknown"}
        </Badge>
      );
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function AddRouteDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (body: AddTunnelRouteRequest) => Promise<void>;
}) {
  const [hostname, setHostname] = useState("");
  const [service, setService] = useState("");
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setHostname("");
      setService("");
      setPath("");
      setSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        hostname,
        service,
        path: path || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tunnel Route</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Hostname</Label>
            <Input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Public hostname that will route through the tunnel
            </p>
          </div>
          <div>
            <Label>Backend Service</Label>
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="http://localhost:8080"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Local service URL (e.g. http://localhost:3000, tcp://localhost:22)
            </p>
          </div>
          <div>
            <Label>Path (optional)</Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api/*"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !hostname || !service}
            >
              {saving ? "Adding..." : "Add Route"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
