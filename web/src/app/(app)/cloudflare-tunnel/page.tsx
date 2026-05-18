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
            <Cloud className="h-6 w-6 text-[#fbbf24]" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Cloudflare Tunnel
              </h1>
              <p className="text-sm text-mesh-text-dim">
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
              className="border-mesh-border bg-mesh-surface-1 text-mesh-text hover:bg-mesh-border-strong"
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
                className="bg-mesh-primary hover:bg-mesh-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Route
              </Button>
            )}
          </div>
        </div>

        {/* Not configured message */}
        {notConfigured && (
          <Card className="">
            <CardContent className="py-8 text-center">
              <Cloud className="mx-auto mb-4 h-12 w-12 text-mesh-text-mute" />
              <h3 className="text-lg font-medium text-mesh-text">
                Cloudflare Tunnel Not Configured
              </h3>
              <p className="mt-2 text-sm text-mesh-text-mute">
                Set your Cloudflare API token, account ID, and tunnel ID in{" "}
                <a
                  href="/settings/cloudflare-tunnel"
                  className="text-mesh-primary underline hover:text-mesh-primary"
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
            <Card className="">
              <CardHeader className="pb-2">
                <CardDescription className="text-mesh-text-dim">
                  Tunnel Status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {status.connected ? (
                    <>
                      <Wifi className="h-5 w-5 text-[#4ade80]" />
                      <span className="text-lg font-semibold text-[#4ade80]">
                        Connected
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-5 w-5 text-[#fb7185]" />
                      <span className="text-lg font-semibold text-[#fb7185]">
                        Disconnected
                      </span>
                    </>
                  )}
                </div>
                {status.tunnel_name && (
                  <p className="mt-1 text-xs text-mesh-text-mute">
                    {status.tunnel_name}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Connections */}
            <Card className="">
              <CardHeader className="pb-2">
                <CardDescription className="text-mesh-text-dim">
                  Active Connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-mesh-primary" />
                  <span className="text-lg font-semibold text-mesh-text">
                    {status.connections.length}
                  </span>
                  <span className="text-sm text-mesh-text-dim">connector(s)</span>
                </div>
                {status.connections.length > 0 && (
                  <p className="mt-1 text-xs text-mesh-text-mute">
                    Colos:{" "}
                    {status.connections
                      .map((c) => c.colo_name || "?")
                      .join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Routes */}
            <Card className="">
              <CardHeader className="pb-2">
                <CardDescription className="text-mesh-text-dim">
                  Active Routes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-[#fbbf24]" />
                  <span className="text-lg font-semibold text-mesh-text">
                    {routes.length}
                  </span>
                  <span className="text-sm text-mesh-text-dim">route(s)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Connections table */}
        {!notConfigured && status && status.connections.length > 0 && (
          <Card className="">
            <CardHeader>
              <CardTitle className="text-mesh-text">Connections</CardTitle>
              <CardDescription className="text-mesh-text-dim">
                Active cloudflared connector instances
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-mesh-border-strong hover:bg-transparent">
                    <TableHead className="text-mesh-text-dim">Colo</TableHead>
                    <TableHead className="text-mesh-text-dim">Origin IP</TableHead>
                    <TableHead className="text-mesh-text-dim">Opened</TableHead>
                    <TableHead className="text-mesh-text-dim">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.connections.map((conn, i) => (
                    <TableRow key={i} className="border-mesh-border-strong">
                      <TableCell className="font-medium text-mesh-text">
                        {conn.colo_name || "Unknown"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-mesh-text">
                        {conn.origin_ip || "N/A"}
                      </TableCell>
                      <TableCell className="text-mesh-text">
                        <span title={formatDate(conn.opened_at)}>
                          {timeAgo(conn.opened_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {conn.is_pending_reconnect ? (
                          <Badge
                            variant="outline"
                            className="border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]"
                          >
                            Reconnecting
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
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
          <Card className="">
            <CardHeader>
              <CardTitle className="text-mesh-text">Tunnel Routes</CardTitle>
              <CardDescription className="text-mesh-text-dim">
                Hostname to backend service mapping
              </CardDescription>
            </CardHeader>
            <CardContent>
              {routes.length === 0 ? (
                <div className="py-8 text-center text-sm text-mesh-text-mute">
                  No routes configured. Click &quot;Add Route&quot; to create
                  one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-mesh-border-strong hover:bg-transparent">
                      <TableHead className="text-mesh-text-dim">
                        Hostname
                      </TableHead>
                      <TableHead className="text-mesh-text-dim">
                        Backend Service
                      </TableHead>
                      <TableHead className="text-mesh-text-dim">Path</TableHead>
                      <TableHead className="w-[100px] text-mesh-text-dim">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => (
                      <TableRow key={route.hostname} className="border-mesh-border-strong">
                        <TableCell className="max-w-[200px] font-medium text-mesh-text">
                          {route.service.startsWith("http") ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://${route.hostname}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-full items-center gap-1.5 text-mesh-primary hover:text-mesh-primary hover:underline"
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
                        <TableCell className="max-w-[250px] font-mono text-sm text-mesh-text">
                          <span className="block truncate">{route.service}</span>
                        </TableCell>
                        <TableCell className="text-mesh-text-dim">
                          {route.path || "/"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-mesh-text-dim hover:text-mesh-primary"
                              onClick={() => openEditDialog(route)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-mesh-text-dim hover:text-[#fb7185]"
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
          <DialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <DialogHeader>
              <DialogTitle className="text-mesh-text">
                Add Tunnel Route
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hostname" className="text-mesh-text">
                  Hostname
                </Label>
                <Input
                  id="hostname"
                  placeholder="app.example.com"
                  value={formHostname}
                  onChange={(e) => setFormHostname(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service" className="text-mesh-text">
                  Backend Service
                </Label>
                <Input
                  id="service"
                  placeholder="http://localhost:8080"
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="path" className="text-mesh-text">
                  Path (optional)
                </Label>
                <Input
                  id="path"
                  placeholder="/"
                  value={formPath}
                  onChange={(e) => setFormPath(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                  className="border-mesh-border-strong text-mesh-text"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddRoute}
                  disabled={saving || !formHostname || !formService}
                  className="bg-mesh-primary hover:bg-mesh-primary"
                >
                  {saving ? "Adding..." : "Add Route"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Route Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <DialogHeader>
              <DialogTitle className="text-mesh-text">
                Edit Tunnel Route
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hostname" className="text-mesh-text">
                  Hostname
                </Label>
                <Input
                  id="edit-hostname"
                  placeholder="app.example.com"
                  value={editHostname}
                  onChange={(e) => setEditHostname(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-service" className="text-mesh-text">
                  Backend Service
                </Label>
                <Input
                  id="edit-service"
                  placeholder="http://localhost:8080"
                  value={editService}
                  onChange={(e) => setEditService(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-path" className="text-mesh-text">
                  Path (optional)
                </Label>
                <Input
                  id="edit-path"
                  placeholder="/"
                  value={editPath}
                  onChange={(e) => setEditPath(e.target.value)}
                  className="border-mesh-border bg-mesh-surface-1 text-mesh-text"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="border-mesh-border-strong text-mesh-text"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditRoute}
                  disabled={saving || !editHostname || !editService}
                  className="bg-mesh-primary hover:bg-mesh-primary"
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
          <AlertDialogContent className="border-mesh-border bg-mesh-surface-1/95">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-mesh-text">
                Remove Route
              </AlertDialogTitle>
              <AlertDialogDescription className="text-mesh-text-dim">
                Are you sure you want to remove the route for{" "}
                <strong className="text-mesh-text">{deleteTarget}</strong>? This
                will immediately update the tunnel configuration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-mesh-border-strong text-mesh-text">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && handleDeleteRoute(deleteTarget)}
                className="bg-[#fb7185] hover:bg-[#fb7185]"
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
