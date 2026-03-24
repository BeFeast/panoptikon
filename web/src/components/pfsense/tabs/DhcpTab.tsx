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
  fetchPfsenseDhcpPools,
  updatePfsenseDhcpPool,
  fetchPfsenseDhcpLogs,
} from "@/lib/api";
import { useData } from "@/hooks/useData";
import type { PfsenseDhcpStaticMapping, PfsenseDhcpPool } from "@/lib/types";

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

// ── Pool Configuration Sub-Tab ──────────────────────────

function PoolConfigSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpPools(), []);
  const { data: pools, loading, reload } = useData(fetcher);

  const [editPool, setEditPool] = useState<PfsenseDhcpPool | null>(null);
  const [form, setForm] = useState({
    range_start: "",
    range_end: "",
    gateway: "",
    dns_servers: "",
    domain: "",
    ntp_servers: "",
    default_lease_time: "",
    max_lease_time: "",
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (pool: PfsenseDhcpPool) => {
    setEditPool(pool);
    setForm({
      range_start: pool.range_start ?? "",
      range_end: pool.range_end ?? "",
      gateway: pool.gateway ?? "",
      dns_servers: (pool.dns_servers ?? []).join(", "),
      domain: pool.domain ?? "",
      ntp_servers: (pool.ntp_servers ?? []).join(", "),
      default_lease_time: pool.default_lease_time ?? "",
      max_lease_time: pool.max_lease_time ?? "",
    });
  };

  const handleSave = async () => {
    if (!editPool) return;
    setSaving(true);
    try {
      await updatePfsenseDhcpPool(editPool.id, {
        interface: editPool.interface,
        range_start: form.range_start || null,
        range_end: form.range_end || null,
        gateway: form.gateway || null,
        dns_servers: form.dns_servers
          ? form.dns_servers.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        domain: form.domain || null,
        ntp_servers: form.ntp_servers
          ? form.ntp_servers.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        default_lease_time: form.default_lease_time || null,
        max_lease_time: form.max_lease_time || null,
      });
      toast.success(`DHCP pool updated for ${editPool.interface}`);
      setEditPool(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update pool");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <Card className="border-slate-800 bg-slate-900" data-testid="dhcp-pool-config">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Settings className="h-4 w-4 text-blue-400" />
            Pool Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(pools ?? []).length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No DHCP pools configured
            </p>
          ) : (
            <div className="space-y-4">
              {(pools ?? []).map((pool) => (
                <div
                  key={pool.id}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                  data-testid={`dhcp-pool-${pool.interface}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {pool.interface.toUpperCase()}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          pool.enabled
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-slate-600/30 bg-slate-600/10 text-slate-500"
                        }
                      >
                        {pool.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-blue-400 hover:text-blue-300"
                      onClick={() => openEdit(pool)}
                      data-testid={`edit-pool-${pool.interface}`}
                    >
                      <Settings className="mr-1 h-3.5 w-3.5" />
                      Configure
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                    <div>
                      <span className="text-slate-500">Range: </span>
                      <span className="font-mono text-slate-300">
                        {pool.range_start && pool.range_end
                          ? `${pool.range_start} - ${pool.range_end}`
                          : "\u2014"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Gateway: </span>
                      <span className="font-mono text-slate-300">{pool.gateway ?? "\u2014"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Domain: </span>
                      <span className="text-slate-300">{pool.domain ?? "\u2014"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">DNS: </span>
                      <span className="font-mono text-slate-300">
                        {(pool.dns_servers ?? []).length > 0
                          ? pool.dns_servers.join(", ")
                          : "\u2014"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">NTP: </span>
                      <span className="font-mono text-slate-300">
                        {(pool.ntp_servers ?? []).length > 0
                          ? pool.ntp_servers.join(", ")
                          : "\u2014"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Lease: </span>
                      <span className="text-slate-300">
                        {pool.default_lease_time
                          ? `${pool.default_lease_time}s`
                          : "\u2014"}
                        {pool.max_lease_time ? ` / max ${pool.max_lease_time}s` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Pool Dialog */}
      <Dialog open={!!editPool} onOpenChange={(o) => !o && setEditPool(null)}>
        <DialogContent className="max-w-lg border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              Configure DHCP Pool — {editPool?.interface?.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Range Start</Label>
                <Input
                  placeholder="192.168.1.100"
                  value={form.range_start}
                  onChange={(e) => setForm({ ...form, range_start: e.target.value })}
                  className="border-slate-800 bg-slate-950 text-white"
                  data-testid="pool-range-start"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Range End</Label>
                <Input
                  placeholder="192.168.1.200"
                  value={form.range_end}
                  onChange={(e) => setForm({ ...form, range_end: e.target.value })}
                  className="border-slate-800 bg-slate-950 text-white"
                  data-testid="pool-range-end"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Gateway</Label>
              <Input
                placeholder="192.168.1.1"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
                data-testid="pool-gateway"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">DNS Servers (comma-separated)</Label>
              <Input
                placeholder="8.8.8.8, 8.8.4.4"
                value={form.dns_servers}
                onChange={(e) => setForm({ ...form, dns_servers: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
                data-testid="pool-dns-servers"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Domain Name</Label>
              <Input
                placeholder="example.local"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
                data-testid="pool-domain"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">NTP Servers (comma-separated)</Label>
              <Input
                placeholder="pool.ntp.org"
                value={form.ntp_servers}
                onChange={(e) => setForm({ ...form, ntp_servers: e.target.value })}
                className="border-slate-800 bg-slate-950 text-white"
                data-testid="pool-ntp-servers"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Default Lease Time (seconds)</Label>
                <Input
                  placeholder="86400"
                  value={form.default_lease_time}
                  onChange={(e) => setForm({ ...form, default_lease_time: e.target.value })}
                  className="border-slate-800 bg-slate-950 text-white"
                  data-testid="pool-default-lease"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Max Lease Time (seconds)</Label>
                <Input
                  placeholder="172800"
                  value={form.max_lease_time}
                  onChange={(e) => setForm({ ...form, max_lease_time: e.target.value })}
                  className="border-slate-800 bg-slate-950 text-white"
                  data-testid="pool-max-lease"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPool(null)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleSave}
              disabled={saving}
              data-testid="pool-save-btn"
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── DHCP Logs Sub-Tab ───────────────────────────────────

function DhcpLogsSection() {
  const fetcher = useCallback(() => fetchPfsenseDhcpLogs(), []);
  const { data: logs, loading, reload } = useData(fetcher);

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card className="border-slate-800 bg-slate-900" data-testid="dhcp-logs">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-white">
          <ScrollText className="h-4 w-4 text-blue-400" />
          DHCP Logs
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="text-slate-400 hover:text-white"
          onClick={reload}
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-y-auto">
          {(logs ?? []).length === 0 ? (
            <p className="py-8 text-center text-slate-500">
              No DHCP log entries found
            </p>
          ) : (
            <div className="space-y-1">
              {(logs ?? []).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded px-2 py-1 text-xs hover:bg-slate-800/30"
                >
                  <span className="shrink-0 font-mono text-slate-500">
                    {entry.timestamp ?? "\u2014"}
                  </span>
                  {entry.interface && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-slate-700 text-slate-400"
                    >
                      {entry.interface}
                    </Badge>
                  )}
                  <span className="font-mono text-slate-300">
                    {entry.message ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
        <TabsTrigger value="pools">Pool Config</TabsTrigger>
        <TabsTrigger value="logs">DHCP Logs</TabsTrigger>
      </TabsList>
      <TabsContent value="leases">
        <ActiveLeasesSection />
      </TabsContent>
      <TabsContent value="mappings">
        <StaticMappingsSection />
      </TabsContent>
      <TabsContent value="pools">
        <PoolConfigSection />
      </TabsContent>
      <TabsContent value="logs">
        <DhcpLogsSection />
      </TabsContent>
    </Tabs>
  );
}
