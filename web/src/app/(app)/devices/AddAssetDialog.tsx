"use client";

// Extracted from the legacy /devices page so the new literal-port page can
// continue offering an "Add device" surface without owning the form code.
// The form body is preserved verbatim — only imports were lifted to the top
// of the module and the function signature exported.

import { useState } from "react";
import {
  Battery,
  Box,
  CircuitBoard,
  Container,
  Gamepad2,
  HardDrive,
  HelpCircle,
  Laptop,
  Loader2,
  Monitor,
  Network,
  Plus,
  Printer,
  Router,
  Server,
  Smartphone,
  Tablet,
  Tv,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createAsset } from "@/lib/api";
import type { CreateAssetRequest } from "@/lib/api";

const OS_OPTIONS = ["", "iOS", "Android", "Windows", "macOS", "Linux", "Other"];

const ASSET_TYPE_OPTIONS: { value: string; label: string; icon: React.ElementType }[] = [
  { value: "server", label: "Server", icon: Server },
  { value: "workstation", label: "Workstation", icon: Monitor },
  { value: "vm", label: "VM", icon: Box },
  { value: "container", label: "Container", icon: Container },
  { value: "nas", label: "NAS", icon: HardDrive },
  { value: "router", label: "Router", icon: Router },
  { value: "switch", label: "Switch", icon: Network },
  { value: "iot", label: "IoT", icon: CircuitBoard },
  { value: "phone", label: "Phone", icon: Smartphone },
  { value: "printer", label: "Printer", icon: Printer },
  { value: "ups", label: "UPS", icon: Battery },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "laptop", label: "Laptop", icon: Laptop },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "tv", label: "TV", icon: Tv },
  { value: "gaming", label: "Gaming", icon: Gamepad2 },
  { value: "other", label: "Other", icon: HelpCircle },
];

export function AddAssetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [ip, setIp] = useState("");
  const [mac, setMac] = useState("");
  const [location, setLocation] = useState("");
  const [model, setModel] = useState("");
  const [vendor, setVendor] = useState("");
  const [cpuManual, setCpuManual] = useState("");
  const [ramManual, setRamManual] = useState("");
  const [diskManual, setDiskManual] = useState("");
  const [os, setOs] = useState("");
  const [osVersion, setOsVersion] = useState("");
  const [owner, setOwner] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");

  const resetForm = () => {
    setName(""); setAssetType(""); setIp(""); setMac(""); setLocation("");
    setModel(""); setVendor(""); setCpuManual(""); setRamManual(""); setDiskManual("");
    setOs(""); setOsVersion(""); setOwner(""); setTags(""); setNotes("");
    setPurchaseDate(""); setSerialNumber(""); setWarrantyExpiry("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body: CreateAssetRequest = {
        is_manual: true,
        custom_name: name.trim(),
      };
      if (assetType) body.custom_type = assetType;
      if (ip.trim()) body.ip = ip.trim();
      if (mac.trim()) body.mac = mac.trim();
      if (location.trim()) body.location = location.trim();
      if (model.trim()) body.custom_model = model.trim();
      if (vendor.trim()) body.custom_vendor = vendor.trim();
      if (cpuManual.trim()) body.cpu_manual = cpuManual.trim();
      if (ramManual.trim()) body.ram_manual = ramManual.trim();
      if (diskManual.trim()) body.disk_manual = diskManual.trim();
      if (os.trim()) body.custom_os = os.trim();
      if (owner.trim()) body.owner = owner.trim();
      if (tags.trim()) body.tags = tags.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (purchaseDate) body.purchase_date = purchaseDate;
      if (serialNumber.trim()) body.serial_number = serialNumber.trim();
      if (warrantyExpiry) body.warranty_expiry = warrantyExpiry;

      await createAsset(body);
      toast.success("Asset created");
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-mesh-border-strong bg-mesh-surface-1/95 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add Asset</DialogTitle>
          <DialogDescription>
            Manually register a device that can&apos;t be auto-discovered (switches, printers, IoT, UPS, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Name (required) */}
          <div>
            <label className="text-[11px] font-medium text-mesh-text-dim">
              Name <span className="text-[#fb7185]">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Switch, Main Printer"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          {/* Type selector with icons */}
          <div>
            <label className="text-[11px] font-medium text-mesh-text-dim">Type</label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {ASSET_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = assetType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAssetType(isSelected ? "" : opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] transition-colors ${
                      isSelected
                        ? "border-mesh-primary bg-mesh-primary/10 text-mesh-primary"
                        : "border-mesh-border-strong bg-mesh-surface-1 text-mesh-text-dim hover:border-mesh-text-mute hover:text-mesh-text"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network info */}
          <div>
            <p className="text-[11px] font-medium text-mesh-text-dim">Network</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-mesh-text-mute">IP Address</label>
                <Input
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="e.g. 10.10.0.1"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">MAC Address</label>
                <Input
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Hardware */}
          <div>
            <p className="text-[11px] font-medium text-mesh-text-dim">Hardware</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-mesh-text-mute">Vendor / Manufacturer</label>
                <Input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g. Cisco, HP, APC"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">Model</label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. SG350-28, LaserJet Pro"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">CPU</label>
                <Input
                  value={cpuManual}
                  onChange={(e) => setCpuManual(e.target.value)}
                  placeholder="e.g. Intel i5-12400"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">RAM</label>
                <Input
                  value={ramManual}
                  onChange={(e) => setRamManual(e.target.value)}
                  placeholder="e.g. 16 GB DDR4"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-mesh-text-mute">Disk</label>
                <Input
                  value={diskManual}
                  onChange={(e) => setDiskManual(e.target.value)}
                  placeholder="e.g. 512 GB NVMe SSD"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Software */}
          <div>
            <p className="text-[11px] font-medium text-mesh-text-dim">Software</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-mesh-text-mute">OS</label>
                <select
                  value={os}
                  onChange={(e) => setOs(e.target.value)}
                  className="flex h-8 w-full mesh-card px-3 text-sm text-mesh-text focus:outline-none focus:ring-1 focus:ring-mesh-text-mute"
                >
                  <option value="">Select OS…</option>
                  {OS_OPTIONS.filter(Boolean).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">OS Version</label>
                <Input
                  value={osVersion}
                  onChange={(e) => setOsVersion(e.target.value)}
                  placeholder="e.g. 22.04, 15.2"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Location & ownership */}
          <div>
            <p className="text-[11px] font-medium text-mesh-text-dim">Location &amp; Ownership</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-mesh-text-mute">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Server Room, Office 2F"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">Owner</label>
                <Input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="e.g. IT Department"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-mesh-text-mute">Tags (comma-separated)</label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. production, critical, floor-2"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Asset management */}
          <div>
            <p className="text-[11px] font-medium text-mesh-text-dim">Asset Management</p>
            <div className="mt-1.5 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-mesh-text-mute">Purchase Date</label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">Serial Number</label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. SN123456"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-mesh-text-mute">Warranty Expiry</label>
                <Input
                  type="date"
                  value={warrantyExpiry}
                  onChange={(e) => setWarrantyExpiry(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-medium text-mesh-text-dim">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this asset…"
              rows={2}
              className="mt-1.5 flex w-full mesh-card px-3 py-2 text-sm text-mesh-text placeholder:text-mesh-text-mute focus:outline-none focus:ring-1 focus:ring-mesh-text-mute"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !name.trim()} onClick={handleSubmit}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create Asset
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

