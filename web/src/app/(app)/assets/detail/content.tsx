"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Cpu,
  ExternalLink,
  HardDrive,
  MapPin,
  Monitor,
  Pencil,
  Server,
  Tag,
  Terminal,
  Timer,
  User,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchDevice,
  fetchDeviceSysinfo,
  fetchAgentReports,
  fetchSshTargetReports,
  fetchSshTargets,
  fetchPortScan,
  updateDevice,
} from "@/lib/api";
import type { DeviceCustomFields, PortScanResult } from "@/lib/api";
import type { Device, DeviceSysinfo, AgentReport, SshTarget, SshReport } from "@/lib/types";
import { formatBytes, formatPercent, timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";
import { getDeviceIcon } from "@/lib/device-icons";
import { getOsDisplay } from "@/lib/os-icons";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────

interface EditState {
  field: string | null;
  value: string;
}

interface ChartPoint {
  time: string;
  cpu: number | null;
  ram: number | null;
}

// ─── Main Component ─────────────────────────────────────

export default function AssetDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  const [device, setDevice] = useState<Device | null>(null);
  const [sysinfo, setSysinfo] = useState<DeviceSysinfo | null | undefined>(undefined);
  const [agentReports, setAgentReports] = useState<AgentReport[] | null>(null);
  const [sshReports, setSshReports] = useState<SshReport[] | null>(null);
  const [linkedSshTarget, setLinkedSshTarget] = useState<SshTarget | null>(null);
  const [portScan, setPortScan] = useState<PortScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ field: null, value: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [dev, sys] = await Promise.all([
        fetchDevice(id),
        fetchDeviceSysinfo(id),
      ]);
      setDevice(dev);
      setSysinfo(sys);

      // Load agent reports if agent is linked
      if (dev.agent) {
        try {
          const reports = await fetchAgentReports(dev.agent.id, 100);
          setAgentReports(reports);
        } catch {
          setAgentReports(null);
        }
      }

      // Load cached port scan results (null means no scan yet)
      try {
        const scan = await fetchPortScan(id);
        setPortScan(scan);
      } catch {
        setPortScan(null);
      }

      // Find SSH target linked by matching IP
      try {
        const sshTargets = await fetchSshTargets();
        const match = sshTargets.find(
          (t) => dev.ips.includes(t.host) || t.name === (dev.custom_name || dev.name || dev.hostname)
        );
        if (match) {
          setLinkedSshTarget(match);
          try {
            const reports = await fetchSshTargetReports(match.id, 100);
            setSshReports(reports);
          } catch {
            setSshReports(null);
          }
        }
      } catch {
        // SSH targets not available
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load asset");
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      router.replace("/devices");
      return;
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [id, load, router]);

  useWsEvent(
    ["device_online", "device_offline", "agent_report", "agent_online", "agent_offline", "ssh_report"],
    load
  );

  // ─── Save inline edit ──────────────────────────────

  const saveField = async (field: string, value: string) => {
    if (!device) return;
    setSaving(true);
    try {
      const body: DeviceCustomFields = { [field]: value || undefined };
      await updateDevice(device.id, body);
      toast.success("Updated successfully");
      setEdit({ field: null, value: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => setEdit({ field: null, value: "" });

  // ─── Render guards ─────────────────────────────────

  if (!id) return null;

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ─── Derived values ─────────────────────────────────

  const effectiveName = device.hostname || device.custom_name || device.name || device.vendor || device.mac;
  const effectiveType = device.custom_type || device.device_type || null;
  const effectiveOs = device.custom_os || device.os_family || sysinfo?.os_name || null;
  const effectiveOsVersion = device.os_version || sysinfo?.os_version || null;
  const effectiveVendor = device.custom_vendor || device.device_brand || device.vendor || null;
  const effectiveModel = device.custom_model || device.device_model || sysinfo?.hardware_model || null;
  const effectiveCpu = sysinfo?.cpu_name || device.cpu_manual || null;
  const effectiveCpuCores = sysinfo?.cpu_cores ?? null;
  const effectiveCpuSpeed = sysinfo?.cpu_speed ?? null;
  const effectiveRam = sysinfo?.ram_total || device.ram_manual || null;
  const effectiveDiskName = sysinfo?.disk_name || null;
  const effectiveDiskSize = sysinfo?.disk_size || device.disk_manual || null;
  const effectiveGpu = sysinfo?.gpu_name || null;
  const effectiveSerial = sysinfo?.serial_number || device.serial_number || null;
  const effectiveUptime = sysinfo?.uptime_seconds ?? (linkedSshTarget?.uptime_seconds ?? null);

  const { icon: DeviceIcon, label: typeLabel } = getDeviceIcon(
    device.vendor,
    device.hostname,
    device.mdns_services,
    effectiveType,
  );
  const osDisplay = getOsDisplay(effectiveOs);

  // Build chart data from agent or SSH reports
  const chartData = buildChartData(agentReports, sshReports);
  const hasLiveMetrics = chartData.length > 0;

  return (
    <div className="space-y-8">
      {/* Back link + Header */}
      <div>
        <Link
          href="/devices"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          Back to Devices
        </Link>

        <AssetHeader
          device={device}
          effectiveName={effectiveName}
          effectiveType={effectiveType}
          typeLabel={typeLabel}
          DeviceIcon={DeviceIcon}
          osDisplay={osDisplay}
          edit={edit}
          setEdit={setEdit}
          saving={saving}
          saveField={saveField}
          cancelEdit={cancelEdit}
        />
      </div>

      {/* Info Grid */}
      <InfoGrid
        device={device}
        sysinfo={sysinfo ?? null}
        portScan={portScan}
        effectiveOs={effectiveOs}
        effectiveOsVersion={effectiveOsVersion}
        effectiveVendor={effectiveVendor}
        effectiveModel={effectiveModel}
        effectiveCpu={effectiveCpu}
        effectiveCpuCores={effectiveCpuCores}
        effectiveCpuSpeed={effectiveCpuSpeed}
        effectiveRam={effectiveRam}
        effectiveDiskName={effectiveDiskName}
        effectiveDiskSize={effectiveDiskSize}
        effectiveGpu={effectiveGpu}
        effectiveSerial={effectiveSerial}
        effectiveUptime={effectiveUptime}
        edit={edit}
        setEdit={setEdit}
        saving={saving}
        saveField={saveField}
        cancelEdit={cancelEdit}
      />

      {/* Live Metrics Panel */}
      {hasLiveMetrics && <LiveMetricsPanel chartData={chartData} />}

      {/* Linked Sources */}
      <LinkedSources
        device={device}
        linkedSshTarget={linkedSshTarget}
      />

      {/* Notes (editable) */}
      <NotesSection
        device={device}
        edit={edit}
        setEdit={setEdit}
        saving={saving}
        saveField={saveField}
        cancelEdit={cancelEdit}
      />
    </div>
  );
}

// ─── Header Component ─────────────────────────────────────

function AssetHeader({
  device,
  effectiveName,
  effectiveType,
  typeLabel,
  DeviceIcon,
  osDisplay,
  edit,
  setEdit,
  saving,
  saveField,
  cancelEdit,
}: {
  device: Device;
  effectiveName: string;
  effectiveType: string | null;
  typeLabel: string;
  DeviceIcon: React.ComponentType<{ size?: number; className?: string }>;
  osDisplay: { label: string; colorClass: string } | null;
  edit: EditState;
  setEdit: (e: EditState) => void;
  saving: boolean;
  saveField: (field: string, value: string) => Promise<void>;
  cancelEdit: () => void;
}) {
  const tags = device.tags ? device.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="space-y-3">
      {/* Name + Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <DeviceIcon size={24} className="text-slate-400" />
        {edit.field === "custom_name" ? (
          <InlineEditInput
            value={edit.value}
            onChange={(v) => setEdit({ ...edit, value: v })}
            onSave={() => saveField("custom_name", edit.value)}
            onCancel={cancelEdit}
            saving={saving}
            className="text-2xl"
          />
        ) : (
          <h1
            className="text-2xl font-semibold text-white cursor-pointer hover:text-blue-400 transition-colors group flex items-center gap-2"
            onClick={() => setEdit({ field: "custom_name", value: device.custom_name || device.name || device.hostname || "" })}
          >
            {effectiveName}
            <Pencil size={14} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </h1>
        )}

        {/* Type badge */}
        {effectiveType && (
          <Badge variant="outline" className="border-slate-600 text-slate-400">
            {typeLabel}
          </Badge>
        )}

        {/* OS badge */}
        {osDisplay && (
          <Badge variant="outline" className={osDisplay.colorClass}>
            {osDisplay.label}
          </Badge>
        )}

        {/* Online/offline status */}
        <Badge
          variant="outline"
          className={
            device.is_online
              ? "border-emerald-500/50 text-emerald-400"
              : "border-rose-500/50 text-rose-400"
          }
        >
          <span
            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
              device.is_online
                ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                : "bg-rose-400 ring-2 ring-rose-400/30 status-glow-offline"
            }`}
          />
          {device.is_online ? "Online" : "Offline"}
        </Badge>
      </div>

      {/* Tags + Location + Owner */}
      <div className="flex items-center gap-3 flex-wrap text-sm text-slate-400">
        {/* Tags (editable) */}
        {edit.field === "tags" ? (
          <div className="flex items-center gap-1">
            <Tag size={14} className="text-slate-500" />
            <InlineEditInput
              value={edit.value}
              onChange={(v) => setEdit({ ...edit, value: v })}
              onSave={() => saveField("tags", edit.value)}
              onCancel={cancelEdit}
              saving={saving}
              placeholder="tag1, tag2, tag3"
            />
          </div>
        ) : (
          <span
            className="flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors group"
            onClick={() => setEdit({ field: "tags", value: device.tags || "" })}
          >
            <Tag size={14} className="text-slate-500" />
            {tags.length > 0 ? (
              <span className="flex gap-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </span>
            ) : (
              <span className="text-slate-600 italic">Add tags</span>
            )}
            <Pencil size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        )}

        <span className="text-slate-700">|</span>

        {/* Location (editable) */}
        {edit.field === "location" ? (
          <div className="flex items-center gap-1">
            <MapPin size={14} className="text-slate-500" />
            <InlineEditInput
              value={edit.value}
              onChange={(v) => setEdit({ ...edit, value: v })}
              onSave={() => saveField("location", edit.value)}
              onCancel={cancelEdit}
              saving={saving}
              placeholder="e.g. Server Room A"
            />
          </div>
        ) : (
          <span
            className="flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors group"
            onClick={() => setEdit({ field: "location", value: device.location || "" })}
          >
            <MapPin size={14} className="text-slate-500" />
            {device.location || <span className="text-slate-600 italic">Add location</span>}
            <Pencil size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        )}

        <span className="text-slate-700">|</span>

        {/* Owner (editable) */}
        {edit.field === "owner" ? (
          <div className="flex items-center gap-1">
            <User size={14} className="text-slate-500" />
            <InlineEditInput
              value={edit.value}
              onChange={(v) => setEdit({ ...edit, value: v })}
              onSave={() => saveField("owner", edit.value)}
              onCancel={cancelEdit}
              saving={saving}
              placeholder="e.g. John Doe"
            />
          </div>
        ) : (
          <span
            className="flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors group"
            onClick={() => setEdit({ field: "owner", value: device.owner || "" })}
          >
            <User size={14} className="text-slate-500" />
            {device.owner || <span className="text-slate-600 italic">Add owner</span>}
            <Pencil size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Info Grid ──────────────────────────────────────────────

function InfoGrid({
  device,
  sysinfo,
  portScan,
  effectiveOs,
  effectiveOsVersion,
  effectiveVendor,
  effectiveModel,
  effectiveCpu,
  effectiveCpuCores,
  effectiveCpuSpeed,
  effectiveRam,
  effectiveDiskName,
  effectiveDiskSize,
  effectiveGpu,
  effectiveSerial,
  effectiveUptime,
  edit,
  setEdit,
  saving,
  saveField,
  cancelEdit,
}: {
  device: Device;
  sysinfo: DeviceSysinfo | null;
  portScan: PortScanResult | null;
  effectiveOs: string | null;
  effectiveOsVersion: string | null;
  effectiveVendor: string | null;
  effectiveModel: string | null;
  effectiveCpu: string | null;
  effectiveCpuCores: number | null;
  effectiveCpuSpeed: string | null;
  effectiveRam: string | null;
  effectiveDiskName: string | null;
  effectiveDiskSize: string | null;
  effectiveGpu: string | null;
  effectiveSerial: string | null;
  effectiveUptime: number | null;
  edit: EditState;
  setEdit: (e: EditState) => void;
  saving: boolean;
  saveField: (field: string, value: string) => Promise<void>;
  cancelEdit: () => void;
}) {
  const cpuDetail = [
    effectiveCpu,
    effectiveCpuCores != null || effectiveCpuSpeed
      ? `(${[effectiveCpuCores != null ? `${effectiveCpuCores} cores` : null, effectiveCpuSpeed].filter(Boolean).join(" @ ")})`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const diskDetail = [
    effectiveDiskName,
    effectiveDiskSize ? `(${effectiveDiskSize})` : null,
  ]
    .filter(Boolean)
    .join(" ") || effectiveDiskSize;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* Hardware Column */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <HardDrive size={14} />
          Hardware
        </h3>
        <div className="space-y-2">
          <InfoRow
            label="Vendor / Brand"
            value={effectiveVendor}
            detected={!device.custom_vendor && !!(device.device_brand || device.vendor)}
          />
          <InfoRow
            label="Model"
            value={effectiveModel}
            detected={!device.custom_model && !!device.device_model}
          />
          <EditableInfoRow
            label="CPU"
            value={cpuDetail || null}
            field="cpu_manual"
            manualValue={device.cpu_manual}
            hasAutoValue={!!sysinfo?.cpu_name}
            edit={edit}
            setEdit={setEdit}
            saving={saving}
            saveField={saveField}
            cancelEdit={cancelEdit}
          />
          <EditableInfoRow
            label="RAM"
            value={effectiveRam}
            field="ram_manual"
            manualValue={device.ram_manual}
            hasAutoValue={!!sysinfo?.ram_total}
            edit={edit}
            setEdit={setEdit}
            saving={saving}
            saveField={saveField}
            cancelEdit={cancelEdit}
          />
          <EditableInfoRow
            label="Disk"
            value={diskDetail || null}
            field="disk_manual"
            manualValue={device.disk_manual}
            hasAutoValue={!!(sysinfo?.disk_name || sysinfo?.disk_size)}
            edit={edit}
            setEdit={setEdit}
            saving={saving}
            saveField={saveField}
            cancelEdit={cancelEdit}
          />
          <InfoRow label="GPU" value={effectiveGpu} />
        </div>
      </div>

      {/* Software Column */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <Monitor size={14} />
          Software
        </h3>
        <div className="space-y-2">
          <InfoRow
            label="OS"
            value={effectiveOs}
            detected={!device.custom_os && !!device.os_family}
          />
          <InfoRow label="OS Version" value={effectiveOsVersion} detected={!!device.os_version} />
          <InfoRow label="Hostname" value={device.hostname} detected={!!device.hostname} />
          <InfoRow
            label="Uptime"
            value={effectiveUptime != null ? formatUptime(effectiveUptime) : null}
          />
          {portScan && portScan.ports.length > 0 && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Open Ports
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {portScan.ports
                  .filter((p) => p.state === "open")
                  .map((p) => (
                    <Badge
                      key={`${p.port}/${p.protocol}`}
                      variant="outline"
                      className="border-slate-600 text-slate-300 text-[10px]"
                    >
                      {p.port}/{p.protocol}
                      {p.service ? ` (${p.service})` : ""}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
          <InfoRow
            label="Last Seen"
            value={device.last_seen_at ? timeAgo(device.last_seen_at) : null}
          />
          <EditableInfoRow
            label="Serial #"
            value={effectiveSerial}
            field="serial_number"
            manualValue={device.serial_number}
            hasAutoValue={!!sysinfo?.serial_number}
            edit={edit}
            setEdit={setEdit}
            saving={saving}
            saveField={saveField}
            cancelEdit={cancelEdit}
          />
        </div>
      </div>

      {/* Network Column */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <Cpu size={14} />
          Network
        </h3>
        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              IP Address(es)
            </span>
            <div className="mt-0.5">
              {device.ips.length > 0 ? (
                device.ips.map((ip) => (
                  <p key={ip} className="text-sm text-white font-mono tabular-nums">
                    {ip}
                  </p>
                ))
              ) : (
                <p className="text-sm text-slate-600">None</p>
              )}
            </div>
          </div>
          <InfoRow label="MAC Address" value={device.mac} mono />
          <InfoRow label="Vendor" value={effectiveVendor} />
          <InfoRow label="Last Seen" value={device.last_seen_at ? timeAgo(device.last_seen_at) : null} />
          <InfoRow label="First Seen" value={device.first_seen_at ? timeAgo(device.first_seen_at) : null} />
        </div>
      </div>

      {/* Asset Management (extra row) */}
      {(device.purchase_date || device.warranty_expiry) && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 md:col-span-2 lg:col-span-3">
          <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
            <Tag size={14} />
            Asset Management
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <EditableInfoRow
              label="Purchase Date"
              value={device.purchase_date}
              field="purchase_date"
              manualValue={device.purchase_date}
              hasAutoValue={false}
              edit={edit}
              setEdit={setEdit}
              saving={saving}
              saveField={saveField}
              cancelEdit={cancelEdit}
              placeholder="YYYY-MM-DD"
            />
            <EditableInfoRow
              label="Warranty Expiry"
              value={device.warranty_expiry}
              field="warranty_expiry"
              manualValue={device.warranty_expiry}
              hasAutoValue={false}
              edit={edit}
              setEdit={setEdit}
              saving={saving}
              saveField={saveField}
              cancelEdit={cancelEdit}
              placeholder="YYYY-MM-DD"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Metrics Panel ─────────────────────────────────

function LiveMetricsPanel({ chartData }: { chartData: ChartPoint[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* CPU Chart */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-400 mb-3">CPU Usage %</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, "CPU"]}
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RAM Chart */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-medium text-slate-400 mb-3">RAM Usage %</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                stroke="#1e293b"
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, "RAM"]}
              />
              <Line
                type="monotone"
                dataKey="ram"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Linked Sources ─────────────────────────────────────

function LinkedSources({
  device,
  linkedSshTarget,
}: {
  device: Device;
  linkedSshTarget: SshTarget | null;
}) {
  const hasAny = device.agent || linkedSshTarget || device.ips.length > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-400 mb-3">Linked Sources</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Network Device */}
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Monitor size={14} className="text-slate-500" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Network Device
            </span>
          </div>
          <div className="space-y-1 text-sm">
            {device.ips.length > 0 && (
              <p className="text-slate-300 font-mono text-xs">{device.ips[0]}</p>
            )}
            <p className="text-slate-500 font-mono text-xs">{device.mac}</p>
          </div>
          <Link
            href={`/devices`}
            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View in Devices <ExternalLink size={10} />
          </Link>
        </div>

        {/* Agent */}
        {device.agent ? (
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Server size={14} className="text-slate-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Agent
              </span>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  device.agent.is_online
                    ? "bg-emerald-400 ring-2 ring-emerald-400/30"
                    : "bg-rose-400 ring-2 ring-rose-400/30"
                }`}
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-slate-300">{device.agent.name || device.agent.id.slice(0, 8)}</p>
              {device.agent.cpu_percent != null && (
                <p className="text-slate-500 text-xs">CPU: {formatPercent(device.agent.cpu_percent)}</p>
              )}
            </div>
            <Link
              href={`/agents/detail?id=${device.agent.id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Agent Detail <ExternalLink size={10} />
            </Link>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/50 p-3 flex flex-col items-center justify-center text-center">
            <Server size={16} className="text-slate-700 mb-1" />
            <p className="text-xs text-slate-600">No Agent Linked</p>
          </div>
        )}

        {/* SSH Target */}
        {linkedSshTarget ? (
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={14} className="text-slate-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                SSH Target
              </span>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  linkedSshTarget.is_online
                    ? "bg-emerald-400 ring-2 ring-emerald-400/30"
                    : "bg-rose-400 ring-2 ring-rose-400/30"
                }`}
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-slate-300">{linkedSshTarget.name}</p>
              <p className="text-slate-500 font-mono text-xs">
                {linkedSshTarget.username}@{linkedSshTarget.host}:{linkedSshTarget.port}
              </p>
            </div>
            <Link
              href="/ssh-hosts"
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              SSH Hosts <ExternalLink size={10} />
            </Link>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/50 p-3 flex flex-col items-center justify-center text-center">
            <Terminal size={16} className="text-slate-700 mb-1" />
            <p className="text-xs text-slate-600">No SSH Target Linked</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notes Section ──────────────────────────────────────

function NotesSection({
  device,
  edit,
  setEdit,
  saving,
  saveField,
  cancelEdit,
}: {
  device: Device;
  edit: EditState;
  setEdit: (e: EditState) => void;
  saving: boolean;
  saveField: (field: string, value: string) => Promise<void>;
  cancelEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-400 mb-3">Notes</h3>
      {edit.field === "notes" ? (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-[80px] rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            placeholder="Add notes about this asset..."
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveField("notes", edit.value)}
              disabled={saving}
              className="h-7 px-2 text-xs"
            >
              <Check size={12} className="mr-1" />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelEdit}
              className="h-7 px-2 text-xs text-slate-400"
            >
              <X size={12} className="mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm text-slate-300 cursor-pointer hover:text-blue-400 transition-colors group"
          onClick={() => setEdit({ field: "notes", value: device.notes || "" })}
        >
          {device.notes || (
            <span className="text-slate-600 italic">Click to add notes...</span>
          )}
          <Pencil size={10} className="inline ml-2 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </p>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────

function DetectedBadge() {
  return (
    <Badge variant="outline" className="ml-1 border-teal-500/50 text-teal-400 text-[9px] px-1 py-0">
      detected
    </Badge>
  );
}

function InfoRow({
  label,
  value,
  mono,
  detected,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  detected?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <p className={`text-sm text-white flex items-center ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
        {detected && <DetectedBadge />}
      </p>
    </div>
  );
}

function EditableInfoRow({
  label,
  value,
  field,
  manualValue,
  hasAutoValue,
  edit,
  setEdit,
  saving,
  saveField,
  cancelEdit,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  field: string;
  manualValue: string | null | undefined;
  hasAutoValue: boolean;
  edit: EditState;
  setEdit: (e: EditState) => void;
  saving: boolean;
  saveField: (field: string, value: string) => Promise<void>;
  cancelEdit: () => void;
  placeholder?: string;
}) {
  if (edit.field === field) {
    return (
      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <InlineEditInput
          value={edit.value}
          onChange={(v) => setEdit({ ...edit, value: v })}
          onSave={() => saveField(field, edit.value)}
          onCancel={cancelEdit}
          saving={saving}
          placeholder={placeholder}
        />
      </div>
    );
  }

  // If there's no auto value, always show editable row
  if (!hasAutoValue) {
    return (
      <div
        className="cursor-pointer hover:bg-slate-800/50 rounded px-1 -mx-1 py-0.5 transition-colors group"
        onClick={() => setEdit({ field, value: manualValue || "" })}
      >
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <p className="text-sm text-white flex items-center gap-1">
          {value || <span className="text-slate-600 italic">Not set</span>}
          <Pencil size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </p>
      </div>
    );
  }

  // Has auto value — show value, optionally allow manual override
  return (
    <div
      className="cursor-pointer hover:bg-slate-800/50 rounded px-1 -mx-1 py-0.5 transition-colors group"
      onClick={() => setEdit({ field, value: manualValue || "" })}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <p className="text-sm text-white flex items-center gap-1">
        {value}
        <Pencil size={10} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </p>
    </div>
  );
}

function InlineEditInput({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        autoFocus
        disabled={saving}
        className={`h-7 bg-slate-800 border-slate-700 text-white text-sm ${className || ""}`}
      />
      <Button
        size="sm"
        onClick={onSave}
        disabled={saving}
        className="h-7 w-7 p-0"
      >
        <Check size={12} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onCancel}
        className="h-7 w-7 p-0 text-slate-400"
      >
        <X size={12} />
      </Button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function buildChartData(
  agentReports: AgentReport[] | null,
  sshReports: SshReport[] | null,
): ChartPoint[] {
  // Prefer agent reports, fall back to SSH reports
  if (agentReports && agentReports.length > 0) {
    const chronological = [...agentReports].reverse();
    return chronological.map((r) => {
      const memPercent =
        r.mem_total && r.mem_total > 0 && r.mem_used != null
          ? (r.mem_used / r.mem_total) * 100
          : null;
      return {
        time: new Date(r.reported_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        cpu: r.cpu_percent,
        ram: memPercent != null ? Math.round(memPercent * 10) / 10 : null,
      };
    });
  }

  if (sshReports && sshReports.length > 0) {
    const chronological = [...sshReports].reverse();
    return chronological.map((r) => {
      const memPercent =
        r.mem_total && r.mem_total > 0 && r.mem_used != null
          ? (r.mem_used / r.mem_total) * 100
          : null;
      return {
        time: new Date(r.reported_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        cpu: r.cpu_percent,
        ram: memPercent != null ? Math.round(memPercent * 10) / 10 : null,
      };
    });
  }

  return [];
}
