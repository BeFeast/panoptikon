"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  Download,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
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
  FileText,
  RefreshCw,
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
  autoLinkAssets,
  createAssetInventory,
  deleteAssetInventory,
  fetchAssets,
  importAssets,
  syncAssetsFromDevices,
  updateAssetInventory,
} from "@/lib/api";
import type { Asset, AssetRequest, AssetType, AssetStatus, AssetImportRow } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { downloadExport } from "@/lib/export";
import { loadAssetsWithDeviceSync } from "@/lib/assets";
import { PageTransition } from "@/components/PageTransition";
import { toast } from "sonner";
import { useApiFetch } from "@/hooks/useApiFetch";
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

const ASSET_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
];

function getAssetTypeConfig(type: AssetType) {
  return ASSET_TYPES.find((t) => t.value === type) ?? ASSET_TYPES[ASSET_TYPES.length - 1];
}

function getStatusColor(status: AssetStatus): string {
  switch (status) {
    case "active":
      return "border-[#4ade80]/50 text-[#4ade80]";
    case "inactive":
      return "border-mesh-text-mute/50 text-mesh-text-dim";
    case "maintenance":
      return "border-[#fbbf24]/50 text-[#fbbf24]";
    case "retired":
      return "border-[#fbbf24]/50 text-[#fbbf24]";
    case "disposed":
      return "border-[#fb7185]/50 text-[#fb7185]";
    default:
      return "border-mesh-text-mute/50 text-mesh-text-dim";
  }
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
    <Suspense fallback={<div className="text-mesh-text-mute py-20 text-center">Loading...</div>}>
      <AssetsPageInner />
    </Suspense>
  );
}

// ─── CSV parsing helper ─────────────────────────────────

function parseCSV(text: string): AssetImportRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const nameIdx = headers.indexOf("name");
  if (nameIdx === -1) return [];

  const rows: AssetImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[nameIdx]?.trim() ?? "";
    if (!name) continue;

    rows.push({
      name,
      asset_type: cols[headers.indexOf("asset_type")] || cols[headers.indexOf("type")] || undefined,
      status: cols[headers.indexOf("status")] || undefined,
      location: cols[headers.indexOf("location")] || undefined,
      owner: cols[headers.indexOf("owner")] || undefined,
      tags: cols[headers.indexOf("tags")] || undefined,
      notes: cols[headers.indexOf("notes")] || undefined,
      purchase_date: cols[headers.indexOf("purchase_date")] || undefined,
      serial_number: cols[headers.indexOf("serial_number")] || undefined,
    });
  }

  return rows;
}

/** Parse a single CSV line, handling quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Main list page ─────────────────────────────────────

function AssetsListPage() {
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");

  const { data: assets, error, mutate } = useApiFetch<Asset[]>(
    "/api/v1/assets",
    () => loadAssetsWithDeviceSync({ fetchAssets, syncAssetsFromDevices }),
    { refreshInterval: 30_000 },
  );

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!assets) return null;
    let result = assets;

    if (typeFilter) {
      result = result.filter((a) => a.asset_type === typeFilter);
    }

    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }

    if (locationFilter) {
      result = result.filter((a) => a.location === locationFilter);
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
  }, [assets, search, typeFilter, statusFilter, locationFilter]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAssetInventory(pendingDelete.id);
      mutate(
        (prev) => prev?.filter((a) => a.id !== pendingDelete.id) ?? [],
        { revalidate: false },
      );
      toast.success("Asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const handleAutoLink = async () => {
    try {
      const result = await autoLinkAssets();
      if (result.linked > 0) {
        toast.success(`Linked ${result.linked} asset(s) to network devices`);
        mutate();
      } else {
        toast.info("No unlinked assets could be matched to devices");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-link failed");
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncFromDevices = async () => {
    setSyncing(true);
    try {
      const result = await syncAssetsFromDevices();
      if (result.created > 0) {
        toast.success(`Created ${result.created} asset(s) from discovered devices`);
        mutate();
      } else {
        toast.info("All discovered devices already have linked assets");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePdfExport = () => {
    if (!filtered || filtered.length === 0) {
      toast.error("No assets to export");
      return;
    }

    const html = `<!DOCTYPE html>
<html><head><title>Panoptikon Asset Inventory</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .active { background: #d1fae5; color: #065f46; }
  .inactive { background: #e2e8f0; color: #475569; }
  .maintenance { background: #fef3c7; color: #92400e; }
  .retired { background: #fed7aa; color: #9a3412; }
  .disposed { background: #fecaca; color: #991b1b; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Panoptikon Asset Inventory</h1>
<div class="meta">Exported on ${new Date().toLocaleDateString()} &mdash; ${filtered.length} assets</div>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Location</th><th>Owner</th><th>IP</th><th>Serial</th><th>Updated</th></tr></thead>
<tbody>
${filtered
  .map(
    (a) =>
      `<tr><td>${esc(a.name)}</td><td>${esc(getAssetTypeConfig(a.asset_type).label)}</td><td><span class="badge ${a.status}">${esc(a.status)}</span></td><td>${esc(a.location ?? "")}</td><td>${esc(a.owner ?? "")}</td><td>${esc(a.ip ?? "")}</td><td>${esc(a.serial_number ?? "")}</td><td>${esc(a.updated_at)}</td></tr>`,
  )
  .join("\n")}
</tbody></table></body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  // Collect unique types/statuses/locations for filter dropdowns
  const availableTypes = useMemo(() => {
    if (!assets) return [];
    const types = new Set(assets.map((a) => a.asset_type));
    return ASSET_TYPES.filter((t) => types.has(t.value));
  }, [assets]);

  const availableStatuses = useMemo(() => {
    if (!assets) return [];
    const statuses = new Set(assets.map((a) => a.status));
    return ASSET_STATUSES.filter((s) => statuses.has(s.value));
  }, [assets]);

  const availableLocations = useMemo(() => {
    if (!assets) return [];
    const locs = new Set(assets.map((a) => a.location).filter(Boolean) as string[]);
    return Array.from(locs).sort();
  }, [assets]);

  const hasFilters = search || typeFilter || statusFilter || locationFilter;

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#fb7185]">{error}</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-display text-mesh-text">Assets</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-dim hover:text-mesh-text gap-1.5"
              onClick={handleSyncFromDevices}
              disabled={syncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Import from Devices"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-dim hover:text-mesh-text gap-1.5"
              onClick={handleAutoLink}
            >
              <Link2 className="h-3.5 w-3.5" />
              Auto-link
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-mesh-border text-mesh-text-dim hover:text-mesh-text gap-1.5"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-mesh-border text-mesh-text-dim hover:text-mesh-text gap-1.5"
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
                <DropdownMenuItem onClick={handlePdfExport}>
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  Print / Save as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AssetFormDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              onSaved={() => {
                setAddOpen(false);
                mutate();
              }}
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
            <Input
              placeholder="Search by name, location, IP, owner, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-mesh-text-mute hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex h-10 mesh-card px-3 py-2 text-sm text-mesh-text focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30"
          >
            <option value="">All types</option>
            {availableTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 mesh-card px-3 py-2 text-sm text-mesh-text focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30"
          >
            <option value="">All statuses</option>
            {availableStatuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="flex h-10 mesh-card px-3 py-2 text-sm text-mesh-text focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30"
          >
            <option value="">All locations</option>
            {availableLocations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {hasFilters && filtered && (
            <span className="text-xs text-mesh-text-mute">
              Showing {filtered.length} of {assets?.length ?? 0} assets
            </span>
          )}
        </div>

        {/* Table */}
        <div className="mesh-card">
          {filtered === null ? (
            <Table>
              <TableHeader>
                <TableRow className="border-mesh-border hover:bg-transparent">
                  <TableHead className="text-mesh-text-mute">Name</TableHead>
                  <TableHead className="text-mesh-text-mute">Type</TableHead>
                  <TableHead className="text-mesh-text-mute">Status</TableHead>
                  <TableHead className="text-mesh-text-mute">Location</TableHead>
                  <TableHead className="text-mesh-text-mute">Owner</TableHead>
                  <TableHead className="text-mesh-text-mute">IP</TableHead>
                  <TableHead className="text-mesh-text-mute">Last Seen</TableHead>
                  <TableHead className="text-mesh-text-mute">Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-mesh-border">
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Box className="mb-4 h-12 w-12 text-mesh-text-mute" />
              <p className="text-lg font-medium text-mesh-text-dim">
                {hasFilters ? "No assets match your filters" : "No assets yet"}
              </p>
              <p className="mt-1 text-sm text-mesh-text-mute">
                {hasFilters
                  ? "Try adjusting your search or filter criteria."
                  : "Click \"Import from Devices\" to create assets from discovered network devices, or add one manually."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-mesh-border hover:bg-transparent">
                  <TableHead className="text-mesh-text-mute">Name</TableHead>
                  <TableHead className="text-mesh-text-mute">Type</TableHead>
                  <TableHead className="text-mesh-text-mute">Status</TableHead>
                  <TableHead className="text-mesh-text-mute">Location</TableHead>
                  <TableHead className="text-mesh-text-mute">Owner</TableHead>
                  <TableHead className="text-mesh-text-mute">IP</TableHead>
                  <TableHead className="text-mesh-text-mute">Last Seen</TableHead>
                  <TableHead className="text-mesh-text-mute">Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((asset, index) => {
                  const typeConfig = getAssetTypeConfig(asset.asset_type);
                  const TypeIcon = typeConfig.icon;

                  // Derive last seen from linked device
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
                      className="border-b border-mesh-border transition-colors hover:bg-mesh-surface-2 data-[state=selected]:bg-muted"
                    >
                      <TableCell className="font-medium text-white">
                        {asset.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-mesh-text-dim">
                          <TypeIcon className="h-4 w-4 shrink-0" />
                          <span className="text-sm">{typeConfig.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusColor(asset.status)}
                        >
                          {asset.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {asset.location ?? "\u2014"}
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {asset.owner ?? "\u2014"}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-mesh-text-dim">
                        {asset.ip ?? "\u2014"}
                      </TableCell>
                      <TableCell className="text-mesh-text-dim">
                        {lastSeen ? timeAgo(lastSeen) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-mesh-text-dim text-xs">
                        {timeAgo(asset.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditAsset(asset)}
                            className="rounded p-1 text-mesh-text-mute hover:bg-mesh-surface-2 hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(asset)}
                            className="rounded p-1 text-mesh-text-mute hover:bg-[#fb7185]/10 hover:text-[#fb7185] transition-colors"
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
              mutate();
            }}
          />
        )}

        {/* Import CSV dialog */}
        <ImportCSVDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => {
            setImportOpen(false);
            mutate();
          }}
        />

        {/* Delete confirmation */}
        <AlertDialog
          open={!!pendingDelete}
          onOpenChange={(v) => {
            if (!v) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fb7185]/10">
                  <AlertTriangle className="h-5 w-5 text-[#fb7185]" />
                </div>
                <AlertDialogTitle className="text-white">
                  Delete asset?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription className="pl-[52px] text-mesh-text-dim">
                <span className="font-medium text-white">
                  {pendingDelete?.name}
                </span>{" "}
                will be permanently removed from the inventory.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="bg-transparent text-mesh-text-dim hover:bg-mesh-surface-2 hover:text-mesh-text"
                disabled={deleting}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                autoFocus
                className="bg-[#fb7185] text-white hover:bg-[#fb7185]/90"
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

// ─── HTML escape helper ─────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Status Badge ───────────────────────────────────────

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        online
          ? "border-[#4ade80]/50 text-[#4ade80]"
          : "border-[#fb7185]/50 text-[#fb7185]"
      }
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          online
            ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30 status-glow-online"
            : "bg-[#fb7185] ring-2 ring-[#fb7185]/30 status-glow-offline"
        }`}
      />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

// ─── Import CSV Dialog ──────────────────────────────────

function ImportCSVDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AssetImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows([]);
      setResult(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      if (parsed.length === 0) {
        setResult("No valid rows found. CSV must have a 'name' column header.");
      } else {
        setResult(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await importAssets(rows);
      setResult(
        `Imported ${res.imported} asset(s), skipped ${res.skipped}.` +
          (res.errors.length > 0 ? ` Errors: ${res.errors.join("; ")}` : ""),
      );
      if (res.imported > 0) {
        toast.success(`${res.imported} asset(s) imported`);
        onImported();
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-white">Import Assets from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: name, asset_type, status, location, owner, tags,
            serial_number, purchase_date, notes. Only &quot;name&quot; is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="file:text-mesh-text-dim"
          />

          {rows.length > 0 && (
            <p className="text-sm text-mesh-text-dim">
              {rows.length} row(s) parsed and ready to import.
            </p>
          )}

          {result && (
            <p className="text-sm text-mesh-text whitespace-pre-wrap">{result}</p>
          )}

          <Button
            onClick={handleImport}
            disabled={loading || rows.length === 0}
            className="w-full"
          >
            {loading ? "Importing..." : `Import ${rows.length} Asset(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [status, setStatus] = useState<AssetStatus>(
    existing?.status ?? "active",
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
      setStatus(existing?.status ?? "active");
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
      status,
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
    <DialogContent className="w-full max-w-[560px]">
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
        <div className="grid grid-cols-2 gap-5">
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
              className="flex h-10 w-full mesh-card px-3 py-2 text-sm text-mesh-text focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status + Location */}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AssetStatus)}
              className="flex h-10 w-full mesh-card px-3 py-2 text-sm text-mesh-text focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30"
            >
              {ASSET_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              placeholder="e.g. DC-1 Rack A"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>

        {/* Owner + Tags */}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input
              placeholder="e.g. ops-team"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Tags
              <span className="ml-2 text-xs text-mesh-text-mute">
                JSON array, e.g. [&quot;production&quot;, &quot;web&quot;]
              </span>
            </Label>
            <Input
              placeholder='["production", "critical"]'
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
        </div>

        {/* Serial + Purchase Date */}
        <div className="grid grid-cols-2 gap-5">
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
            className="w-full mesh-card px-3 py-2 text-sm text-mesh-text placeholder:text-mesh-text-mute focus:border-mesh-accent focus:outline-none focus:ring-2 focus:ring-mesh-accent/30 min-h-[80px]"
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {formError && <p className="text-sm text-[#fb7185]">{formError}</p>}

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
