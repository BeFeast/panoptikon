"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Server,
  Monitor,
  Container,
  HardDrive,
  Router,
  Smartphone,
  Printer,
  Cpu,
  Wifi,
  CircleHelp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createAssetInventory,
  deleteAssetInventory,
  fetchAssets,
  updateAssetInventory,
} from "@/lib/api";
import type { Asset, AssetRequest, AssetType } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { downloadExport } from "@/lib/export";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import { motion } from "framer-motion";
import AssetDetailContent from "./detail/content";

// ─── Asset type config ──────────────────────────────────

const ASSET_TYPES: { value: AssetType; label: string; icon: typeof Server }[] = [
  { value: "server", label: "Server", icon: Server },
  { value: "workstation", label: "Workstation", icon: Monitor },
  { value: "vm", label: "VM", icon: Cpu },
  { value: "container", label: "Container", icon: Container },
  { value: "nas", label: "NAS", icon: HardDrive },
  { value: "router", label: "Router", icon: Router },
  { value: "access_point", label: "Access Point", icon: Wifi },
  { value: "switch", label: "Switch", icon: Wifi },
  { value: "iot", label: "IoT", icon: Cpu },
  { value: "phone", label: "Phone", icon: Smartphone },
  { value: "printer", label: "Printer", icon: Printer },
  { value: "unknown", label: "Unknown", icon: CircleHelp },
];

function getAssetTypeConfig(type: AssetType) {
  return ASSET_TYPES.find((t) => t.value === type) ?? ASSET_TYPES[ASSET_TYPES.length - 1];
}

// ─── Router — detail vs list ────────────────────────────

function AssetsPageInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  if (id) {
    return <AssetDetailContent />;
  }

  return <AssetsListPage />;
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-20 text-center">Loading...</div>}>
      <AssetsPageInner />
    </Suspense>
  );
}

// ─── Main list page ─────────────────────────────────────

function AssetsListPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setAssets(await fetchAssets());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!assets) return null;
    let result = assets;

    if (typeFilter) {
      result = result.filter((a) => a.asset_type === typeFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.location?.toLowerCase().includes(q) ||
          a.owner?.toLowerCase().includes(q) ||
          a.ip?.toLowerCase().includes(q) ||
          a.serial_number?.toLowerCase().includes(q) ||
          a.tags?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [assets, search, typeFilter]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAssetInventory(pendingDelete.id);
      setAssets((prev) => prev?.filter((a) => a.id !== pendingDelete.id) ?? null);
      toast.success("Asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  // Collect unique types present in data for the filter dropdown
  const availableTypes = useMemo(() => {
    if (!assets) return [];
    const types = new Set(assets.map((a) => a.asset_type));
    return ASSET_TYPES.filter((t) => types.has(t.value));
  }, [assets]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Assets</h1>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-slate-400 hover:text-gray-200 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await downloadExport("/api/v1/assets/export?format=csv", "panoptikon-assets.csv");
                      toast.success("Assets exported as CSV");
                    } catch { toast.error("Export failed"); }
                  }}
                >
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await downloadExport("/api/v1/assets/export?format=json", "panoptikon-assets.json");
                      toast.success("Assets exported as JSON");
                    } catch { toast.error("Export failed"); }
                  }}
                >
                  Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AssetFormDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              onSaved={() => {
                setAddOpen(false);
                load();
              }}
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by name, location, IP, owner, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-700 bg-slate-800/50 pl-9 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex h-10 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All types</option>
            {availableTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {(search || typeFilter) && filtered && (
            <span className="text-xs text-slate-500">
              Showing {filtered.length} of {assets?.length ?? 0} assets
            </span>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-800 bg-slate-900">
          {filtered === null ? (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500">Name</TableHead>
                  <TableHead className="text-slate-500">Type</TableHead>
                  <TableHead className="text-slate-500">Location</TableHead>
                  <TableHead className="text-slate-500">IP</TableHead>
                  <TableHead className="text-slate-500">OS</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="text-slate-500">Last Seen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-slate-800">
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Box className="mb-4 h-12 w-12 text-slate-600" />
              <p className="text-lg font-medium text-slate-400">
                {search || typeFilter ? "No assets match your filters" : "No assets yet"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {search || typeFilter
                  ? "Try adjusting your search or filter criteria."
                  : "Add an asset to start tracking your IT inventory."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500">Name</TableHead>
                  <TableHead className="text-slate-500">Type</TableHead>
                  <TableHead className="text-slate-500">Location</TableHead>
                  <TableHead className="text-slate-500">IP</TableHead>
                  <TableHead className="text-slate-500">OS</TableHead>
                  <TableHead className="text-slate-500">Status</TableHead>
                  <TableHead className="text-slate-500">Last Seen</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((asset, index) => {
                  const typeConfig = getAssetTypeConfig(asset.asset_type);
                  const TypeIcon = typeConfig.icon;

                  // Derive OS from linked agent or SSH target
                  const os = asset.agent_os ?? asset.ssh_os ?? null;

                  // Derive online status from linked sources
                  const online = asset.device_online ?? asset.agent_online ?? asset.ssh_online ?? null;

                  // Derive last seen
                  const lastSeen = asset.device_last_seen;

                  return (
                    <motion.tr
                      key={asset.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.18,
                        ease: "easeOut",
                        delay: Math.min(index * 0.015, 0.12),
                      }}
                      className="border-b border-slate-800 transition-colors hover:bg-slate-800/60 data-[state=selected]:bg-muted"
                    >
                      <TableCell className="font-medium text-white">
                        {asset.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <TypeIcon className="h-4 w-4 shrink-0" />
                          <span className="text-sm">{typeConfig.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {asset.location ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-slate-400">
                        {asset.ip ?? "—"}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {os ?? "—"}
                      </TableCell>
                      <TableCell>
                        {online !== null ? (
                          <StatusBadge online={online} />
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-400">
                        {lastSeen ? timeAgo(lastSeen) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditAsset(asset)}
                            className="rounded p-1 text-slate-600 hover:bg-slate-800/60 hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(asset)}
                            className="rounded p-1 text-slate-600 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Edit dialog */}
        {editAsset && (
          <AssetFormDialog
            open={!!editAsset}
            onOpenChange={(v) => {
              if (!v) setEditAsset(null);
            }}
            existing={editAsset}
            onSaved={() => {
              setEditAsset(null);
              load();
            }}
          />
        )}

        {/* Delete confirmation */}
        <AlertDialog
          open={!!pendingDelete}
          onOpenChange={(v) => {
            if (!v) setPendingDelete(null);
          }}
        >
          <AlertDialogContent className="border-slate-800 bg-slate-950">
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                  <AlertTriangle className="h-5 w-5 text-rose-400" />
                </div>
                <AlertDialogTitle className="text-white">
                  Delete asset?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="pl-[52px] text-slate-400">
                <span className="font-medium text-white">
                  {pendingDelete?.name}
                </span>{" "}
                will be permanently removed from the inventory.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="border-slate-800 bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white"
                disabled={deleting}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                autoFocus
                className="bg-rose-600 text-white hover:bg-rose-500"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageTransition>
  );
}

// ─── Status Badge ───────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        online
          ? "border-emerald-500/50 text-emerald-400"
          : "border-rose-500/50 text-rose-400"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online
            ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
            : "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline"
        }`}
      />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

// ─── Add / Edit Form Dialog ─────────────────────────────

function AssetFormDialog({
  open,
  onOpenChange,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Asset;
  onSaved: () => void;
}) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(
    existing?.asset_type ?? "unknown",
  );
  const [location, setLocation] = useState(existing?.location ?? "");
  const [owner, setOwner] = useState(existing?.owner ?? "");
  const [tags, setTags] = useState(existing?.tags ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [purchaseDate, setPurchaseDate] = useState(
    existing?.purchase_date ?? "",
  );
  const [serialNumber, setSerialNumber] = useState(
    existing?.serial_number ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setAssetType(existing?.asset_type ?? "unknown");
      setLocation(existing?.location ?? "");
      setOwner(existing?.owner ?? "");
      setTags(existing?.tags ?? "");
      setNotes(existing?.notes ?? "");
      setPurchaseDate(existing?.purchase_date ?? "");
      setSerialNumber(existing?.serial_number ?? "");
      setFormError(null);
    }
  }, [open, existing]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    const body: AssetRequest = {
      name: name.trim(),
      asset_type: assetType,
      location: location || undefined,
      owner: owner || undefined,
      tags: tags || undefined,
      notes: notes || undefined,
      purchase_date: purchaseDate || undefined,
      serial_number: serialNumber || undefined,
    };

    setLoading(true);
    setFormError(null);
    try {
      if (isEdit) {
        await updateAssetInventory(existing!.id, body);
        toast.success("Asset updated");
      } else {
        await createAssetInventory(body);
        toast.success("Asset added");
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const dialogContent = (
    <DialogContent className="w-full max-w-[560px] border-slate-800 bg-slate-950">
      <DialogHeader>
        <DialogTitle className="text-white">
          {isEdit ? "Edit Asset" : "Add Asset"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update this asset's details."
            : "Register a new asset in your IT inventory."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        {/* Name + Type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. web-server-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="flex h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Location + Owner */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              placeholder="e.g. DC-1 Rack A"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input
              placeholder="e.g. ops-team"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>
            Tags
            <span className="ml-2 text-xs text-slate-500">
              JSON array, e.g. ["production", "web"]
            </span>
          </Label>
          <Input
            placeholder='["production", "critical"]'
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        {/* Serial + Purchase Date */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Serial Number</Label>
            <Input
              placeholder="e.g. SN-12345"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Purchase Date</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="text-white [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label>Notes</Label>
          <textarea
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {formError && <p className="text-sm text-rose-400">{formError}</p>}

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Saving..." : isEdit ? "Update" : "Add Asset"}
        </Button>
      </div>
    </DialogContent>
  );

  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
