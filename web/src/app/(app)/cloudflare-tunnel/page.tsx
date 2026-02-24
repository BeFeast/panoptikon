"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCloudflareTunnelStatus,
  addCloudflareTunnelRoute,
  deleteCloudflareTunnelRoute,
  fetchSettings,
  updateSettings,
} from "@/lib/api";
import type {
  CloudflareTunnelStatus,
  TunnelRoute,
  SettingsData,
} from "@/lib/types";
import { toast } from "sonner";
import {
  Cloud,
  Plus,
  Trash2,
  RefreshCw,
  Settings,
  ArrowRight,
} from "lucide-react";

// ─── Status Badge ────────────────────────────────────────────

function TunnelStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        Unknown
      </span>
    );
  }

  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 status-glow-online" />
        Connected
      </span>
    );
  }

  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Degraded
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      Disconnected
    </span>
  );
}

// ─── Latency Badge ───────────────────────────────────────────

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) {
    return <span className="text-xs text-slate-500">—</span>;
  }

  const rounded = Math.round(ms);
  const color =
    rounded < 100
      ? "text-emerald-400"
      : rounded < 300
        ? "text-amber-400"
        : "text-rose-400";

  return <span className={`text-xs font-mono ${color}`}>{rounded} ms</span>;
}

// ─── Add Route Dialog ────────────────────────────────────────

function AddRouteDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (hostname: string, service: string, path?: string) => Promise<void>;
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
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }
    if (!service.trim()) {
      toast.error("Service URL is required");
      return;
    }
    setSaving(true);
    try {
      await onSave(hostname.trim(), service.trim(), path.trim() || undefined);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add route");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Add Tunnel Route</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Hostname</Label>
            <Input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.example.com"
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Public hostname that will route to the backend service
            </p>
          </div>
          <div>
            <Label className="text-slate-300">Backend Service</Label>
            <Input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="http://localhost:8080"
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Local service URL (e.g. http://localhost:3000, tcp://localhost:22)
            </p>
          </div>
          <div>
            <Label className="text-slate-300">Path (optional)</Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/api"
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional path prefix to match
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Adding..." : "Add Route"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings Dialog ─────────────────────────────────────────

function ConfigDialog({
  open,
  onClose,
  settings,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: SettingsData | null;
  onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [tunnelId, setTunnelId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && settings) {
      setAccountId(settings.cloudflare_account_id ?? "");
      setTunnelId(settings.cloudflare_tunnel_id ?? "");
      setApiToken("");
    }
  }, [open, settings]);

  const handleSave = async () => {
    if (!accountId.trim() || !tunnelId.trim()) {
      toast.error("Account ID and Tunnel ID are required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        cloudflare_account_id: accountId.trim(),
        cloudflare_tunnel_id: tunnelId.trim(),
      };
      if (apiToken.trim()) {
        body.cloudflare_api_token = apiToken.trim();
      }
      await updateSettings(body);
      toast.success("Cloudflare settings saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg border-slate-700 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Cloudflare Tunnel Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Account ID</Label>
            <Input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="9fab831a..."
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-slate-300">Tunnel ID</Label>
            <Input
              value={tunnelId}
              onChange={(e) => setTunnelId(e.target.value)}
              placeholder="4c8f01df-28af-42b5-..."
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-slate-300">
              API Token{" "}
              {settings?.cloudflare_api_token_set && (
                <span className="text-xs text-slate-500">(already set)</span>
              )}
            </Label>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                settings?.cloudflare_api_token_set
                  ? "Leave blank to keep current"
                  : "Enter API token"
              }
              className="mt-1 border-slate-700 bg-slate-800 text-slate-100 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Token needs &quot;Cloudflare Tunnel:Edit&quot; and &quot;Account
              Settings:Read&quot; permissions
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function CloudflareTunnelPage() {
  const [data, setData] = useState<CloudflareTunnelStatus | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [deleteHostname, setDeleteHostname] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [status, sett] = await Promise.all([
        fetchCloudflareTunnelStatus(),
        fetchSettings(),
      ]);
      setData(status);
      setSettings(sett);
    } catch {
      // Settings might fail independently
      try {
        const status = await fetchCloudflareTunnelStatus();
        setData(status);
      } catch {
        toast.error("Failed to load tunnel status");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddRoute = async (
    hostname: string,
    service: string,
    path?: string
  ) => {
    await addCloudflareTunnelRoute({ hostname, service, path });
    toast.success("Route added");
    await loadData();
  };

  const handleDeleteRoute = async () => {
    if (!deleteHostname) return;
    setDeleting(true);
    try {
      await deleteCloudflareTunnelRoute(deleteHostname);
      toast.success("Route removed");
      setDeleteHostname(null);
      await loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove route"
      );
    } finally {
      setDeleting(false);
    }
  };

  // ─── Loading State ──────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 bg-slate-800" />
            <Skeleton className="mt-2 h-4 w-48 bg-slate-800" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 bg-slate-800" />
          <Skeleton className="h-24 bg-slate-800" />
          <Skeleton className="h-24 bg-slate-800" />
        </div>
        <Skeleton className="h-64 bg-slate-800" />
      </div>
    );
  }

  // ─── Not Configured State ───────────────────────────────

  if (!data?.configured) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Cloudflare Tunnel
            </h1>
            <p className="text-slate-400">
              Manage your Cloudflare Tunnel routes and connections
            </p>
          </div>
        </div>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Cloud className="h-12 w-12 text-slate-600" />
            <div className="text-center">
              <p className="text-lg font-medium text-slate-300">
                Cloudflare Tunnel not configured
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Set your Cloudflare Account ID, Tunnel ID, and API Token to get
                started.
              </p>
            </div>
            <Button onClick={() => setShowConfig(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Configure
            </Button>
          </CardContent>
        </Card>
        <ConfigDialog
          open={showConfig}
          onClose={() => setShowConfig(false)}
          settings={settings}
          onSaved={loadData}
        />
      </div>
    );
  }

  // ─── Main View ──────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Cloudflare Tunnel</h1>
          <p className="text-slate-400">
            {data.tunnel_name ?? "Tunnel"} &middot; {data.tunnel_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="border-slate-700 text-slate-300"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig(true)}
            className="border-slate-700 text-slate-300"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button size="sm" onClick={() => setShowAddRoute(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Route
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Tunnel Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TunnelStatusBadge status={data.status} />
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Active Connectors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">
              {data.connectors.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">
              {data.routes.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Connectors */}
      {data.connectors.length > 0 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-white">Connectors</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">ID</TableHead>
                  <TableHead className="text-slate-400">Origin IP</TableHead>
                  <TableHead className="text-slate-400">Opened At</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.connectors.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-slate-800 hover:bg-slate-800/50"
                  >
                    <TableCell className="font-mono text-xs text-slate-300">
                      {c.id.substring(0, 12)}...
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {c.origin_ip ?? "—"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {c.opened_at
                        ? new Date(c.opened_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {c.is_pending_reconnect ? (
                        <span className="text-xs text-amber-400">
                          Reconnecting
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400">Active</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Active Routes */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-white">Active Routes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.routes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <p className="text-sm text-slate-500">
                No routes configured yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddRoute(true)}
                className="border-slate-700 text-slate-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add your first route
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400">Hostname</TableHead>
                  <TableHead className="text-slate-400" />
                  <TableHead className="text-slate-400">Backend</TableHead>
                  <TableHead className="text-slate-400">Path</TableHead>
                  <TableHead className="text-slate-400">Latency</TableHead>
                  <TableHead className="text-right text-slate-400">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.routes.map((route: TunnelRoute) => (
                  <TableRow
                    key={route.hostname}
                    className="border-slate-800 hover:bg-slate-800/50"
                  >
                    <TableCell className="font-medium text-blue-400">
                      {route.hostname}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      <ArrowRight className="h-4 w-4" />
                    </TableCell>
                    <TableCell className="font-mono text-sm text-slate-300">
                      {route.service}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {route.path ?? "—"}
                    </TableCell>
                    <TableCell>
                      <LatencyBadge ms={route.latency_ms} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteHostname(route.hostname)}
                        className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddRouteDialog
        open={showAddRoute}
        onClose={() => setShowAddRoute(false)}
        onSave={handleAddRoute}
      />

      <ConfigDialog
        open={showConfig}
        onClose={() => setShowConfig(false)}
        settings={settings}
        onSaved={loadData}
      />

      <AlertDialog
        open={!!deleteHostname}
        onOpenChange={(v) => !v && setDeleteHostname(null)}
      >
        <AlertDialogContent className="border-slate-700 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Route</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Remove the route for{" "}
              <strong className="text-slate-200">{deleteHostname}</strong>? This
              will update the tunnel configuration immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRoute}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
