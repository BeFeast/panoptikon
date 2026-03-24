"use client";

import { useCallback, useState } from "react";
import { Server, Plus, Trash2, Settings, ScrollText, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
  fetchPfsenseDhcpLeases,
  fetchPfsenseDhcpStaticMappings,
  createPfsenseDhcpStaticMapping,
  deletePfsenseDhcpStaticMapping,
  fetchPfsenseDhcpServers,
  updatePfsenseDhcpServer,
  fetchPfsenseDhcpLogs,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseDhcpStaticMapping, PfsenseDhcpServer } from "@/lib/types";

// ── Active Leases Sub-Tab ───────────────────────────────

function ActiveLeasesSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpLeases(), []);
  const { data: leases, loading } = useData(fetcher);

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Server className="h-4 w-4 text-blue-400" />
          Active Leases
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">MAC</th>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Interface</th>
              </tr>
            </thead>
            <tbody>
              {(leases ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No active leases
                  </td>
                </tr>
              ) : (
                (leases ?? []).map((l, i) => (
                  <tr key={`${l.mac}-${i}`} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-white">{l.ip}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{l.mac}</td>
                    <td className="px-3 py-2 text-slate-300">{l.hostname ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{l.start ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-400">{l.end ?? "\u2014"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          l.status === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-slate-600/30 bg-slate-600/10 text-slate-500"
                        }
                      >
                        {l.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{l.interface}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Static Mappings Sub-Tab ─────────────────────────────

function StaticMappingsSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpStaticMappings(), []);
  const { data: mappings, loading, reload } = useData(fetcher);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PfsenseDhcpStaticMapping | null>(null);
  const [form, setForm] = useState({ mac: "", ip: "", hostname: "", description: "", interface: "lan" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPfsenseDhcpStaticMapping(form);
      toast.success("Static mapping created");
      setShowCreate(false);
      setForm({ mac: "", ip: "", hostname: "", description: "", interface: "lan" });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePfsenseDhcpStaticMapping(deleteTarget.id);
      toast.success("Static mapping deleted");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete mapping");
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Server className="h-4 w-4 text-blue-400" />
            Static Mappings
          </CardTitle>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Mapping
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">MAC</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Hostname</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Interface</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(mappings ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No static mappings
                    </td>
                  </tr>
                ) : (
                  (mappings ?? []).map((m) => (
                    <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-white">{m.mac}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{m.ip}</td>
                      <td className="px-3 py-2 text-slate-300">{m.hostname ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{m.description ?? "\u2014"}</td>
                      <td className="px-3 py-2 text-slate-400">{m.interface}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Add Static Mapping</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">MAC Address</Label>
              <Input
                placeholder="aa:bb:cc:dd:ee:ff"
                value={form.mac}
                onChange={(e) => setForm({ ...form, mac: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">IP Address</Label>
              <Input
                placeholder="192.168.1.100"
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Hostname</Label>
              <Input
                placeholder="my-device"
                value={form.hostname}
                onChange={(e) => setForm({ ...form, hostname: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Description</Label>
              <Input
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={saving || !form.mac || !form.ip}
            >
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Static Mapping</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Delete mapping for {deleteTarget?.mac} ({deleteTarget?.ip})? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-800 text-slate-400">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Server Pool Configuration Sub-Tab ───────────────────

interface ServerPoolForm {
  enabled: boolean;
  range_start: string;
  range_end: string;
  gateway: string;
  dns_servers: string;
  domain_name: string;
  ntp_servers: string;
  default_lease_time: string;
  max_lease_time: string;
}

function formFromServer(s: PfsenseDhcpServer): ServerPoolForm {
  return {
    enabled: s.enabled,
    range_start: s.range_start ?? "",
    range_end: s.range_end ?? "",
    gateway: s.gateway ?? "",
    dns_servers: (s.dns_servers ?? []).join(", "),
    domain_name: s.domain_name ?? "",
    ntp_servers: (s.ntp_servers ?? []).join(", "),
    default_lease_time: s.default_lease_time != null ? String(s.default_lease_time) : "",
    max_lease_time: s.max_lease_time != null ? String(s.max_lease_time) : "",
  };
}

function ServerPoolCard({
  server,
  onSaved,
}: {
  server: PfsenseDhcpServer;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ServerPoolForm>(() => formFromServer(server));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dnsArr = form.dns_servers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ntpArr = form.ntp_servers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await updatePfsenseDhcpServer(server.interface, {
        enabled: form.enabled,
        range_start: form.range_start || null,
        range_end: form.range_end || null,
        gateway: form.gateway || null,
        dns_servers: dnsArr,
        domain_name: form.domain_name || null,
        ntp_servers: ntpArr,
        default_lease_time: form.default_lease_time ? Number(form.default_lease_time) : null,
        max_lease_time: form.max_lease_time ? Number(form.max_lease_time) : null,
      });
      toast.success(`DHCP server for ${server.interface} updated`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update DHCP server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-white">
          <Settings className="h-4 w-4 text-blue-400" />
          {server.interface.toUpperCase()}
          <Badge
            variant="outline"
            className={
              form.enabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-slate-600/30 bg-slate-600/10 text-slate-500"
            }
          >
            {form.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardTitle>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <Label className="text-slate-300">Enable DHCP Server</Label>
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              form.enabled ? "bg-emerald-500" : "bg-slate-600"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.enabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Pool Range */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-300">IP Pool Range</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Start IP</Label>
              <Input
                placeholder="192.168.1.100"
                value={form.range_start}
                onChange={(e) => setForm({ ...form, range_start: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">End IP</Label>
              <Input
                placeholder="192.168.1.200"
                value={form.range_end}
                onChange={(e) => setForm({ ...form, range_end: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
        </div>

        {/* DHCP Options */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-300">DHCP Options</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Gateway</Label>
              <Input
                placeholder="192.168.1.1"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Domain Name</Label>
              <Input
                placeholder="example.local"
                value={form.domain_name}
                onChange={(e) => setForm({ ...form, domain_name: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">DNS Servers (comma-separated)</Label>
              <Input
                placeholder="8.8.8.8, 8.8.4.4"
                value={form.dns_servers}
                onChange={(e) => setForm({ ...form, dns_servers: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">NTP Servers (comma-separated)</Label>
              <Input
                placeholder="pool.ntp.org"
                value={form.ntp_servers}
                onChange={(e) => setForm({ ...form, ntp_servers: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
        </div>

        {/* Lease Times */}
        <div>
          <h4 className="mb-3 text-sm font-medium text-slate-300">Lease Times (seconds)</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Default Lease Time</Label>
              <Input
                type="number"
                placeholder="86400"
                value={form.default_lease_time}
                onChange={(e) => setForm({ ...form, default_lease_time: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-400 text-xs">Max Lease Time</Label>
              <Input
                type="number"
                placeholder="172800"
                value={form.max_lease_time}
                onChange={(e) => setForm({ ...form, max_lease_time: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ServerPoolsSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpServers(), []);
  const { data: servers, loading, reload } = useData(fetcher);

  if (loading) return <Skeleton className="h-48 w-full" />;

  const items = servers ?? [];

  if (items.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-8 text-center text-slate-500">
          No DHCP server scopes configured
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((s) => (
        <ServerPoolCard key={s.interface} server={s} onSaved={reload} />
      ))}
    </div>
  );
}

// ── DHCP Logs Sub-Tab ───────────────────────────────────

function DhcpLogsSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpLogs(), []);
  const { data: logs, loading } = useData(fetcher);

  if (loading) return <Skeleton className="h-48 w-full" />;

  const items = logs ?? [];

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <ScrollText className="h-4 w-4 text-blue-400" />
          DHCP Logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-slate-500">No DHCP log entries</p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 w-48">Timestamp</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-slate-400 whitespace-nowrap">
                      {entry.timestamp ?? "\u2014"}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300 break-all">
                      {entry.message ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── DHCP Tab (Orchestrator) ─────────────────────────────

export function DhcpTab() {
  return (
    <Tabs defaultValue="leases" className="w-full">
      <TabsList className="border-slate-800 bg-slate-900">
        <TabsTrigger value="leases">Active Leases</TabsTrigger>
        <TabsTrigger value="mappings">Static Mappings</TabsTrigger>
        <TabsTrigger value="pools">Pool Configuration</TabsTrigger>
        <TabsTrigger value="logs">DHCP Logs</TabsTrigger>
      </TabsList>
      <TabsContent value="leases">
        <ActiveLeasesSection />
      </TabsContent>
      <TabsContent value="mappings">
        <StaticMappingsSection />
      </TabsContent>
      <TabsContent value="pools">
        <ServerPoolsSection />
      </TabsContent>
      <TabsContent value="logs">
        <DhcpLogsSection />
      </TabsContent>
    </Tabs>
  );
}
