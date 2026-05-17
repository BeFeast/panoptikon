"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Globe,
  Server,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchCloudflareTunnelStatus,
  fetchCloudflareTunnelRoutes,
  addCloudflareTunnelRoute,
  deleteCloudflareTunnelRoute,
  updateCloudflareTunnelRoute,
} from "@/lib/api";
import type {
  CloudflareTunnelStatus,
  CloudflareTunnelRoute,
  AddCloudflareRouteRequest,
  UpdateCloudflareRouteRequest,
} from "@/lib/types";
import { toast } from "sonner";

/** Format an ISO date string into a human-friendly string. */
function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Compute relative time from an ISO date string. */
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return "just now";
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function CloudflareTunnelPage() {
  const [status, setStatus] = useState<CloudflareTunnelStatus | null>(null);
  const [routes, setRoutes] = useState<CloudflareTunnelRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for add route dialog.
  const [formHostname, setFormHostname] = useState("");
  const [formService, setFormService] = useState("");
  const [formPath, setFormPath] = useState("");

  // Edit dialog state.
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editOriginalHostname, setEditOriginalHostname] = useState("");
  const [editHostname, setEditHostname] = useState("");
  const [editService, setEditService] = useState("");
  const [editPath, setEditPath] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, routesData] = await Promise.all([
        fetchCloudflareTunnelStatus(),
        fetchCloudflareTunnelRoutes().catch(() => ({ routes: [] })),
      ]);
      setStatus(statusData);
      setRoutes(routesData.routes);
    } catch {
      // Status may still have configured: false
      setStatus(null);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleAddRoute = useCallback(async () => {
    if (!formHostname || !formService) return;
    setSaving(true);
    try {
      const body: AddCloudflareRouteRequest = {
        hostname: formHostname,
        service: formService,
      };
      if (formPath) body.path = formPath;
      const result = await addCloudflareTunnelRoute(body);
      if (result.success) {
        toast.success(result.message);
        setAddDialogOpen(false);
        setFormHostname("");
        setFormService("");
        setFormPath("");
        await load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add route");
    } finally {
      setSaving(false);
    }
  }, [formHostname, formService, formPath, load]);

  const handleDeleteRoute = useCallback(
    async (hostname: string) => {
      try {
        const result = await deleteCloudflareTunnelRoute(hostname);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
        setDeleteTarget(null);
        await load();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete route"
        );
      }
    },
    [load]
  );

  const openEditDialog = useCallback((route: CloudflareTunnelRoute) => {
    setEditOriginalHostname(route.hostname);
    setEditHostname(route.hostname);
    setEditService(route.service);
    setEditPath(route.path || "");
    setEditDialogOpen(true);
  }, []);

  const handleEditRoute = useCallback(async () => {
    if (!editHostname || !editService) return;
    setSaving(true);
    try {
      const body: UpdateCloudflareRouteRequest = {
        hostname: editHostname,
        service: editService,
      };
      if (editPath) body.path = editPath;
      const result = await updateCloudflareTunnelRoute(
        editOriginalHostname,
        body
      );
      if (result.success) {
        toast.success(result.message);
        setEditDialogOpen(false);
        await load();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update route"
      );
    } finally {
      setSaving(false);
    }
  }, [editHostname, editService, editPath, editOriginalHostname, load]);

  if (loading && !status) {
    return (
      <PageTransition>
        <div className="space-y-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-5 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </PageTransition>
    );
  }

  const notConfigured = !status?.configured;

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="h-6 w-6 text-orange-400" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Cloudflare Tunnel
              </h1>
              <p className="text-sm text-slate-400">
                Manage tunnel routes and monitor connection status
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {!notConfigured && (
              <Button
                size="sm"
                onClick={() => setAddDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            )}
          </div>
        </div>

        {/* Not configured message */}
        {notConfigured && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72">
            <CardContent className="py-8 text-center">
              <Cloud className="mx-auto mb-4 h-12 w-12 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-300">
                Cloudflare Tunnel Not Configured
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Set your Cloudflare API token, account ID, and tunnel ID in{" "}
                <a
                  href="/settings/cloudflare-tunnel"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Settings
                </a>{" "}
                to get started.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        {!notConfigured && status && (
          <div className="grid gap-5 md:grid-cols-3">
            {/* Tunnel Status */}
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Tunnel Status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {status.connected ? (
                    <>
                      <Wifi className="h-5 w-5 text-emerald-400" />
                      <span className="text-lg font-semibold text-emerald-400">
                        Connected
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-5 w-5 text-rose-400" />
                      <span className="text-lg font-semibold text-rose-400">
                        Disconnected
                      </span>
                    </>
                  )}
                </div>
                {status.tunnel_name && (
                  <p className="mt-1 text-xs text-slate-500">
                    {status.tunnel_name}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Connections */}
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Active Connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-blue-400" />
                  <span className="text-lg font-semibold text-slate-100">
                    {status.connections.length}
                  </span>
                  <span className="text-sm text-slate-400">connector(s)</span>
                </div>
                {status.connections.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Colos:{" "}
                    {status.connections
                      .map((c) => c.colo_name || "?")
                      .join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Routes */}
            <Card className="border-cyan-900/45 bg-[#0b1220]/72">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">
                  Active Routes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-orange-400" />
                  <span className="text-lg font-semibold text-slate-100">
                    {routes.length}
                  </span>
                  <span className="text-sm text-slate-400">route(s)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connections table */}
        {!notConfigured && status && status.connections.length > 0 && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72">
            <CardHeader>
              <CardTitle className="text-slate-100">Connections</CardTitle>
              <CardDescription className="text-slate-400">
                Active cloudflared connector instances
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Colo</TableHead>
                    <TableHead className="text-slate-400">Origin IP</TableHead>
                    <TableHead className="text-slate-400">Opened</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.connections.map((conn, i) => (
                    <TableRow key={i} className="border-slate-800">
                      <TableCell className="font-medium text-slate-200">
                        {conn.colo_name || "Unknown"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-300">
                        {conn.origin_ip || "N/A"}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        <span title={formatDate(conn.opened_at)}>
                          {timeAgo(conn.opened_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {conn.is_pending_reconnect ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-400"
                          >
                            Reconnecting
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          >
                            Healthy
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

        {/* Routes table */}
        {!notConfigured && (
          <Card className="border-cyan-900/45 bg-[#0b1220]/72">
            <CardHeader>
              <CardTitle className="text-slate-100">Tunnel Routes</CardTitle>
              <CardDescription className="text-slate-400">
                Hostname to backend service mapping
              </CardDescription>
            </CardHeader>
            <CardContent>
              {routes.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No routes configured. Click &quot;Add Route&quot; to create
                  one.
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
                      <TableHead className="w-[100px] text-slate-400">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => (
                      <TableRow key={route.hostname} className="border-slate-800">
                        <TableCell className="max-w-[200px] font-medium text-slate-200">
                          {route.service.startsWith("http") ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://${route.hostname}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-full items-center gap-1.5 text-blue-400 hover:text-blue-300 hover:underline"
                                  >
                                    <span className="truncate">
                                      {route.hostname}
                                    </span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{route.hostname}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="block truncate">{route.hostname}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[250px] font-mono text-sm text-slate-300">
                          <span className="block truncate">{route.service}</span>
                        </TableCell>
                        <TableCell className="text-slate-400">
                          {route.path || "/"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-blue-400"
                              onClick={() => openEditDialog(route)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-rose-400"
                              onClick={() => setDeleteTarget(route.hostname)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Add Route Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                Add Tunnel Route
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hostname" className="text-slate-300">
                  Hostname
                </Label>
                <Input
                  id="hostname"
                  placeholder="app.example.com"
                  value={formHostname}
                  onChange={(e) => setFormHostname(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service" className="text-slate-300">
                  Backend Service
                </Label>
                <Input
                  id="service"
                  placeholder="http://localhost:8080"
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="path" className="text-slate-300">
                  Path (optional)
                </Label>
                <Input
                  id="path"
                  placeholder="/"
                  value={formPath}
                  onChange={(e) => setFormPath(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddRoute}
                  disabled={saving || !formHostname || !formService}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? "Adding..." : "Add Route"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Route Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                Edit Tunnel Route
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hostname" className="text-slate-300">
                  Hostname
                </Label>
                <Input
                  id="edit-hostname"
                  placeholder="app.example.com"
                  value={editHostname}
                  onChange={(e) => setEditHostname(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-service" className="text-slate-300">
                  Backend Service
                </Label>
                <Input
                  id="edit-service"
                  placeholder="http://localhost:8080"
                  value={editService}
                  onChange={(e) => setEditService(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-path" className="text-slate-300">
                  Path (optional)
                </Label>
                <Input
                  id="edit-path"
                  placeholder="/"
                  value={editPath}
                  onChange={(e) => setEditPath(e.target.value)}
                  className="border-slate-700 bg-slate-800 text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditRoute}
                  disabled={saving || !editHostname || !editService}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent className="border-cyan-900/45 bg-[#0b1220]/72">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-100">
                Remove Route
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Are you sure you want to remove the route for{" "}
                <strong className="text-slate-200">{deleteTarget}</strong>? This
                will immediately update the tunnel configuration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-700 text-slate-300">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && handleDeleteRoute(deleteTarget)}
                className="bg-rose-600 hover:bg-rose-700"
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
