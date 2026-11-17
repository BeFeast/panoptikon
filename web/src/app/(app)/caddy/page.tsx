"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Zap,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { HelpTooltip } from "@/components/HelpTooltip";
import { EmptyState } from "@/components/EmptyState";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchCaddyStatus,
  fetchCaddyProxyHosts,
  createCaddyProxyHost,
  updateCaddyProxyHost,
  deleteCaddyProxyHost,
  toggleCaddyProxyHost,
  syncCaddyConfig,
  testCaddyConnection,
  fetchSettings,
  updateSettings,
} from "@/lib/api";
import type {
  CaddyProxyHost,
  CaddyStatus,
  SettingsData,
} from "@/lib/types";
import { toast } from "sonner";

interface CaddySettingsForm {
  adminUrl: string;
  managed: boolean;
  adminUser: string;
  adminPassword: string;
  adminListen: string;
  lanIp: string;
  adminResolveIp: string;
  gatePort: string;
  allowedRanges: string;
  acmeEmail: string;
  acmeCa: string;
  acmeZones: string;
  dnsProvider: string;
  dnsTokenEnv: string;
  dnsTokenPlaceholder: string;
  dnsResolvers: string;
  dnsPropagationDelay: string;
}

const defaultCaddySettings: CaddySettingsForm = {
  adminUrl: "http://localhost:2019",
  managed: false,
  adminUser: "",
  adminPassword: "",
  adminListen: "127.0.0.1:2019",
  lanIp: "",
  adminResolveIp: "",
  gatePort: "2019",
  allowedRanges: "",
  acmeEmail: "",
  acmeCa: "",
  acmeZones: "",
  dnsProvider: "cloudflare",
  dnsTokenEnv: "CLOUDFLARE_API_TOKEN",
  dnsTokenPlaceholder: "{env.CLOUDFLARE_API_TOKEN}",
  dnsResolvers: "1.1.1.1:53,8.8.8.8:53",
  dnsPropagationDelay: "20s",
};

function settingsForm(data: SettingsData): CaddySettingsForm {
  return {
    adminUrl: data.caddy_admin_url || defaultCaddySettings.adminUrl,
    managed: data.caddy_managed,
    adminUser: data.caddy_admin_user || "",
    adminPassword: "",
    adminListen:
      data.caddy_admin_listen || defaultCaddySettings.adminListen,
    lanIp: data.caddy_lan_ip || "",
    adminResolveIp: data.caddy_admin_resolve_ip || "",
    gatePort: String(
      data.caddy_admin_gate_port || defaultCaddySettings.gatePort,
    ),
    allowedRanges: data.caddy_admin_allowed_ranges || "",
    acmeEmail: data.caddy_acme_email || "",
    acmeCa: data.caddy_acme_ca || "",
    acmeZones: data.caddy_acme_zones || "",
    dnsProvider:
      data.caddy_dns_provider || defaultCaddySettings.dnsProvider,
    dnsTokenEnv:
      data.caddy_dns_token_env || defaultCaddySettings.dnsTokenEnv,
    dnsTokenPlaceholder:
      data.caddy_dns_token_placeholder ||
      defaultCaddySettings.dnsTokenPlaceholder,
    dnsResolvers:
      data.caddy_dns_resolvers || defaultCaddySettings.dnsResolvers,
    dnsPropagationDelay:
      data.caddy_dns_propagation_delay ||
      defaultCaddySettings.dnsPropagationDelay,
  };
}

function syncStatusLabel(status: CaddyStatus):
  | "Unmanaged"
  | "Synced"
  | "Sync failed"
  | "Locked out" {
  if (!status.managed) return "Unmanaged";
  if (status.last_sync_locked_out) return "Locked out";
  if (status.last_sync_ok === false) return "Sync failed";
  return "Synced";
}

export default function CaddyPage() {
  const [hosts, setHosts] = useState<CaddyProxyHost[] | null>(null);
  const [caddyStatus, setCaddyStatus] = useState<CaddyStatus | null>(null);
  const [search, setSearch] = useState("");
  const [editHost, setEditHost] = useState<CaddyProxyHost | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaddyProxyHost | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<CaddySettingsForm>(defaultCaddySettings);
  const [savedForm, setSavedForm] =
    useState<CaddySettingsForm>(defaultCaddySettings);
  const [passwordSet, setPasswordSet] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmGateChange, setConfirmGateChange] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statusData, hostsData, settingsData] = await Promise.all([
        fetchCaddyStatus(),
        fetchCaddyProxyHosts(),
        fetchSettings(),
      ]);
      setCaddyStatus(statusData);
      setHosts(hostsData);
      const nextForm = settingsForm(settingsData);
      setForm(nextForm);
      setSavedForm(nextForm);
      setPasswordSet(settingsData.caddy_admin_password_set);
    } catch {
      toast.error("Failed to load proxy hosts");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!hosts) return null;
    if (!search.trim()) return hosts;
    const q = search.toLowerCase();
    return hosts.filter(
      (h) =>
        h.domain.toLowerCase().includes(q) ||
        h.forward_host.toLowerCase().includes(q)
    );
  }, [hosts, search]);

  const settingsDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  );

  function setField<K extends keyof CaddySettingsForm>(
    field: K,
    value: CaddySettingsForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function refreshStatus() {
    setCaddyStatus(await fetchCaddyStatus());
  }

  async function handleToggle(host: CaddyProxyHost) {
    try {
      const updated = await toggleCaddyProxyHost(host.id, !host.enabled);
      setHosts(
        (prev) => prev?.map((h) => (h.id === updated.id ? updated : h)) ?? null
      );
      toast.success(
        `${host.domain} ${updated.enabled ? "enabled" : "disabled"}`
      );
      await refreshStatus();
    } catch {
      toast.error("Failed to toggle proxy host");
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteCaddyProxyHost(pendingDelete.id);
      setHosts(
        (prev) => prev?.filter((h) => h.id !== pendingDelete.id) ?? null
      );
      toast.success(`Deleted ${pendingDelete.domain}`);
      await refreshStatus();
    } catch {
      toast.error("Failed to delete proxy host");
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleSync(confirmed = false) {
    setSyncing(true);
    try {
      const result = await syncCaddyConfig(
        confirmed ? { confirm_gate_change: true } : {},
      );
      if (result.skipped) {
        toast.info("Sync skipped: Caddy is unmanaged");
      } else if (result.gate_change_pending) {
        setConfirmGateChange(true);
      } else if (result.ok) {
        toast.success(`Caddy config synced (${result.route_count} routes)`);
      } else if (result.locked_out) {
        toast.error(
          `Caddy loaded the config but the admin gate is unreachable: ${result.error}`,
        );
      } else {
        toast.error(`Caddy sync failed: ${result.error}`);
      }
    } catch {
      toast.error("Failed to sync config to Caddy");
    } finally {
      try {
        await refreshStatus();
      } catch {
        // The sync result remains visible even if the status refresh fails.
      }
      setSyncing(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testCaddyConnection();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      // Refresh status after test.
      const statusData = await fetchCaddyStatus();
      setCaddyStatus(statusData);
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveSettings() {
    const payload: Parameters<typeof updateSettings>[0] = {};
    if (form.adminUrl !== savedForm.adminUrl)
      payload.caddy_admin_url = form.adminUrl.trim();
    if (form.managed !== savedForm.managed)
      payload.caddy_managed = form.managed;
    if (form.adminUser !== savedForm.adminUser)
      payload.caddy_admin_user = form.adminUser.trim();
    if (form.adminPassword)
      payload.caddy_admin_password = form.adminPassword;
    if (form.adminListen !== savedForm.adminListen)
      payload.caddy_admin_listen = form.adminListen.trim();
    if (form.lanIp !== savedForm.lanIp)
      payload.caddy_lan_ip = form.lanIp.trim();
    if (form.adminResolveIp !== savedForm.adminResolveIp)
      payload.caddy_admin_resolve_ip = form.adminResolveIp.trim();
    if (form.gatePort !== savedForm.gatePort)
      payload.caddy_admin_gate_port = Number(form.gatePort);
    if (form.allowedRanges !== savedForm.allowedRanges)
      payload.caddy_admin_allowed_ranges = form.allowedRanges.trim();
    if (form.acmeEmail !== savedForm.acmeEmail)
      payload.caddy_acme_email = form.acmeEmail.trim();
    if (form.acmeCa !== savedForm.acmeCa)
      payload.caddy_acme_ca = form.acmeCa.trim();
    if (form.acmeZones !== savedForm.acmeZones)
      payload.caddy_acme_zones = form.acmeZones.trim();
    if (form.dnsProvider !== savedForm.dnsProvider)
      payload.caddy_dns_provider = form.dnsProvider;
    if (form.dnsTokenEnv !== savedForm.dnsTokenEnv)
      payload.caddy_dns_token_env = form.dnsTokenEnv.trim();
    if (form.dnsTokenPlaceholder !== savedForm.dnsTokenPlaceholder)
      payload.caddy_dns_token_placeholder = form.dnsTokenPlaceholder.trim();
    if (form.dnsResolvers !== savedForm.dnsResolvers)
      payload.caddy_dns_resolvers = form.dnsResolvers.trim();
    if (form.dnsPropagationDelay !== savedForm.dnsPropagationDelay)
      payload.caddy_dns_propagation_delay =
        form.dnsPropagationDelay.trim();

    setSavingSettings(true);
    try {
      const settings = await updateSettings(payload);
      const nextForm = settingsForm(settings);
      setForm(nextForm);
      setSavedForm(nextForm);
      setPasswordSet(settings.caddy_admin_password_set);
      toast.success("Caddy settings saved");
    } catch {
      toast.error("Failed to save Caddy settings");
    } finally {
      setSavingSettings(false);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditHost(null);
    load();
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="t-h1 text-white">Caddy Reverse Proxy</h1>
            <HelpTooltip text="Manage reverse-proxy hosts that Caddy serves. Add domains, point them to internal services, and enable automatic HTTPS." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {caddyStatus && (
              <Badge
                data-testid="caddy-sync-status"
                variant="outline"
                title={
                  [caddyStatus.last_sync_at, caddyStatus.last_sync_error]
                    .filter(Boolean)
                    .join(" — ") || undefined
                }
                className={
                  syncStatusLabel(caddyStatus) === "Synced"
                    ? "border-[#4ade80]/30 text-[#4ade80]"
                    : syncStatusLabel(caddyStatus) === "Unmanaged"
                      ? "border-mesh-border-strong text-mesh-text-mute"
                      : "border-[#fb7185]/30 text-[#fb7185]"
                }
              >
                {syncStatusLabel(caddyStatus) === "Synced" ? (
                  <CheckCircle className="mr-1 h-3 w-3" />
                ) : (
                  <AlertCircle className="mr-1 h-3 w-3" />
                )}
                {syncStatusLabel(caddyStatus)}
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test Connection
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Verify that Panoptikon can reach the Caddy admin API
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSync()}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sync to Caddy
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Push current proxy host configuration to the Caddy reverse proxy
              </TooltipContent>
            </Tooltip>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Host
            </Button>
          </div>
        </div>

        {/* Production ownership and admin gate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-white">
              Caddy Admin API &amp; TLS Policy
            </CardTitle>
            <CardDescription className="text-xs text-mesh-text-mute">
              Atomic full-config ownership for a dedicated LAN Caddy. Bootstrap
              the authenticated gate before enabling managed mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-md border border-mesh-border-strong bg-mesh-surface-1/40 px-3 py-2.5">
              <div>
                <Label htmlFor="caddy-managed" className="text-sm text-white">
                  Managed configuration
                </Label>
                <p className="mt-0.5 text-xs text-mesh-text-mute">
                  Enables startup and mutation pushes using atomic POST /load.
                </p>
              </div>
              <Switch
                id="caddy-managed"
                checked={form.managed}
                onCheckedChange={(value) => setField("managed", value)}
              />
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mesh-primary">
                Authenticated admin gate
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="admin-url" className="text-xs text-mesh-text-dim">
                  Admin URL
                </Label>
                <Input
                  id="admin-url"
                    value={form.adminUrl}
                    onChange={(event) =>
                      setField("adminUrl", event.target.value)
                    }
                    placeholder="https://caddy-admin.example.com:2019"
                />
              </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-admin-user"
                    className="text-xs text-mesh-text-dim"
                  >
                    Basic auth user
                  </Label>
                  <Input
                    id="caddy-admin-user"
                    value={form.adminUser}
                    onChange={(event) =>
                      setField("adminUser", event.target.value)
                    }
                    placeholder="panoptikon"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-admin-password"
                    className="text-xs text-mesh-text-dim"
                  >
                    Basic auth password
                  </Label>
                  <Input
                    id="caddy-admin-password"
                    type="password"
                    value={form.adminPassword}
                    onChange={(event) =>
                      setField("adminPassword", event.target.value)
                    }
                    placeholder={passwordSet ? "•••••• (set)" : "Set a password"}
                    autoComplete="new-password"
                  />
                  <p className="text-[11px] text-mesh-text-mute">
                    Rotating credentials or gate fields requires an explicit,
                    confirmed sync and recovery access to loopback Caddy.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-admin-listen"
                    className="text-xs text-mesh-text-dim"
                  >
                    Real admin listener
                  </Label>
                  <Input
                    id="caddy-admin-listen"
                    value={form.adminListen}
                    onChange={(event) =>
                      setField("adminListen", event.target.value)
                    }
                    placeholder="127.0.0.1:2019"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-lan-ip"
                    className="text-xs text-mesh-text-dim"
                  >
                    Caddy LAN IP
                  </Label>
                  <Input
                    id="caddy-lan-ip"
                    value={form.lanIp}
                    onChange={(event) => setField("lanIp", event.target.value)}
                    placeholder="10.10.0.32"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-admin-resolve-ip"
                    className="text-xs text-mesh-text-dim"
                  >
                    Admin hostname resolve IP
                  </Label>
                  <Input
                    id="caddy-admin-resolve-ip"
                    value={form.adminResolveIp}
                    onChange={(event) =>
                      setField("adminResolveIp", event.target.value)
                    }
                    placeholder="Defaults to Caddy LAN IP"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-admin-gate-port"
                    className="text-xs text-mesh-text-dim"
                  >
                    Gate port
                  </Label>
                  <Input
                    id="caddy-admin-gate-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.gatePort}
                    onChange={(event) =>
                      setField("gatePort", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label
                    htmlFor="caddy-admin-allowed-ranges"
                    className="text-xs text-mesh-text-dim"
                  >
                    Allowed source CIDRs
                  </Label>
                  <Textarea
                    id="caddy-admin-allowed-ranges"
                    value={form.allowedRanges}
                    onChange={(event) =>
                      setField("allowedRanges", event.target.value)
                    }
                    placeholder="10.10.0.22/32,10.10.0.32/32,127.0.0.1/32"
                    className="min-h-16 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-mesh-border-strong pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mesh-primary">
                DNS-01 certificate automation
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-acme-email"
                    className="text-xs text-mesh-text-dim"
                  >
                    ACME email
                  </Label>
                  <Input
                    id="caddy-acme-email"
                    type="email"
                    value={form.acmeEmail}
                    onChange={(event) =>
                      setField("acmeEmail", event.target.value)
                    }
                    placeholder="ops@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-acme-ca"
                    className="text-xs text-mesh-text-dim"
                  >
                    ACME directory override
                  </Label>
                  <Input
                    id="caddy-acme-ca"
                    value={form.acmeCa}
                    onChange={(event) => setField("acmeCa", event.target.value)}
                    placeholder="Leave empty for Let's Encrypt production"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label
                    htmlFor="caddy-acme-zones"
                    className="text-xs text-mesh-text-dim"
                  >
                    Allowed ACME zones
                  </Label>
                  <Input
                    id="caddy-acme-zones"
                    value={form.acmeZones}
                    onChange={(event) =>
                      setField("acmeZones", event.target.value)
                    }
                    placeholder="example.com,example.net"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-dns-provider"
                    className="text-xs text-mesh-text-dim"
                  >
                    DNS provider
                  </Label>
                  <Select
                    value={form.dnsProvider}
                    onValueChange={(value) => setField("dnsProvider", value)}
                  >
                    <SelectTrigger id="caddy-dns-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloudflare">cloudflare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-dns-token-env"
                    className="text-xs text-mesh-text-dim"
                  >
                    Token environment name
                  </Label>
                  <Input
                    id="caddy-dns-token-env"
                    value={form.dnsTokenEnv}
                    onChange={(event) =>
                      setField("dnsTokenEnv", event.target.value)
                    }
                    placeholder="CLOUDFLARE_API_TOKEN"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label
                    htmlFor="caddy-dns-token-placeholder"
                    className="text-xs text-mesh-text-dim"
                  >
                    Token placeholder
                  </Label>
                  <Input
                    id="caddy-dns-token-placeholder"
                    value={form.dnsTokenPlaceholder}
                    onChange={(event) =>
                      setField("dnsTokenPlaceholder", event.target.value)
                    }
                    placeholder="{file./etc/caddy/cf_token}"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-mesh-text-mute">
                    Panoptikon sends only this literal Caddy placeholder, never
                    the Cloudflare token itself.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-dns-resolvers"
                    className="text-xs text-mesh-text-dim"
                  >
                    Public DNS resolvers
                  </Label>
                  <Input
                    id="caddy-dns-resolvers"
                    value={form.dnsResolvers}
                    onChange={(event) =>
                      setField("dnsResolvers", event.target.value)
                    }
                    placeholder="1.1.1.1:53,8.8.8.8:53"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="caddy-dns-propagation-delay"
                    className="text-xs text-mesh-text-dim"
                  >
                    Propagation delay
                  </Label>
                  <Input
                    id="caddy-dns-propagation-delay"
                    value={form.dnsPropagationDelay}
                    onChange={(event) =>
                      setField("dnsPropagationDelay", event.target.value)
                    }
                    placeholder="20s"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-mesh-border-strong pt-4">
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={savingSettings || !settingsDirty}
              >
                {savingSettings && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
          <Input
            placeholder="Filter by domain or upstream..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-mesh-border-strong hover:bg-transparent">
                  <TableHead className="text-mesh-text-dim">Domain</TableHead>
                  <TableHead className="text-mesh-text-dim">Upstream</TableHead>
                  <TableHead className="text-mesh-text-dim">TLS</TableHead>
                  <TableHead className="text-mesh-text-dim">Status</TableHead>
                  <TableHead className="text-right text-mesh-text-dim">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered === null ? (
                  // Loading skeleton
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-mesh-border-strong">
                      <TableCell>
                        <Skeleton className="h-4 w-40 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16 bg-mesh-surface-1" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20 bg-mesh-surface-1" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow className="border-mesh-border-strong hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="py-12 text-center"
                    >
                      {search ? (
                        <span className="text-mesh-text-mute">No hosts match your filter.</span>
                      ) : (
                        <EmptyState
                          icon={Globe}
                          title="No proxy hosts configured yet"
                          description="Click &quot;Add Host&quot; to create your first reverse-proxy entry. Make sure the Caddy admin URL is set above."
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((host) => (
                    <TableRow
                      key={host.id}
                      className="border-mesh-border-strong hover:bg-mesh-surface-2/55"
                    >
                      <TableCell className="font-medium text-white">
                        <a
                          href={`https://${host.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-mesh-primary"
                        >
                          {host.domain}
                        </a>
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {host.forward_scheme}://{host.forward_host}:
                        {host.forward_port}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            host.tls_enabled
                              ? "border-[#4ade80]/30 text-[#4ade80]"
                              : "border-mesh-border-strong text-mesh-text-mute"
                          }
                        >
                          {host.tls_enabled ? "HTTPS" : "HTTP"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={host.enabled}
                          onCheckedChange={() => handleToggle(host)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditHost(host)}
                            className="h-8 w-8 p-0 text-mesh-text-dim hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(host)}
                            className="h-8 w-8 p-0 text-mesh-text-dim hover:text-[#fb7185]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <ProxyHostFormDialog
          open={showAdd || editHost !== null}
          onOpenChange={(open) => {
            if (!open) {
              setShowAdd(false);
              setEditHost(null);
            }
          }}
          existing={editHost}
          onSaved={handleSaved}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete Proxy Host
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-medium text-white">
                  {pendingDelete?.domain}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={confirmGateChange}
          onOpenChange={setConfirmGateChange}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Push admin gate change?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Admin gate settings changed since the last sync. Pushing a
                wrong gate can lock Panoptikon out of Caddy. Push anyway?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirmGateChange(false);
                  void handleSync(true);
                }}
              >
                Push anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Add/Edit Form Dialog ───────────────────────────────────

function ProxyHostFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: CaddyProxyHost | null;
  onSaved: () => void;
}) {
  const isEdit = existing !== null;
  const [domain, setDomain] = useState("");
  const [forwardHost, setForwardHost] = useState("");
  const [forwardPort, setForwardPort] = useState("80");
  const [forwardScheme, setForwardScheme] = useState("http");
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (existing) {
        setDomain(existing.domain);
        setForwardHost(existing.forward_host);
        setForwardPort(String(existing.forward_port));
        setForwardScheme(existing.forward_scheme);
        setTlsEnabled(existing.tls_enabled);
      } else {
        setDomain("");
        setForwardHost("");
        setForwardPort("80");
        setForwardScheme("http");
        setTlsEnabled(false);
      }
      setFormError(null);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!domain.trim()) {
      setFormError("Domain is required");
      return;
    }
    if (!forwardHost.trim()) {
      setFormError("Forward host is required");
      return;
    }
    const port = parseInt(forwardPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setFormError("Port must be between 1 and 65535");
      return;
    }

    setLoading(true);
    try {
      const body = {
        domain: domain.trim(),
        forward_host: forwardHost.trim(),
        forward_port: port,
        forward_scheme: forwardScheme,
        tls_enabled: tlsEnabled,
      };
      if (isEdit) {
        await updateCaddyProxyHost(existing.id, body);
        toast.success(`Updated ${body.domain}`);
      } else {
        await createCaddyProxyHost(body);
        toast.success(`Created ${body.domain}`);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save proxy host"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Proxy Host" : "Add Proxy Host"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="domain" className="text-xs text-mesh-text-dim">
              Domain
            </Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-scheme"
                className="text-xs text-mesh-text-dim"
              >
                Scheme
              </Label>
              <Select
                value={forwardScheme}
                onValueChange={setForwardScheme}
              >
                <SelectTrigger id="forward-scheme" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="https">https</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-host"
                className="text-xs text-mesh-text-dim"
              >
                Host
              </Label>
              <Input
                id="forward-host"
                value={forwardHost}
                onChange={(e) => setForwardHost(e.target.value)}
                placeholder="10.0.0.5"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label
                htmlFor="forward-port"
                className="text-xs text-mesh-text-dim"
              >
                Port
              </Label>
              <Input
                id="forward-port"
                type="number"
                min={1}
                max={65535}
                value={forwardPort}
                onChange={(e) => setForwardPort(e.target.value)}
                placeholder="80"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="tls-enabled"
              checked={tlsEnabled}
              onCheckedChange={setTlsEnabled}
            />
            <Label htmlFor="tls-enabled" className="text-sm text-mesh-text">
              Enable TLS (auto HTTPS via Caddy)
            </Label>
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#fb7185]" />
              <p className="text-xs text-[#fb7185]">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
