"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHashTab } from "@/hooks/useHashTab";
import {
  Router,
  Network,
  Globe,
  Shield,
  Server,
  AlertCircle,
  Activity,
  Lock,
  Search,
  Cpu,
  Clock,
  MemoryStick,
  Monitor,
  HardDrive,
  Layers,
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  Power,
  List,
  Pin,
  GitFork,
  Waypoints,
  HeartPulse,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Timer,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoStatCard } from "@/components/ui/info-stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  fetchMikrotikStatus,
  fetchMikrotikInterfaces,
  fetchMikrotikVlans,
  fetchMikrotikRoutes,
  fetchMikrotikDhcpLeases,
  fetchMikrotikFirewall,
  fetchMikrotikDns,
  fetchMikrotikWireguard,
  createMikrotikVlan,
  updateMikrotikVlan,
  deleteMikrotikVlan,
  createMikrotikFirewallFilter,
  updateMikrotikFirewallFilter,
  deleteMikrotikFirewallFilter,
  toggleMikrotikFirewallFilter,
  createMikrotikFirewallNat,
  updateMikrotikFirewallNat,
  deleteMikrotikFirewallNat,
  toggleMikrotikFirewallNat,
  createMikrotikAddressList,
  updateMikrotikAddressList,
  deleteMikrotikAddressList,
  toggleMikrotikAddressList,
  moveMikrotikFirewallFilter,
  createMikrotikDhcpStaticMapping,
  fetchMikrotikDhcpServers,
  updateMikrotikDhcpServer,
  fetchMikrotikDhcpNetworks,
  createMikrotikDhcpNetwork,
  updateMikrotikDhcpNetwork,
  deleteMikrotikDhcpNetwork,
  fetchMikrotikDhcpPools,
  createMikrotikDhcpPool,
  updateMikrotikDhcpPool,
  deleteMikrotikDhcpPool,
  fetchMikrotikDhcpLogs,
  fetchTrafficHistory,
  fetchMikrotikMangleRules,
  createMikrotikMangleRule,
  deleteMikrotikMangleRule,
  fetchMikrotikRoutingRules,
  createMikrotikRoutingRule,
  deleteMikrotikRoutingRule,
  fetchMikrotikRoutingTables,
  fetchMikrotikNetwatch,
  createMikrotikNetwatch,
  deleteMikrotikNetwatch,
  fetchMikrotikDynamicRouting,
  fetchMikrotikIpv6Nd,
} from "@/lib/api";
import { formatBps } from "@/lib/format";
import { useData } from "@/hooks/useData";
import type {
  MikrotikStatus,
  MikrotikInterface,
  MikrotikVlan,
  MikrotikVlanRequest,
  MikrotikRoute,
  MikrotikDhcpLease,
  MikrotikFirewall,
  MikrotikFirewallRule,
  MikrotikMangleRule,
  MikrotikRoutingRule,
  MikrotikRoutingTable,
  MikrotikNetwatchEntry,
  MikrotikDynamicRouting,
  MikrotikIpv6Nd,
  MikrotikNatRule,
  MikrotikAddressListEntry,
  MikrotikFirewallFilterRequest,
  MikrotikFirewallNatRequest,
  MikrotikAddressListRequest,
  MikrotikDns,
  MikrotikWireguard,
  TrafficHistoryPoint,
  MikrotikDhcpServer,
  MikrotikDhcpNetwork,
  MikrotikDhcpNetworkRequest,
  MikrotikIpPool,
  MikrotikIpPoolRequest,
  MikrotikDhcpLogEntry,
} from "@/lib/types";

function formatBytes(bytes: string | null): string {
  if (!bytes) return "\u2014";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatMemory(bytes: string | null): string {
  if (!bytes) return "\u2014";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

// ── Generic data loader hook (extracted to hooks/useData.ts) ──

// ── Status Header ─────────────────────────────────────────

function StatusHeader({ status }: { status: MikrotikStatus }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10">
          <Router className="h-5 w-5 text-pink-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">MikroTik Router</h1>
          <p className="text-xs text-slate-500">
            {status.board_name ?? "RouterOS"}{" "}
            {status.version && (
              <span className="text-slate-600">&middot; RouterOS {status.version}</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status.reachable ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            &#9679; Connected
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 bg-rose-500/10 text-rose-400"
          >
            &#9679; Unreachable
          </Badge>
        )}
        {status.uptime && (
          <Badge variant="outline" className="border-slate-800 text-slate-400">
            Uptime: {status.uptime}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────

function SystemTab({ status }: { status: MikrotikStatus }) {
  const memUsed =
    status.free_memory && status.total_memory
      ? String(parseInt(status.total_memory) - parseInt(status.free_memory))
      : null;

  const platformValue = [
    status.platform ?? "\u2014",
    status.architecture ? `(${status.architecture})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <InfoStatCard
        icon={<Monitor className="h-5 w-5 text-pink-400" />}
        iconColorClass="bg-pink-500/10"
        label="Version"
        value={status.version ?? "\u2014"}
      />
      <InfoStatCard
        icon={<Clock className="h-5 w-5 text-emerald-400" />}
        iconColorClass="bg-emerald-500/10"
        label="Uptime"
        value={status.uptime ?? "\u2014"}
      />
      <InfoStatCard
        icon={<Cpu className="h-5 w-5 text-amber-400" />}
        iconColorClass="bg-amber-500/10"
        label="CPU Load"
        value={status.cpu_load ? `${status.cpu_load}%` : "\u2014"}
      />
      <InfoStatCard
        icon={<MemoryStick className="h-5 w-5 text-purple-400" />}
        iconColorClass="bg-purple-500/10"
        label="Memory"
        value={
          memUsed
            ? `${formatMemory(memUsed)} / ${formatMemory(status.total_memory)}`
            : "\u2014"
        }
      />
      <InfoStatCard
        icon={<HardDrive className="h-5 w-5 text-cyan-400" />}
        iconColorClass="bg-cyan-500/10"
        label="Platform"
        value={platformValue}
      />
      <InfoStatCard
        icon={<Server className="h-5 w-5 text-blue-400" />}
        iconColorClass="bg-blue-500/10"
        label="Board"
        value={status.board_name ?? "\u2014"}
      />
    </div>
  );
}

// ── Interfaces Table ──────────────────────────────────────

function InterfacesTable({
  data,
  loading,
  error,
}: {
  data: MikrotikInterface[] | null;
  loading: boolean;
  error: string | null;
}) {
  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
      <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
      <th className="px-4 py-3 font-medium text-slate-400">Type</th>
      <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">MAC</th>
      <th className="px-4 py-3 font-medium text-slate-400">MTU</th>
      <th className="px-4 py-3 font-medium text-slate-400">TX</th>
      <th className="px-4 py-3 font-medium text-slate-400">RX</th>
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Skeleton className="h-2.5 w-2.5 rounded-full" /><Skeleton className="h-5 w-10 rounded-full" /></div></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No interfaces found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((iface) => (
            <tr
              key={iface.name}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      iface.running
                        ? "bg-emerald-400"
                        : iface.disabled
                          ? "bg-slate-600"
                          : "bg-amber-400"
                    }`}
                  />
                  <Badge
                    variant="outline"
                    className={
                      iface.running
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                        : "border-slate-700 text-slate-500 text-xs"
                    }
                  >
                    {iface.running ? "up" : iface.disabled ? "disabled" : "down"}
                  </Badge>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {iface.name}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400">{iface.iface_type ?? "\u2014"}</span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {iface.ip_address ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {iface.mac ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-300">{iface.mtu ?? "\u2014"}</span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {formatBytes(iface.tx_bytes)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {formatBytes(iface.rx_bytes)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type VlanFormState = {
  vlan_id: string;
  name: string;
  interface: string;
  mtu: string;
};

const EMPTY_VLAN_FORM: VlanFormState = {
  vlan_id: "",
  name: "",
  interface: "",
  mtu: "",
};

function vlanToForm(vlan: MikrotikVlan): VlanFormState {
  return {
    vlan_id: vlan.vlan_id ?? "",
    name: vlan.name ?? "",
    interface: vlan.interface ?? "",
    mtu: vlan.mtu ?? "",
  };
}

function VlansPanel({
  data,
  loading,
  error,
  reload,
}: {
  data: MikrotikVlan[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const [form, setForm] = useState<VlanFormState>(EMPTY_VLAN_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MikrotikVlan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MikrotikVlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_VLAN_FORM);
    setDialogOpen(true);
  };

  const openEdit = (vlan: MikrotikVlan) => {
    setEditing(vlan);
    setForm(vlanToForm(vlan));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const vlanId = Number(form.vlan_id.trim());
    if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
      toast.error("VLAN ID must be an integer between 1 and 4094.");
      return;
    }

    const name = form.name.trim();
    const iface = form.interface.trim();
    if (!name || !iface) {
      toast.error("Name and interface are required.");
      return;
    }

    let mtu: number | null = null;
    const mtuValue = form.mtu.trim();
    if (mtuValue) {
      const parsedMtu = Number(mtuValue);
      if (!Number.isInteger(parsedMtu) || parsedMtu <= 0) {
        toast.error("MTU must be a positive integer.");
        return;
      }
      mtu = parsedMtu;
    }

    const payload: MikrotikVlanRequest = {
      vlan_id: vlanId,
      name,
      interface: iface,
      mtu,
    };

    setSaving(true);
    try {
      if (editing) {
        if (!editing.id) {
          toast.error("Missing VLAN id for update.");
          return;
        }
        await updateMikrotikVlan(editing.id, payload);
        toast.success(`VLAN ${name} updated.`);
      } else {
        await createMikrotikVlan(payload);
        toast.success(`VLAN ${name} created.`);
      }

      await reload();
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_VLAN_FORM);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save VLAN.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (!confirmDelete.id) {
      toast.error("Missing VLAN id for delete.");
      setConfirmDelete(null);
      return;
    }

    setDeleting(true);
    try {
      await deleteMikrotikVlan(confirmDelete.id);
      await reload();
      toast.success(`VLAN ${confirmDelete.name ?? confirmDelete.vlan_id ?? ""} deleted.`);
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete VLAN.");
    } finally {
      setDeleting(false);
    }
  };

  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">VLAN ID</th>
      <th className="px-4 py-3 font-medium text-slate-400">Name</th>
      <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
      <th className="px-4 py-3 font-medium text-slate-400">MTU</th>
      <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={openCreate}
          className="bg-pink-600 text-white hover:bg-pink-700"
          size="sm"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add VLAN
        </Button>
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>{headerCols}</thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="ml-auto flex w-fit items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      ) : !data || data.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">No VLAN interfaces configured.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>{headerCols}</thead>
            <tbody>
              {data.map((vlan, idx) => (
                <tr
                  key={vlan.id ?? `${vlan.name ?? "vlan"}-${vlan.vlan_id ?? idx}`}
                  className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums font-medium text-white">
                      {vlan.vlan_id ?? "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-300">{vlan.name ?? "\u2014"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono tabular-nums text-slate-300">
                      {vlan.interface ?? "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-300">{vlan.mtu ?? "\u2014"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                        onClick={() => openEdit(vlan)}
                        disabled={!vlan.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => setConfirmDelete(vlan)}
                        disabled={!vlan.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setForm(EMPTY_VLAN_FORM);
          }
        }}
      >
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editing ? "Edit VLAN" : "Create VLAN"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure a VLAN interface on your MikroTik router.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vlan-id">VLAN ID</Label>
              <Input
                id="vlan-id"
                value={form.vlan_id}
                onChange={(e) => setForm((prev) => ({ ...prev, vlan_id: e.target.value }))}
                placeholder="10"
                inputMode="numeric"
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlan-name">Name</Label>
              <Input
                id="vlan-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="vlan10-office"
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlan-interface">Interface</Label>
              <Input
                id="vlan-interface"
                value={form.interface}
                onChange={(e) => setForm((prev) => ({ ...prev, interface: e.target.value }))}
                placeholder="bridge"
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlan-mtu">MTU (optional)</Label>
              <Input
                id="vlan-mtu"
                value={form.mtu}
                onChange={(e) => setForm((prev) => ({ ...prev, mtu: e.target.value }))}
                placeholder="1500"
                inputMode="numeric"
                className="border-slate-700 bg-slate-950 text-slate-100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-pink-600 text-white hover:bg-pink-700"
            >
              {saving ? "Saving..." : editing ? "Save Changes" : "Create VLAN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete VLAN</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove VLAN{" "}
              <span className="font-mono text-slate-200">{confirmDelete?.name ?? ""}</span>{" "}
              (ID {confirmDelete?.vlan_id ?? "\u2014"}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Routes Table ──────────────────────────────────────────

function RoutesTable({
  data,
  loading,
  error,
}: {
  data: MikrotikRoute[] | null;
  loading: boolean;
  error: string | null;
}) {
  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
      <th className="px-4 py-3 font-medium text-slate-400">Destination</th>
      <th className="px-4 py-3 font-medium text-slate-400">Gateway</th>
      <th className="px-4 py-3 font-medium text-slate-400">Distance</th>
      <th className="px-4 py-3 font-medium text-slate-400">Table</th>
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-10" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No routes found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((route, idx) => (
            <tr
              key={`${route.dst_address}-${idx}`}
              className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {route.active ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                    >
                      active
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-slate-500 text-xs"
                    >
                      {route.disabled ? "disabled" : "inactive"}
                    </Badge>
                  )}
                  {route.dynamic && (
                    <Badge
                      variant="outline"
                      className="border-blue-500/30 text-blue-400 text-xs"
                    >
                      dynamic
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums font-medium text-white">
                  {route.dst_address}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-slate-300">
                  {route.gateway ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono tabular-nums text-xs text-slate-400">
                  {route.distance ?? "\u2014"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-slate-400">
                  {route.routing_table ?? "main"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DHCP Leases Table ─────────────────────────────────────

function DhcpLeasesTable({
  data,
  loading,
  error,
  reload,
}: {
  data: MikrotikDhcpLease[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const [pinning, setPinning] = useState<string | null>(null);

  const handlePin = async (lease: MikrotikDhcpLease) => {
    if (!lease.mac_address) return;
    const key = `${lease.address}-${lease.mac_address}`;
    setPinning(key);
    try {
      await createMikrotikDhcpStaticMapping({
        address: lease.address,
        mac_address: lease.mac_address,
        comment: lease.host_name
          ? `Reserved for ${lease.host_name}`
          : undefined,
      });
      toast.success(
        `Reserved ${lease.address} for ${lease.mac_address}`
      );
      await reload();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to create static mapping"
      );
    } finally {
      setPinning(null);
    }
  };

  const headerCols = (
    <tr className="border-b border-slate-800 bg-slate-950 text-left">
      <th className="px-4 py-3 font-medium text-slate-400">IP Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">MAC Address</th>
      <th className="px-4 py-3 font-medium text-slate-400">Hostname</th>
      <th className="px-4 py-3 font-medium text-slate-400">Server</th>
      <th className="px-4 py-3 font-medium text-slate-400">Expires</th>
      <th className="px-4 py-3 font-medium text-slate-400">State</th>
      <th className="px-4 py-3 font-medium text-slate-400 w-16" />
    </tr>
  );

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead>{headerCols}</thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                <td className="px-4 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No DHCP leases found. DHCP server may not be configured.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>{headerCols}</thead>
        <tbody>
          {data.map((lease, idx) => {
            const key = `${lease.address}-${lease.mac_address}`;
            const isPinning = pinning === key;
            return (
              <tr
                key={`${lease.address}-${idx}`}
                className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums font-medium text-white">
                    {lease.address}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    {lease.mac_address ?? "\u2014"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-300">
                    {lease.host_name ?? "\u2014"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-300">
                    {lease.server ?? "\u2014"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono tabular-nums text-xs text-slate-400">
                    {lease.expires_after ?? "\u2014"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={
                      lease.status === "bound"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                        : "border-slate-700 text-slate-500 text-xs"
                    }
                  >
                    {lease.dynamic ? lease.status ?? "\u2014" : "static"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {lease.dynamic && lease.mac_address && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-amber-400"
                      title="Reserve (create static mapping)"
                      disabled={isPinning}
                      onClick={() => handlePin(lease)}
                    >
                      <Pin className={`h-3.5 w-3.5 ${isPinning ? "animate-pulse" : ""}`} />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── DHCP Server Pool Configuration ────────────────────────

function DhcpServersSection({ reload: parentReload }: { reload: () => Promise<void> }) {
  const servers = useData(useCallback(() => fetchMikrotikDhcpServers(), []));
  const [editId, setEditId] = useState<string | null>(null);
  const [editLeaseTime, setEditLeaseTime] = useState("");
  const [saving, setSaving] = useState(false);

  const handleEdit = (srv: MikrotikDhcpServer) => {
    setEditId(srv.id);
    setEditLeaseTime(srv.lease_time ?? "");
  };

  const handleSave = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await updateMikrotikDhcpServer(editId, { lease_time: editLeaseTime || undefined });
      toast.success("DHCP server updated");
      setEditId(null);
      await servers.reload();
      await parentReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update server");
    } finally {
      setSaving(false);
    }
  };

  if (servers.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (servers.error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{servers.error}</p>
      </div>
    );
  }

  if (!servers.data || servers.data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No DHCP servers configured.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-950 text-left">
            <th className="px-4 py-3 font-medium text-slate-400">Name</th>
            <th className="px-4 py-3 font-medium text-slate-400">Interface</th>
            <th className="px-4 py-3 font-medium text-slate-400">Address Pool</th>
            <th className="px-4 py-3 font-medium text-slate-400">Lease Time</th>
            <th className="px-4 py-3 font-medium text-slate-400">Status</th>
            <th className="px-4 py-3 font-medium text-slate-400 w-20" />
          </tr>
        </thead>
        <tbody>
          {servers.data.map((srv, idx) => (
            <tr key={srv.id ?? idx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors">
              <td className="px-4 py-3 font-medium text-white">{srv.name ?? "\u2014"}</td>
              <td className="px-4 py-3 text-slate-300">{srv.interface ?? "\u2014"}</td>
              <td className="px-4 py-3 text-slate-300">{srv.address_pool ?? "\u2014"}</td>
              <td className="px-4 py-3">
                {editId === srv.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-7 w-28 bg-slate-800 border-slate-700 text-white text-xs"
                      value={editLeaseTime}
                      onChange={(e) => setEditLeaseTime(e.target.value)}
                      placeholder="e.g. 1d"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-slate-400">{srv.lease_time ?? "\u2014"}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={srv.disabled ? "border-slate-700 text-slate-500 text-xs" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"}
                >
                  {srv.disabled ? "disabled" : "active"}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {!editId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-white"
                    onClick={() => handleEdit(srv)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_NETWORK_FORM: MikrotikDhcpNetworkRequest = {
  address: "",
  gateway: "",
  dns_server: "",
  domain: "",
  ntp_server: "",
  comment: "",
};

function DhcpNetworksSection() {
  const networks = useData(useCallback(() => fetchMikrotikDhcpNetworks(), []));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<MikrotikDhcpNetworkRequest>({ ...EMPTY_NETWORK_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MikrotikDhcpNetwork | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.address.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateMikrotikDhcpNetwork(editId, form);
        toast.success("DHCP network updated");
      } else {
        await createMikrotikDhcpNetwork(form);
        toast.success("DHCP network created");
      }
      setShowAdd(false);
      setEditId(null);
      setForm({ ...EMPTY_NETWORK_FORM });
      await networks.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (n: MikrotikDhcpNetwork) => {
    setEditId(n.id);
    setForm({
      address: n.address ?? "",
      gateway: n.gateway ?? "",
      dns_server: n.dns_server ?? "",
      domain: n.domain ?? "",
      ntp_server: n.ntp_server ?? "",
      comment: n.comment ?? "",
    });
    setShowAdd(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteMikrotikDhcpNetwork(deleteTarget.id);
      toast.success("DHCP network deleted");
      setDeleteTarget(null);
      await networks.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (networks.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (networks.error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{networks.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditId(null);
            setForm({ ...EMPTY_NETWORK_FORM });
            setShowAdd(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Network
        </Button>
      </div>

      {(!networks.data || networks.data.length === 0) ? (
        <p className="py-4 text-sm text-slate-500">No DHCP networks configured. Add one to define options for clients.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Address</th>
                <th className="px-4 py-3 font-medium text-slate-400">Gateway</th>
                <th className="px-4 py-3 font-medium text-slate-400">DNS</th>
                <th className="px-4 py-3 font-medium text-slate-400">Domain</th>
                <th className="px-4 py-3 font-medium text-slate-400">NTP</th>
                <th className="px-4 py-3 font-medium text-slate-400 w-20" />
              </tr>
            </thead>
            <tbody>
              {networks.data.map((n, idx) => (
                <tr key={n.id ?? idx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-white">{n.address ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{n.gateway ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{n.dns_server ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-slate-300">{n.domain ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{n.ntp_server ?? "\u2014"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => handleEdit(n)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!n.dynamic && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-400" onClick={() => setDeleteTarget(n)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); } }}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit DHCP Network" : "Add DHCP Network"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure DHCP options (gateway, DNS, domain, NTP) for a network range.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Network Address (CIDR)</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="192.168.1.0/24" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Gateway</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="192.168.1.1" value={form.gateway ?? ""} onChange={(e) => setForm({ ...form, gateway: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">DNS Servers (comma-separated)</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="8.8.8.8,8.8.4.4" value={form.dns_server ?? ""} onChange={(e) => setForm({ ...form, dns_server: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Domain</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="local" value={form.domain ?? ""} onChange={(e) => setForm({ ...form, domain: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">NTP Server</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="pool.ntp.org" value={form.ntp_server ?? ""} onChange={(e) => setForm({ ...form, ntp_server: e.target.value || undefined })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Comment</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" value={form.comment ?? ""} onChange={(e) => setForm({ ...form, comment: e.target.value || undefined })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.address.trim()}>
              {saving ? "Saving\u2026" : editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DHCP Network</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Remove network {deleteTarget?.address}? DHCP clients in this range will no longer receive options.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const EMPTY_POOL_FORM: MikrotikIpPoolRequest = { name: "", ranges: "", comment: "" };

function DhcpPoolsSection() {
  const pools = useData(useCallback(() => fetchMikrotikDhcpPools(), []));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<MikrotikIpPoolRequest>({ ...EMPTY_POOL_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MikrotikIpPool | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.ranges.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateMikrotikDhcpPool(editId, form);
        toast.success("IP pool updated");
      } else {
        await createMikrotikDhcpPool(form);
        toast.success("IP pool created");
      }
      setShowAdd(false);
      setEditId(null);
      setForm({ ...EMPTY_POOL_FORM });
      await pools.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: MikrotikIpPool) => {
    setEditId(p.id);
    setForm({ name: p.name ?? "", ranges: p.ranges ?? "", comment: p.comment ?? "" });
    setShowAdd(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteMikrotikDhcpPool(deleteTarget.id);
      toast.success("IP pool deleted");
      setDeleteTarget(null);
      await pools.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (pools.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (pools.error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{pools.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditId(null);
            setForm({ ...EMPTY_POOL_FORM });
            setShowAdd(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add Pool
        </Button>
      </div>

      {(!pools.data || pools.data.length === 0) ? (
        <p className="py-4 text-sm text-slate-500">No IP pools configured. Add one to define DHCP address ranges.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-left">
                <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                <th className="px-4 py-3 font-medium text-slate-400">Ranges</th>
                <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
                <th className="px-4 py-3 font-medium text-slate-400 w-20" />
              </tr>
            </thead>
            <tbody>
              {pools.data.map((p, idx) => (
                <tr key={p.id ?? idx} className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{p.name ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{p.ranges ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{p.comment ?? "\u2014"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => handleEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!p.dynamic && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-400" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditId(null); } }}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit IP Pool" : "Add IP Pool"}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Define an IP address range for the DHCP server.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Pool Name</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="dhcp-pool1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">IP Ranges</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" placeholder="192.168.1.100-192.168.1.200" value={form.ranges} onChange={(e) => setForm({ ...form, ranges: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Comment</Label>
              <Input className="bg-slate-800 border-slate-700 text-white" value={form.comment ?? ""} onChange={(e) => setForm({ ...form, comment: e.target.value || undefined })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.ranges.trim()}>
              {saving ? "Saving\u2026" : editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete IP Pool</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Remove pool &quot;{deleteTarget?.name}&quot; ({deleteTarget?.ranges})? Any DHCP server using this pool will stop assigning addresses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DhcpLogsSection() {
  const logs = useData(useCallback(() => fetchMikrotikDhcpLogs(), []));

  if (logs.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (logs.error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{logs.error}</p>
      </div>
    );
  }

  if (!logs.data || logs.data.length === 0) {
    return <p className="py-4 text-sm text-slate-500">No DHCP log entries found.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="gap-1.5 text-slate-400" onClick={() => logs.reload()}>
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-800 max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="border-b border-slate-800 bg-slate-950 text-left">
              <th className="px-4 py-2 font-medium text-slate-400 w-40">Time</th>
              <th className="px-4 py-2 font-medium text-slate-400">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.data.slice(-100).reverse().map((entry, idx) => (
              <tr key={entry.id ?? idx} className="border-b border-slate-800 last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{entry.time ?? "\u2014"}</td>
                <td className="px-4 py-2 text-xs text-slate-300">{entry.message ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Firewall Tables ───────────────────────────────────────

function ActionBadge({ action }: { action: string | null }) {
  const lower = (action ?? "").toLowerCase();
  const cls =
    lower === "accept" || lower === "masquerade"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
      : lower === "drop"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs"
        : lower === "reject"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs"
          : "border-slate-700 text-slate-400 text-xs";
  return (
    <Badge variant="outline" className={cls}>
      {action ?? "\u2014"}
    </Badge>
  );
}

const EMPTY_FILTER_FORM: MikrotikFirewallFilterRequest = {
  chain: "forward",
  action: "drop",
  protocol: undefined,
  src_address: undefined,
  dst_address: undefined,
  src_port: undefined,
  dst_port: undefined,
  in_interface: undefined,
  out_interface: undefined,
  comment: undefined,
  disabled: false,
  time: undefined,
};

const EMPTY_NAT_FORM: MikrotikFirewallNatRequest = {
  chain: "dstnat",
  action: "dst-nat",
  protocol: undefined,
  src_address: undefined,
  dst_address: undefined,
  dst_port: undefined,
  to_addresses: undefined,
  to_ports: undefined,
  in_interface: undefined,
  out_interface: undefined,
  comment: undefined,
  disabled: false,
};

function filterRuleToForm(rule: MikrotikFirewallRule): MikrotikFirewallFilterRequest {
  return {
    chain: rule.chain ?? "forward",
    action: rule.action ?? "drop",
    protocol: rule.protocol ?? undefined,
    src_address: rule.src_address ?? undefined,
    dst_address: rule.dst_address ?? undefined,
    src_port: rule.src_port ?? undefined,
    dst_port: rule.dst_port ?? undefined,
    in_interface: rule.in_interface ?? undefined,
    out_interface: rule.out_interface ?? undefined,
    comment: rule.comment ?? undefined,
    disabled: rule.disabled,
    time: rule.time ?? undefined,
  };
}

/** Format a packet count. */
function formatPackets(value: string | null): string {
  if (!value) return "—";
  const n = parseInt(value, 10);
  if (isNaN(n)) return value;
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function natRuleToForm(rule: MikrotikNatRule): MikrotikFirewallNatRequest {
  return {
    chain: rule.chain ?? "dstnat",
    action: rule.action ?? "dst-nat",
    protocol: rule.protocol ?? undefined,
    src_address: rule.src_address ?? undefined,
    dst_address: rule.dst_address ?? undefined,
    dst_port: rule.dst_port ?? undefined,
    to_addresses: rule.to_addresses ?? undefined,
    to_ports: rule.to_ports ?? undefined,
    in_interface: rule.in_interface ?? undefined,
    out_interface: rule.out_interface ?? undefined,
    comment: rule.comment ?? undefined,
    disabled: rule.disabled,
  };
}

function FirewallFilterDialog({
  open,
  onOpenChange,
  editRule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRule: MikrotikFirewallRule | null;
  onSaved: () => void;
}) {
  const isEdit = editRule !== null;
  const [form, setForm] = useState<MikrotikFirewallFilterRequest>({ ...EMPTY_FILTER_FORM });
  const [saving, setSaving] = useState(false);
  const showPorts = form.protocol === "tcp" || form.protocol === "udp";

  useEffect(() => {
    if (!open) return;
    if (editRule) {
      setForm(filterRuleToForm(editRule));
    } else {
      setForm({ ...EMPTY_FILTER_FORM });
    }
  }, [open, editRule]);

  const handleSave = async () => {
    if (!form.chain.trim() || !form.action.trim()) {
      toast.error("Chain and action are required.");
      return;
    }
    setSaving(true);
    try {
      const body: MikrotikFirewallFilterRequest = {
        ...form,
        protocol: form.protocol || undefined,
        src_address: form.src_address || undefined,
        dst_address: form.dst_address || undefined,
        src_port: form.src_port || undefined,
        dst_port: form.dst_port || undefined,
        in_interface: form.in_interface || undefined,
        out_interface: form.out_interface || undefined,
        comment: form.comment || undefined,
        time: form.time || undefined,
      };
      if (isEdit && editRule?.id) {
        await updateMikrotikFirewallFilter(editRule.id, body);
        toast.success("Filter rule updated.");
      } else {
        await createMikrotikFirewallFilter(body);
        toast.success("Filter rule created.");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Filter Rule" : "Create Filter Rule"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure a MikroTik firewall filter rule.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Chain</Label>
              <select
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="forward">forward</option>
                <option value="input">input</option>
                <option value="output">output</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="accept">accept</option>
                <option value="drop">drop</option>
                <option value="reject">reject</option>
                <option value="jump">jump</option>
                <option value="return">return</option>
                <option value="log">log</option>
                <option value="passthrough">passthrough</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select
              value={form.protocol ?? ""}
              onChange={(e) => setForm({ ...form, protocol: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="">any</option>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="icmp">icmp</option>
              <option value="gre">gre</option>
              <option value="esp">esp</option>
              <option value="ah">ah</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Src Address</Label>
              <Input
                value={form.src_address ?? ""}
                onChange={(e) => setForm({ ...form, src_address: e.target.value || undefined })}
                placeholder="e.g. 192.168.1.0/24"
                className="border-slate-700 bg-slate-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Dst Address</Label>
              <Input
                value={form.dst_address ?? ""}
                onChange={(e) => setForm({ ...form, dst_address: e.target.value || undefined })}
                placeholder="e.g. 10.0.0.1"
                className="border-slate-700 bg-slate-800"
              />
            </div>
          </div>
          {showPorts && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Src Port</Label>
                <Input
                  value={form.src_port ?? ""}
                  onChange={(e) => setForm({ ...form, src_port: e.target.value || undefined })}
                  placeholder="e.g. 1024-65535"
                  className="border-slate-700 bg-slate-800"
                />
              </div>
              <div className="space-y-2">
                <Label>Dst Port</Label>
                <Input
                  value={form.dst_port ?? ""}
                  onChange={(e) => setForm({ ...form, dst_port: e.target.value || undefined })}
                  placeholder="e.g. 80,443"
                  className="border-slate-700 bg-slate-800"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Schedule (Time-based)</Label>
            <Input
              value={form.time ?? ""}
              onChange={(e) => setForm({ ...form, time: e.target.value || undefined })}
              placeholder="e.g. 08:00:00-17:00:00,mon,tue,wed,thu,fri"
              className="border-slate-700 bg-slate-800"
            />
            <p className="text-xs text-slate-500">
              Format: HH:MM:SS-HH:MM:SS,day1,day2,… Leave empty for always active.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Input
              value={form.comment ?? ""}
              onChange={(e) => setForm({ ...form, comment: e.target.value || undefined })}
              placeholder="Rule description"
              className="border-slate-700 bg-slate-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-pink-600 text-white hover:bg-pink-700"
          >
            {saving ? "Saving\u2026" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FirewallNatDialog({
  open,
  onOpenChange,
  editRule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRule: MikrotikNatRule | null;
  onSaved: () => void;
}) {
  const isEdit = editRule !== null;
  const [form, setForm] = useState<MikrotikFirewallNatRequest>({ ...EMPTY_NAT_FORM });
  const [saving, setSaving] = useState(false);
  const showPorts = form.protocol === "tcp" || form.protocol === "udp";

  useEffect(() => {
    if (!open) return;
    if (editRule) {
      setForm(natRuleToForm(editRule));
    } else {
      setForm({ ...EMPTY_NAT_FORM });
    }
  }, [open, editRule]);

  const handleSave = async () => {
    if (!form.chain.trim() || !form.action.trim()) {
      toast.error("Chain and action are required.");
      return;
    }
    setSaving(true);
    try {
      const body: MikrotikFirewallNatRequest = {
        ...form,
        protocol: form.protocol || undefined,
        src_address: form.src_address || undefined,
        dst_address: form.dst_address || undefined,
        dst_port: form.dst_port || undefined,
        to_addresses: form.to_addresses || undefined,
        to_ports: form.to_ports || undefined,
        in_interface: form.in_interface || undefined,
        out_interface: form.out_interface || undefined,
        comment: form.comment || undefined,
      };
      if (isEdit && editRule?.id) {
        await updateMikrotikFirewallNat(editRule.id, body);
        toast.success("NAT rule updated.");
      } else {
        await createMikrotikFirewallNat(body);
        toast.success("NAT rule created.");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit NAT Rule" : "Create NAT Rule"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure a MikroTik firewall NAT rule.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Chain</Label>
              <select
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="dstnat">dstnat</option>
                <option value="srcnat">srcnat</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="dst-nat">dst-nat</option>
                <option value="src-nat">src-nat</option>
                <option value="masquerade">masquerade</option>
                <option value="accept">accept</option>
                <option value="redirect">redirect</option>
                <option value="netmap">netmap</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select
              value={form.protocol ?? ""}
              onChange={(e) => setForm({ ...form, protocol: e.target.value || undefined })}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="">any</option>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="icmp">icmp</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Dst Address</Label>
              <Input
                value={form.dst_address ?? ""}
                onChange={(e) => setForm({ ...form, dst_address: e.target.value || undefined })}
                placeholder="e.g. 203.0.113.1"
                className="border-slate-700 bg-slate-800"
              />
            </div>
            {showPorts && (
              <div className="space-y-2">
                <Label>Dst Port</Label>
                <Input
                  value={form.dst_port ?? ""}
                  onChange={(e) => setForm({ ...form, dst_port: e.target.value || undefined })}
                  placeholder="e.g. 8080"
                  className="border-slate-700 bg-slate-800"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>To Addresses</Label>
              <Input
                value={form.to_addresses ?? ""}
                onChange={(e) => setForm({ ...form, to_addresses: e.target.value || undefined })}
                placeholder="e.g. 192.168.1.100"
                className="border-slate-700 bg-slate-800"
              />
            </div>
            {showPorts && (
              <div className="space-y-2">
                <Label>To Ports</Label>
                <Input
                  value={form.to_ports ?? ""}
                  onChange={(e) => setForm({ ...form, to_ports: e.target.value || undefined })}
                  placeholder="e.g. 80"
                  className="border-slate-700 bg-slate-800"
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Input
              value={form.comment ?? ""}
              onChange={(e) => setForm({ ...form, comment: e.target.value || undefined })}
              placeholder="Rule description"
              className="border-slate-700 bg-slate-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-pink-600 text-white hover:bg-pink-700"
          >
            {saving ? "Saving\u2026" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddressListDialog({
  open,
  onOpenChange,
  editEntry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEntry: MikrotikAddressListEntry | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MikrotikAddressListRequest>({ list: "", address: "" });
  const [saving, setSaving] = useState(false);
  const isEdit = editEntry !== null;

  useEffect(() => {
    if (open) {
      if (editEntry) {
        setForm({
          list: editEntry.list ?? "",
          address: editEntry.address ?? "",
          comment: editEntry.comment ?? undefined,
        });
      } else {
        setForm({ list: "", address: "" });
      }
    }
  }, [open, editEntry]);

  const handleSave = async () => {
    if (!form.list.trim() || !form.address.trim()) {
      toast.error("List name and address are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        list: form.list.trim(),
        address: form.address.trim(),
        comment: form.comment?.trim() || undefined,
      };
      if (isEdit && editEntry.id) {
        await updateMikrotikAddressList(editEntry.id, payload);
        toast.success("Address list entry updated.");
      } else {
        await createMikrotikAddressList(payload);
        toast.success("Address list entry added.");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Address List Entry" : "Add Address List Entry"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {isEdit
              ? "Update this address list entry on MikroTik."
              : "Add an address to a MikroTik address list."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>List Name</Label>
            <Input
              value={form.list}
              onChange={(e) => setForm({ ...form, list: e.target.value })}
              placeholder="e.g. blocked"
              className="border-slate-700 bg-slate-800"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. 10.0.0.0/8"
              className="border-slate-700 bg-slate-800"
            />
          </div>
          <div className="space-y-2">
            <Label>Comment</Label>
            <Input
              value={form.comment ?? ""}
              onChange={(e) => setForm({ ...form, comment: e.target.value || undefined })}
              placeholder="Optional description"
              className="border-slate-700 bg-slate-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-pink-600 text-white hover:bg-pink-700"
          >
            {saving ? "Saving\u2026" : isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableFilterRow({
  rule,
  index,
  disabled: rowDisabled,
  toggling,
  deleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: MikrotikFirewallRule;
  index: number;
  disabled: boolean;
  toggling: string | null;
  deleting: string | null;
  onToggle: (rule: MikrotikFirewallRule) => void;
  onEdit: (rule: MikrotikFirewallRule) => void;
  onDelete: (rule: MikrotikFirewallRule) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id ?? `idx-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors ${
        rule.disabled ? "opacity-50" : ""
      }`}
    >
      <td className="px-2 py-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-500 hover:text-slate-300 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-4 py-3 text-slate-300">{rule.chain ?? "\u2014"}</td>
      <td className="px-4 py-3">
        <ActionBadge action={rule.action} />
      </td>
      <td className="px-4 py-3 text-slate-300">{rule.protocol ?? "any"}</td>
      <td className="px-4 py-3">
        <span className="font-mono tabular-nums text-xs text-slate-400">
          {rule.src_address ?? "any"}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono tabular-nums text-xs text-slate-400">
          {rule.dst_address ?? "any"}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-300">{rule.dst_port ?? "\u2014"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="tabular-nums text-xs text-cyan-400" title={`${rule.packets ?? 0} packets`}>
            {formatPackets(rule.packets)} pkts
          </span>
          <span className="tabular-nums text-xs text-slate-500" title={`${rule.bytes ?? 0} bytes`}>
            {formatBytes(rule.bytes)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {rule.time ? (
          <span className="flex items-center gap-1 text-xs text-amber-400" title={rule.time}>
            <Timer className="h-3 w-3" />
            {rule.time.split(",")[0]}
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-500 text-xs">{rule.comment ?? ""}</span>
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className={
            rule.disabled
              ? "border-slate-700 text-slate-500 text-xs"
              : "border-emerald-500/30 text-emerald-400 text-xs"
          }
        >
          {rule.disabled ? "disabled" : "enabled"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={() => onToggle(rule)}
            disabled={!rule.id || toggling === rule.id}
            title={rule.disabled ? "Enable" : "Disable"}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={() => onEdit(rule)}
            disabled={!rule.id}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            onClick={() => onDelete(rule)}
            disabled={!rule.id || deleting === rule.id}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function FirewallPanel({
  data,
  loading,
  error,
  reload,
}: {
  data: MikrotikFirewall | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [editFilter, setEditFilter] = useState<MikrotikFirewallRule | null>(null);
  const [confirmDeleteFilter, setConfirmDeleteFilter] = useState<MikrotikFirewallRule | null>(null);
  const [natDialogOpen, setNatDialogOpen] = useState(false);
  const [editNat, setEditNat] = useState<MikrotikNatRule | null>(null);
  const [confirmDeleteNat, setConfirmDeleteNat] = useState<MikrotikNatRule | null>(null);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);
  const [editAddr, setEditAddr] = useState<MikrotikAddressListEntry | null>(null);
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<MikrotikAddressListEntry | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterSearch, setFilterSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const filteredRules = useMemo(() => {
    if (!data?.filter_rules.length) return [];
    if (!filterSearch.trim()) return data.filter_rules;
    const q = filterSearch.toLowerCase();
    return data.filter_rules.filter(
      (r) =>
        (r.chain ?? "").toLowerCase().includes(q) ||
        (r.action ?? "").toLowerCase().includes(q) ||
        (r.protocol ?? "").toLowerCase().includes(q) ||
        (r.src_address ?? "").toLowerCase().includes(q) ||
        (r.dst_address ?? "").toLowerCase().includes(q) ||
        (r.dst_port ?? "").toLowerCase().includes(q) ||
        (r.comment ?? "").toLowerCase().includes(q) ||
        (r.time ?? "").toLowerCase().includes(q)
    );
  }, [data?.filter_rules, filterSearch]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data?.filter_rules) return;

    const oldIndex = data.filter_rules.findIndex(
      (r) => (r.id ?? `idx-${data.filter_rules.indexOf(r)}`) === active.id
    );
    const newIndex = data.filter_rules.findIndex(
      (r) => (r.id ?? `idx-${data.filter_rules.indexOf(r)}`) === over.id
    );
    if (oldIndex === -1 || newIndex === -1) return;

    const ruleId = data.filter_rules[oldIndex].id;
    if (!ruleId) return;

    // Destination = the rule to place before, or null for end
    const destination =
      newIndex < data.filter_rules.length
        ? data.filter_rules[newIndex].id
        : null;

    try {
      await moveMikrotikFirewallFilter(ruleId, destination);
      toast.success("Rule reordered.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  const handleToggleFilter = async (rule: MikrotikFirewallRule) => {
    if (!rule.id) return;
    setToggling(rule.id);
    try {
      await toggleMikrotikFirewallFilter(rule.id, !rule.disabled);
      toast.success(rule.disabled ? "Rule enabled." : "Rule disabled.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed.");
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteFilter = async () => {
    if (!confirmDeleteFilter?.id) return;
    const id = confirmDeleteFilter.id;
    setConfirmDeleteFilter(null);
    setDeleting(id);
    try {
      await deleteMikrotikFirewallFilter(id);
      toast.success("Filter rule deleted.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleNat = async (rule: MikrotikNatRule) => {
    if (!rule.id) return;
    setToggling(rule.id);
    try {
      await toggleMikrotikFirewallNat(rule.id, !rule.disabled);
      toast.success(rule.disabled ? "Rule enabled." : "Rule disabled.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed.");
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteNat = async () => {
    if (!confirmDeleteNat?.id) return;
    const id = confirmDeleteNat.id;
    setConfirmDeleteNat(null);
    setDeleting(id);
    try {
      await deleteMikrotikFirewallNat(id);
      toast.success("NAT rule deleted.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAddr = async () => {
    if (!confirmDeleteAddr?.id) return;
    const id = confirmDeleteAddr.id;
    setConfirmDeleteAddr(null);
    setDeleting(id);
    try {
      await deleteMikrotikAddressList(id);
      toast.success("Address list entry deleted.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleAddr = async (entry: MikrotikAddressListEntry) => {
    if (!entry.id) return;
    setToggling(entry.id);
    try {
      await toggleMikrotikAddressList(entry.id, !entry.disabled);
      toast.success(entry.disabled ? "Entry enabled." : "Entry disabled.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed.");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">Filter Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-left">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 font-medium text-slate-400">Chain</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Action</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Src</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Dst</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Port</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Stats</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Schedule</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800 last:border-b-0">
                    <td className="px-2 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-8 w-20" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group address list entries by list name
  const addressGroups: Record<string, MikrotikAddressListEntry[]> = {};
  for (const entry of data?.address_lists ?? []) {
    const name = entry.list ?? "(unnamed)";
    if (!addressGroups[name]) addressGroups[name] = [];
    addressGroups[name].push(entry);
  }

  return (
    <div className="space-y-4">
      {/* Filter Rules */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-white">Filter Rules</CardTitle>
            <Button
              size="sm"
              className="bg-pink-600 text-white hover:bg-pink-700"
              onClick={() => {
                setEditFilter(null);
                setFilterDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
          {(data?.filter_rules.length ?? 0) > 0 && (
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search rules…"
                className="border-slate-700 bg-slate-800 pl-9 text-sm"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!data?.filter_rules.length ? (
            <p className="py-4 text-sm text-slate-500">No filter rules configured.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-left">
                      <th className="w-8 px-2 py-3" />
                      <th className="px-4 py-3 font-medium text-slate-400">Chain</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Action</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Src</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Dst</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Port</th>
                      <th className="px-4 py-3 font-medium text-slate-400">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3.5 w-3.5" /> Stats
                        </span>
                      </th>
                      <th className="px-4 py-3 font-medium text-slate-400">Schedule</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
                      <th className="px-4 py-3 font-medium text-slate-400">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <SortableContext
                    items={filteredRules.map((r, i) => r.id ?? `idx-${i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {filteredRules.map((rule, i) => (
                        <SortableFilterRow
                          key={rule.id ?? i}
                          rule={rule}
                          index={i}
                          disabled={rule.disabled}
                          toggling={toggling}
                          deleting={deleting}
                          onToggle={handleToggleFilter}
                          onEdit={(r) => {
                            setEditFilter(r);
                            setFilterDialogOpen(true);
                          }}
                          onDelete={setConfirmDeleteFilter}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </div>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* NAT Rules */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-white">NAT Rules</CardTitle>
            <Button
              size="sm"
              className="bg-pink-600 text-white hover:bg-pink-700"
              onClick={() => {
                setEditNat(null);
                setNatDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add NAT Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!data?.nat_rules.length ? (
            <p className="py-4 text-sm text-slate-500">No NAT rules configured.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950 text-left">
                    <th className="px-4 py-3 font-medium text-slate-400">Chain</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Action</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Protocol</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Dst</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Port</th>
                    <th className="px-4 py-3 font-medium text-slate-400">To</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Comment</th>
                    <th className="px-4 py-3 font-medium text-slate-400">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nat_rules.map((rule, i) => (
                    <tr
                      key={rule.id ?? i}
                      className={`border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors ${
                        rule.disabled ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-300">{rule.chain ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <ActionBadge action={rule.action} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">{rule.protocol ?? "any"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-xs text-slate-400">
                          {rule.dst_address ?? "any"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{rule.dst_port ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono tabular-nums text-slate-300">
                          {rule.to_addresses ?? "\u2014"}
                          {rule.to_ports ? `:${rule.to_ports}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-500">{rule.comment ?? ""}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            rule.disabled
                              ? "border-slate-700 text-slate-500 text-xs"
                              : "border-emerald-500/30 text-emerald-400 text-xs"
                          }
                        >
                          {rule.disabled ? "disabled" : "enabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                            onClick={() => handleToggleNat(rule)}
                            disabled={!rule.id || toggling === rule.id}
                            title={rule.disabled ? "Enable" : "Disable"}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:bg-slate-800 hover:text-white"
                            onClick={() => {
                              setEditNat(rule);
                              setNatDialogOpen(true);
                            }}
                            disabled={!rule.id}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            onClick={() => setConfirmDeleteNat(rule)}
                            disabled={!rule.id || deleting === rule.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address Lists */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-white">Address Lists</CardTitle>
            <Button
              size="sm"
              className="bg-pink-600 text-white hover:bg-pink-700"
              onClick={() => {
                setEditAddr(null);
                setAddrDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(addressGroups).length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No address list entries.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(addressGroups).map(([listName, entries]) => (
                <div key={listName}>
                  <div className="mb-1 flex items-center gap-2">
                    <List className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-300">{listName}</span>
                    <Badge variant="outline" className="border-slate-700 text-slate-500 text-xs">
                      {entries.length}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-slate-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950 text-left">
                          <th className="px-4 py-2 font-medium text-slate-400">Address</th>
                          <th className="px-4 py-2 font-medium text-slate-400">Comment</th>
                          <th className="px-4 py-2 font-medium text-slate-400">Type</th>
                          <th className="px-4 py-2 font-medium text-slate-400">Status</th>
                          <th className="px-4 py-2 text-right font-medium text-slate-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry, i) => (
                          <tr
                            key={entry.id ?? i}
                            className={`border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors ${
                              entry.disabled ? "opacity-50" : ""
                            }`}
                          >
                            <td className="px-4 py-2">
                              <span className="font-mono tabular-nums text-xs text-slate-300">
                                {entry.address ?? "\u2014"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-500">
                              {entry.comment ?? ""}
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  entry.dynamic
                                    ? "border-blue-500/30 text-blue-400 text-xs"
                                    : "border-slate-700 text-slate-400 text-xs"
                                }
                              >
                                {entry.dynamic ? "dynamic" : "static"}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                variant="outline"
                                className={
                                  entry.disabled
                                    ? "border-slate-700 text-slate-500 text-xs"
                                    : "border-emerald-500/30 text-emerald-400 text-xs"
                                }
                              >
                                {entry.disabled ? "disabled" : "enabled"}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              {!entry.dynamic && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    onClick={() => handleToggleAddr(entry)}
                                    disabled={!entry.id || toggling === entry.id}
                                    title={entry.disabled ? "Enable" : "Disable"}
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    onClick={() => {
                                      setEditAddr(entry);
                                      setAddrDialogOpen(true);
                                    }}
                                    disabled={!entry.id}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                    onClick={() => setConfirmDeleteAddr(entry)}
                                    disabled={!entry.id || deleting === entry.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <FirewallFilterDialog
        open={filterDialogOpen}
        onOpenChange={(open) => {
          setFilterDialogOpen(open);
          if (!open) setEditFilter(null);
        }}
        editRule={editFilter}
        onSaved={reload}
      />
      <FirewallNatDialog
        open={natDialogOpen}
        onOpenChange={(open) => {
          setNatDialogOpen(open);
          if (!open) setEditNat(null);
        }}
        editRule={editNat}
        onSaved={reload}
      />
      <AddressListDialog
        open={addrDialogOpen}
        onOpenChange={(open) => {
          setAddrDialogOpen(open);
          if (!open) setEditAddr(null);
        }}
        editEntry={editAddr}
        onSaved={reload}
      />

      {/* Delete Confirmation Dialogs */}
      <AlertDialog
        open={confirmDeleteFilter !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteFilter(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Filter Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this filter rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDeleteFilter}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeleteNat !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteNat(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete NAT Rule</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this NAT rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDeleteNat}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeleteAddr !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteAddr(null);
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Address List Entry</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Remove <span className="font-mono text-white">{confirmDeleteAddr?.address}</span> from
              list <span className="font-medium text-white">{confirmDeleteAddr?.list}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-slate-800 text-slate-300">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDeleteAddr}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── DNS Panel ─────────────────────────────────────────────

function DnsPanel({
  data,
  loading,
  error,
}: {
  data: MikrotikDns | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase text-slate-500">
          Upstream Servers
        </p>
        <div className="flex flex-wrap gap-2">
          {data.servers.length > 0 ? (
            data.servers.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="border-slate-700 font-mono text-xs text-slate-300"
              >
                {s}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-slate-500">No DNS servers configured.</p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Allow Remote Requests</p>
            <p className="text-sm font-medium text-white">
              {data.allow_remote_requests ? "Yes" : "No"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Cache Size</p>
            <p className="text-sm font-medium text-white">
              {data.cache_size ?? "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="py-3">
            <p className="text-xs text-slate-500">Cache Used</p>
            <p className="text-sm font-medium text-white">
              {data.cache_used ?? "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── WireGuard Panel ───────────────────────────────────────

function WireGuardPanel({
  data,
  loading,
  error,
}: {
  data: MikrotikWireguard | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-xs text-rose-400">{error}</p>
      </div>
    );
  }

  if (!data?.interfaces.length) {
    return (
      <p className="py-4 text-sm text-slate-500">
        No WireGuard interfaces configured.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.interfaces.map((iface) => (
        <div
          key={iface.name}
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <div className="mb-3 flex items-center gap-3">
            <span className="font-mono text-sm font-medium text-white">
              {iface.name}
            </span>
            <Badge
              variant="outline"
              className={
                iface.running
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
                  : "border-slate-700 text-slate-500 text-xs"
              }
            >
              {iface.running ? "running" : iface.disabled ? "disabled" : "down"}
            </Badge>
            {iface.listen_port && (
              <span className="text-xs text-slate-500">
                port {iface.listen_port}
              </span>
            )}
          </div>
          {iface.peers.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900 text-left">
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Public Key
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Endpoint
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Allowed IPs
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-400">RX</th>
                    <th className="px-3 py-2 font-medium text-slate-400">TX</th>
                    <th className="px-3 py-2 font-medium text-slate-400">
                      Last Handshake
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {iface.peers.map((peer, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-800 last:border-b-0 hover:bg-slate-800/60 transition-colors text-slate-300"
                    >
                      <td className="px-3 py-2 font-mono">
                        {peer.public_key
                          ? `${peer.public_key.slice(0, 12)}...`
                          : "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {peer.endpoint ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {peer.allowed_address ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2">{formatBytes(peer.rx)}</td>
                      <td className="px-3 py-2">{formatBytes(peer.tx)}</td>
                      <td className="px-3 py-2">
                        {peer.last_handshake ?? "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Traffic Tab ───────────────────────────────────────────

type TimeRange = "1h" | "24h" | "7d";

const RANGE_LABELS: Record<TimeRange, string> = {
  "1h": "1 Hour",
  "24h": "24 Hours",
  "7d": "7 Days",
};

const RANGE_MINUTES: Record<TimeRange, number> = {
  "1h": 60,
  "24h": 1440,
  "7d": 10080,
};

function formatTrafficTime(iso: string, range: TimeRange): string {
  try {
    const d = new Date(iso);
    if (range === "7d") {
      return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function TrafficTab() {
  const [data, setData] = useState<TrafficHistoryPoint[]>([]);
  const [range, setRange] = useState<TimeRange>("1h");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const points = await fetchTrafficHistory(RANGE_MINUTES[range]);
      setData(points);
    } catch {
      // Keep stale data on error
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    load();
    const intervalMs = range === "1h" ? 30_000 : 60_000;
    const interval = setInterval(load, intervalMs);
    return () => clearInterval(interval);
  }, [load, range]);

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-white">
            Bandwidth History
          </CardTitle>
          <div className="flex gap-1">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <Button
                key={r}
                variant={range === r ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 px-2.5 text-xs ${
                  range === r
                    ? "bg-slate-700 text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && data.length === 0 ? (
          <Skeleton className="h-[300px] w-full rounded-xl" />
        ) : data.length > 0 ? (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="mtColorRx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mtColorTx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="minute"
                  tickFormatter={(v: string) => formatTrafficTime(v, range)}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="#1e293b"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatBps(v)}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  stroke="#1e293b"
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "6px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v: string) => formatTrafficTime(v, range)}
                  formatter={(value: number, name: string) => [
                    formatBps(value),
                    name === "rx_bps" ? "Inbound" : "Outbound",
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    value === "rx_bps" ? "Inbound" : "Outbound"
                  }
                  wrapperStyle={{ fontSize: "12px", color: "#9ca3af" }}
                />
                <Area
                  type="monotone"
                  dataKey="rx_bps"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#mtColorRx)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx_bps"
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#mtColorTx)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-slate-500">
              No traffic data yet. The poller collects samples every 60 seconds.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Policy Routing Tab ────────────────────────────────────

function PolicyRoutingTab({
  mangle,
  routingRules,
  routingTables,
}: {
  mangle: { data: MikrotikMangleRule[] | null; loading: boolean; error: string | null; reload: () => void };
  routingRules: { data: MikrotikRoutingRule[] | null; loading: boolean; error: string | null; reload: () => void };
  routingTables: { data: MikrotikRoutingTable[] | null; loading: boolean; error: string | null };
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    chain: "prerouting",
    action: "mark-routing",
    src_address: "",
    dst_address: "",
    protocol: "",
    new_routing_mark: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MikrotikMangleRule | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createMikrotikMangleRule({
        chain: form.chain,
        action: form.action,
        src_address: form.src_address || undefined,
        dst_address: form.dst_address || undefined,
        protocol: form.protocol || undefined,
        new_routing_mark: form.new_routing_mark || undefined,
        comment: form.comment || undefined,
      });
      toast.success("Mangle rule created");
      setShowCreate(false);
      setForm({ chain: "prerouting", action: "mark-routing", src_address: "", dst_address: "", protocol: "", new_routing_mark: "", comment: "" });
      mangle.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteMikrotikMangleRule(deleteTarget.id);
      toast.success("Mangle rule deleted");
      setDeleteTarget(null);
      mangle.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    }
  };

  return (
    <div className="space-y-6">
      {/* Routing Tables */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">Routing Tables</CardTitle>
        </CardHeader>
        <CardContent>
          {routingTables.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : routingTables.error ? (
            <p className="text-sm text-rose-400">{routingTables.error}</p>
          ) : !routingTables.data?.length ? (
            <p className="text-sm text-slate-500">No custom routing tables</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">FIB</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routingTables.data.map((t, i) => (
                    <tr key={t.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{t.name ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{t.fib ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={t.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {t.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mangle Rules (PBR) */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white">Mangle Rules (Policy Routing)</CardTitle>
          <Button size="sm" variant="outline" className="border-slate-700" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          {mangle.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : mangle.error ? (
            <p className="text-sm text-rose-400">{mangle.error}</p>
          ) : !mangle.data?.length ? (
            <p className="text-sm text-slate-500">No mangle rules configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Chain</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Src Address</th>
                    <th className="px-3 py-2">Dst Address</th>
                    <th className="px-3 py-2">Protocol</th>
                    <th className="px-3 py-2">Routing Mark</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mangle.data.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{r.chain ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.action ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.src_address ?? "any"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.dst_address ?? "any"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.protocol ?? "any"}</td>
                      <td className="px-3 py-2 text-blue-400">{r.new_routing_mark ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={r.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {r.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.id && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-rose-400" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Routing Rules */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">Routing Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {routingRules.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : routingRules.error ? (
            <p className="text-sm text-rose-400">{routingRules.error}</p>
          ) : !routingRules.data?.length ? (
            <p className="text-sm text-slate-500">No routing rules configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Src Address</th>
                    <th className="px-3 py-2">Dst Address</th>
                    <th className="px-3 py-2">Routing Mark</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Table</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routingRules.data.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-300">{r.src_address ?? "any"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.dst_address ?? "any"}</td>
                      <td className="px-3 py-2 text-blue-400">{r.routing_mark ?? "—"}</td>
                      <td className="px-3 py-2 text-white">{r.action ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{r.table ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={r.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {r.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Mangle Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Create Mangle Rule</DialogTitle>
            <DialogDescription className="text-slate-400">Add a policy routing mangle rule</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Chain</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.chain} onChange={(e) => setForm({ ...form, chain: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Action</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Source Address</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" placeholder="e.g. 192.168.1.0/24" value={form.src_address} onChange={(e) => setForm({ ...form, src_address: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Destination Address</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" placeholder="e.g. 0.0.0.0/0" value={form.dst_address} onChange={(e) => setForm({ ...form, dst_address: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Protocol</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" placeholder="e.g. tcp, udp" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">New Routing Mark</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" placeholder="e.g. wan2-mark" value={form.new_routing_mark} onChange={(e) => setForm({ ...form, new_routing_mark: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Comment</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Mangle Rule?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove the mangle rule for {deleteTarget?.src_address ?? "any"} → {deleteTarget?.dst_address ?? "any"} with mark &quot;{deleteTarget?.new_routing_mark ?? "—"}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Gateway Monitoring Tab ────────────────────────────────

function GatewayMonitoringTab({
  netwatch,
}: {
  netwatch: { data: MikrotikNetwatchEntry[] | null; loading: boolean; error: string | null; reload: () => void };
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ host: "", check_type: "icmp", interval: "10s", timeout: "1000ms", comment: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MikrotikNetwatchEntry | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createMikrotikNetwatch({
        host: form.host,
        check_type: form.check_type || undefined,
        interval: form.interval || undefined,
        timeout: form.timeout || undefined,
        comment: form.comment || undefined,
      });
      toast.success("Netwatch entry created");
      setShowCreate(false);
      setForm({ host: "", check_type: "icmp", interval: "10s", timeout: "1000ms", comment: "" });
      netwatch.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteMikrotikNetwatch(deleteTarget.id);
      toast.success("Netwatch entry deleted");
      setDeleteTarget(null);
      netwatch.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete entry");
    }
  };

  const upCount = netwatch.data?.filter((n) => n.status === "up").length ?? 0;
  const downCount = netwatch.data?.filter((n) => n.status === "down").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <InfoStatCard
          icon={<HeartPulse className="h-5 w-5 text-emerald-400" />}
          iconColorClass="bg-emerald-500/10"
          label="Gateways Up"
          value={String(upCount)}
        />
        <InfoStatCard
          icon={<HeartPulse className="h-5 w-5 text-rose-400" />}
          iconColorClass="bg-rose-500/10"
          label="Gateways Down"
          value={String(downCount)}
        />
        <InfoStatCard
          icon={<Activity className="h-5 w-5 text-blue-400" />}
          iconColorClass="bg-blue-500/10"
          label="Total Monitors"
          value={String(netwatch.data?.length ?? 0)}
        />
        <InfoStatCard
          icon={<Globe className="h-5 w-5 text-amber-400" />}
          iconColorClass="bg-amber-500/10"
          label="Disabled"
          value={String(netwatch.data?.filter((n) => n.disabled).length ?? 0)}
        />
      </div>

      {/* Netwatch Table */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base text-white">Gateway Health Monitors</CardTitle>
          <Button size="sm" variant="outline" className="border-slate-700" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Monitor
          </Button>
        </CardHeader>
        <CardContent>
          {netwatch.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : netwatch.error ? (
            <p className="text-sm text-rose-400">{netwatch.error}</p>
          ) : !netwatch.data?.length ? (
            <p className="text-sm text-slate-500">No gateway monitors configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Interval</th>
                    <th className="px-3 py-2">Timeout</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Since</th>
                    <th className="px-3 py-2">Comment</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {netwatch.data.map((n, i) => (
                    <tr key={n.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-white">{n.host ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.check_type ?? "icmp"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.interval ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.timeout ?? "—"}</td>
                      <td className="px-3 py-2">
                        {n.disabled ? (
                          <Badge variant="outline" className="border-slate-600 text-slate-500">Disabled</Badge>
                        ) : n.status === "up" ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Up</Badge>
                        ) : n.status === "down" ? (
                          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">Down</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-600 text-slate-500">{n.status ?? "Unknown"}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{n.since ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{n.comment ?? ""}</td>
                      <td className="px-3 py-2">
                        {n.id && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-rose-400" onClick={() => setDeleteTarget(n)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="border-slate-800 bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-white">Add Gateway Monitor</DialogTitle>
            <DialogDescription className="text-slate-400">Monitor a gateway IP for health checks</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Host / Gateway IP</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" placeholder="e.g. 8.8.8.8" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Check Type</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.check_type} onChange={(e) => setForm({ ...form, check_type: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Interval</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Timeout</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value })} />
            </div>
            <div>
              <Label className="text-slate-300">Comment</Label>
              <Input className="border-slate-700 bg-slate-950 text-white" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.host.trim()}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-slate-800 bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Gateway Monitor?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will remove the health monitor for {deleteTarget?.host ?? "unknown"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Dynamic Routing Tab ───────────────────────────────────

function DynamicRoutingTab({
  dynamic,
  ipv6Nd,
}: {
  dynamic: { data: MikrotikDynamicRouting | null; loading: boolean; error: string | null };
  ipv6Nd: { data: MikrotikIpv6Nd[] | null; loading: boolean; error: string | null };
}) {
  return (
    <div className="space-y-6">
      {/* BGP Connections */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">BGP Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {dynamic.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : dynamic.error ? (
            <p className="text-sm text-rose-400">{dynamic.error}</p>
          ) : !dynamic.data?.bgp_connections.length ? (
            <p className="text-sm text-slate-500">No BGP connections configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Remote Address</th>
                    <th className="px-3 py-2">Remote AS</th>
                    <th className="px-3 py-2">Local AS</th>
                    <th className="px-3 py-2">Local Role</th>
                    <th className="px-3 py-2">Routing Table</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dynamic.data.bgp_connections.map((b, i) => (
                    <tr key={b.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{b.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{b.remote_address ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{b.remote_as ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{b.local_as ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{b.local_role ?? "—"}</td>
                      <td className="px-3 py-2 text-blue-400">{b.routing_table ?? "main"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={b.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {b.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OSPF Instances */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">OSPF Instances</CardTitle>
        </CardHeader>
        <CardContent>
          {dynamic.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : !dynamic.data?.ospf_instances.length ? (
            <p className="text-sm text-slate-500">No OSPF instances configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Router ID</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dynamic.data.ospf_instances.map((o, i) => (
                    <tr key={o.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{o.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{o.router_id ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{o.version ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={o.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {o.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* OSPF Areas */}
      {dynamic.data?.ospf_areas && dynamic.data.ospf_areas.length > 0 && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-white">OSPF Areas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Area ID</th>
                    <th className="px-3 py-2">Instance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dynamic.data.ospf_areas.map((a, i) => (
                    <tr key={a.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{a.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{a.area_id ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{a.instance ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={a.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {a.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* IPv6 Router Advertisements */}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-white">IPv6 Router Advertisements</CardTitle>
        </CardHeader>
        <CardContent>
          {ipv6Nd.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : ipv6Nd.error ? (
            <p className="text-sm text-rose-400">{ipv6Nd.error}</p>
          ) : !ipv6Nd.data?.length ? (
            <p className="text-sm text-slate-500">No IPv6 ND interfaces configured</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2">Interface</th>
                    <th className="px-3 py-2">RA Interval</th>
                    <th className="px-3 py-2">RA Lifetime</th>
                    <th className="px-3 py-2">Managed</th>
                    <th className="px-3 py-2">Other</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ipv6Nd.data.map((n, i) => (
                    <tr key={n.id ?? i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-white">{n.interface ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.ra_interval ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.ra_lifetime ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.managed ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-slate-300">{n.other ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={n.disabled ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                          {n.disabled ? "Disabled" : "Active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function MikrotikRouter() {
  const [status, setStatus] = useState<MikrotikStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useHashTab("system", ["system", "interfaces", "vlans", "routes", "dhcp", "dns", "firewall", "vpn", "traffic", "policy-routing", "gateway-monitoring", "dynamic-routing"]);

  useEffect(() => {
    fetchMikrotikStatus()
      .then(setStatus)
      .catch(() =>
        setStatus({
          configured: false,
          reachable: false,
          version: null,
          uptime: null,
          cpu_load: null,
          total_memory: null,
          free_memory: null,
          board_name: null,
          architecture: null,
          platform: null,
        })
      )
      .finally(() => setLoading(false));
  }, []);

  const ifaces = useData(useCallback(() => fetchMikrotikInterfaces(), []));
  const vlans = useData(useCallback(() => fetchMikrotikVlans(), []));
  const routes = useData(useCallback(() => fetchMikrotikRoutes(), []));
  const dhcp = useData(useCallback(() => fetchMikrotikDhcpLeases(), []));
  const fw = useData(useCallback(() => fetchMikrotikFirewall(), []));
  const dns = useData(useCallback(() => fetchMikrotikDns(), []));
  const wg = useData(useCallback(() => fetchMikrotikWireguard(), []));
  const mangleRules = useData(useCallback(() => fetchMikrotikMangleRules(), []));
  const routingRulesData = useData(useCallback(() => fetchMikrotikRoutingRules(), []));
  const routingTablesData = useData(useCallback(() => fetchMikrotikRoutingTables(), []));
  const netwatchData = useData(useCallback(() => fetchMikrotikNetwatch(), []));
  const dynamicRouting = useData(useCallback(() => fetchMikrotikDynamicRouting(), []));
  const ipv6NdData = useData(useCallback(() => fetchMikrotikIpv6Nd(), []));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!status?.configured || !status?.reachable) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-slate-400">
          {!status?.configured
            ? "MikroTik router is not configured. Enable it in Settings."
            : "MikroTik router is unreachable. Check connection settings."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatusHeader status={status} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="border-slate-800 bg-slate-950">
          <TabsTrigger
            value="system"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Activity className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger
            value="interfaces"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Network className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Interfaces</span>
          </TabsTrigger>
          <TabsTrigger
            value="vlans"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Layers className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">VLANs</span>
          </TabsTrigger>
          <TabsTrigger
            value="routes"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Globe className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Routes</span>
          </TabsTrigger>
          <TabsTrigger
            value="dhcp"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Server className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">DHCP</span>
          </TabsTrigger>
          <TabsTrigger
            value="dns"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Search className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">DNS</span>
          </TabsTrigger>
          <TabsTrigger
            value="firewall"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Shield className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Firewall</span>
          </TabsTrigger>
          <TabsTrigger
            value="vpn"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Lock className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">VPN</span>
          </TabsTrigger>
          <TabsTrigger
            value="traffic"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <BarChart3 className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Traffic</span>
          </TabsTrigger>
          <TabsTrigger
            value="policy-routing"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <GitFork className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Policy Routing</span>
          </TabsTrigger>
          <TabsTrigger
            value="gateway-monitoring"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <HeartPulse className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Gateways</span>
          </TabsTrigger>
          <TabsTrigger
            value="dynamic-routing"
            className="data-[state=active]:bg-slate-800 data-[state=active]:text-white"
          >
            <Waypoints className="sm:mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dynamic Routing</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <SystemTab status={status} />
        </TabsContent>

        <TabsContent value="interfaces">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Network Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InterfacesTable
                data={ifaces.data}
                loading={ifaces.loading}
                error={ifaces.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vlans">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                VLAN Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VlansPanel
                data={vlans.data}
                loading={vlans.loading}
                error={vlans.error}
                reload={vlans.reload}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                Routing Table
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RoutesTable
                data={routes.data}
                loading={routes.loading}
                error={routes.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dhcp">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DHCP Server Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="leases">
                <TabsList className="border-slate-800 bg-slate-950 mb-4">
                  <TabsTrigger value="leases" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs">
                    Leases
                  </TabsTrigger>
                  <TabsTrigger value="servers" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs">
                    Servers
                  </TabsTrigger>
                  <TabsTrigger value="pools" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs">
                    IP Pools
                  </TabsTrigger>
                  <TabsTrigger value="networks" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs">
                    Networks
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-xs">
                    Logs
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="leases">
                  <DhcpLeasesTable
                    data={dhcp.data}
                    loading={dhcp.loading}
                    error={dhcp.error}
                    reload={dhcp.reload}
                  />
                </TabsContent>
                <TabsContent value="servers">
                  <DhcpServersSection reload={dhcp.reload} />
                </TabsContent>
                <TabsContent value="pools">
                  <DhcpPoolsSection />
                </TabsContent>
                <TabsContent value="networks">
                  <DhcpNetworksSection />
                </TabsContent>
                <TabsContent value="logs">
                  <DhcpLogsSection />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dns">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                DNS Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DnsPanel
                data={dns.data}
                loading={dns.loading}
                error={dns.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall" className="space-y-4">
          <FirewallPanel
            data={fw.data}
            loading={fw.loading}
            error={fw.error}
            reload={fw.reload}
          />
        </TabsContent>

        <TabsContent value="vpn">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-base text-white">
                WireGuard Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WireGuardPanel
                data={wg.data}
                loading={wg.loading}
                error={wg.error}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traffic">
          <TrafficTab />
        </TabsContent>

        <TabsContent value="policy-routing">
          <PolicyRoutingTab
            mangle={mangleRules}
            routingRules={routingRulesData}
            routingTables={routingTablesData}
          />
        </TabsContent>

        <TabsContent value="gateway-monitoring">
          <GatewayMonitoringTab netwatch={netwatchData} />
        </TabsContent>

        <TabsContent value="dynamic-routing">
          <DynamicRoutingTab dynamic={dynamicRouting} ipv6Nd={ipv6NdData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
