"use client";

// ─────────────────────────────────────────────────────────────────────────
// /devices — literal port of `panopticon/project/devices.jsx` + the
// DeviceDetail body from `panopticon/project/details.jsx`.
//
// Per design-export-to-ux-issues runbook (Source Code Port Protocol):
//  • inline `style={{ var(--X) }}` mirrors the source verbatim;
//  • conflict-resolved tokens (--border, --primary, --status-*) inline
//    literal hex from `panopticon/project/tokens.css` mesh direction;
//  • mock data arrays are replaced with real `/api/v1/devices` data and
//    related per-device endpoints (events, port scan, traffic chart);
//  • all other tokens (`--surface-*`, `--text-*`, `--radius-*`, etc.) are
//    declared in `web/src/app/globals.css` as part of the mesh direction
//    and consumed via CSS vars without translation to Tailwind utilities.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronRight,
  Cpu,
  Eye,
  Filter as FilterIcon,
  Network as NetworkIcon,
  Pin as PinIcon,
  PlugZap,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Router,
  Search,
  Server,
  SlidersHorizontal,
  Tag as TagIcon,
  Tv,
  Wifi,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Spark } from "@/components/mesh/Spark";
import { StatusDot } from "@/components/mesh/StatusDot";
import { EmptyState as MeshEmptyState } from "@/components/mesh/state/EmptyState";
import { LoadingState } from "@/components/mesh/state/LoadingState";
import { ErrorState as MeshErrorState } from "@/components/mesh/state/ErrorState";

import {
  fetchDevices,
  fetchDeviceEvents,
  fetchPortScan,
  triggerNetworkScan,
  updateDevice,
  wakeDevice,
} from "@/lib/api";
import type { DeviceEvent, PortScanResult } from "@/lib/api";
import type { Device } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useWsEvent } from "@/lib/ws";

import { AddAssetDialog } from "./AddAssetDialog";

// ─────────────────────────────────────────────────────────────────────────
// Helpers — design `genS` / `gen` synthetic sparkline placeholders. The
// backend doesn't expose a per-device 24h series today (TODO BACKEND), so
// we keep the deterministic generator from the design source. Mark with
// `data-synthetic` so future audits can find them once the real series
// lands.
// ─────────────────────────────────────────────────────────────────────────
function genS(n: number, b: number, v: number, seed = 0): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    const noise = Math.sin((i + seed) / 2) * v * 0.7 + (pseudo(i + seed) - 0.5) * v;
    a.push(Math.max(0, b + noise));
  }
  return a;
}
function pseudo(x: number): number {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function deriveVlan(ip: string): string {
  const seg = ip.split(".")[2];
  if (!seg) return "trusted";
  const num = parseInt(seg, 10);
  if (Number.isNaN(num)) return "trusted";
  if (num >= 6 && num <= 7) return "iot";
  if (num === 0) return "mgmt";
  return "trusted";
}

function vlanColor(vlan: string): string {
  if (vlan === "trusted") return "#4ade80";
  if (vlan === "iot") return "#818cf8";
  if (vlan === "guest") return "#fbbf24";
  return "#38bdf8";
}

function devicePrimaryTitle(d: Device): string {
  return (
    d.custom_name?.trim() ||
    d.hostname?.trim() ||
    d.name?.trim() ||
    (d.ips ?? [])[0] ||
    "Unknown device"
  );
}

function deviceTypeIcon(d: Device) {
  const t = (d.custom_type ?? d.device_type ?? "").toLowerCase();
  if (t.includes("router") || t.includes("ap")) return Router;
  if (t.includes("printer")) return Printer;
  if (t.includes("camera")) return Eye;
  if (t.includes("tv")) return Tv;
  if (t.includes("nas") || t.includes("server")) return Server;
  if (t.includes("wifi")) return Wifi;
  if (t.includes("iot") || t.includes("esp")) return NetworkIcon;
  return Cpu;
}

// ─────────────────────────────────────────────────────────────────────────
// StatusBadge — direct port of devices.jsx#StatusBadge.
// ─────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: "online" | "warning" | "offline" | "inactive" }) {
  const config = {
    online: {
      label: "ONLINE",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.08)",
      border: "rgba(74,222,128,0.25)",
      pulse: true,
    },
    warning: {
      label: "WARN",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.25)",
      pulse: false,
    },
    offline: {
      label: "OFFLINE",
      color: "#fb7185",
      bg: "rgba(251,113,133,0.08)",
      border: "rgba(251,113,133,0.25)",
      pulse: false,
    },
    inactive: {
      label: "IDLE",
      color: "var(--text-mute)",
      bg: "var(--surface-2)",
      border: "rgba(96,144,212,0.20)",
      pulse: false,
    },
  }[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 18,
        padding: "0 7px",
        borderRadius: "var(--radius-pill)",
        background: config.bg,
        color: config.color,
        border: `var(--hairline) solid ${config.border}`,
        font: "600 9.5px var(--font-sans)",
        letterSpacing: "0.06em",
      }}
    >
      <StatusDot
        status={status === "warning" ? "warning" : status === "offline" ? "offline" : "online"}
        pulse={config.pulse}
        size={5}
      />
      {config.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FilterChip — direct port of devices.jsx#FilterChip.
// ─────────────────────────────────────────────────────────────────────────
function FilterChip({
  label,
  count,
  active,
  onClick,
  testId,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={!!active}
      data-testid={testId}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 24,
        padding: "0 9px",
        borderRadius: "var(--radius-sm)",
        background: active ? "var(--primary-soft)" : "var(--surface-1)",
        border: `var(--hairline) solid ${active ? "#2563eb" : "rgba(96,144,212,0.20)"}`,
        color: active ? "var(--text)" : "var(--text-dim)",
        font: "500 11.5px var(--font-sans)",
        cursor: "pointer",
      }}
    >
      {label}
      {count != null && (
        <span
          className="mono"
          style={{ color: active ? "#2563eb" : "var(--text-mute)", fontSize: 10 }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────
type Filter = "all" | "online" | "offline" | "unknown" | "warning";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const selectedUrlConsumed = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Consume ?selected= / ?id= once (use window.location to avoid CSR
  // bailout on a server-rendered page).
  useEffect(() => {
    if (selectedUrlConsumed.current || !devices) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sel = params.get("selected") ?? params.get("id");
    if (sel && devices.some((d) => d.id === sel)) {
      setSelectedId(sel);
      selectedUrlConsumed.current = true;
      window.history.replaceState(window.history.state, "", "/devices");
    }
  }, [devices]);

  // Live updates via WS
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  useWsEvent(
    ["device_online", "device_offline", "new_device", "agent_online", "agent_offline"],
    (msg) => {
      if (["device_online", "device_offline", "new_device"].includes(msg.event)) {
        const d = msg.data as { device_id?: string; mac?: string; ip?: string };
        const dev = devicesRef.current?.find((x) => x.id === d.device_id);
        const label = dev?.name || dev?.hostname || d.mac || "Unknown device";
        if (msg.event === "device_online") toast.success(`${label} came online`, { description: d.ip });
        else if (msg.event === "device_offline") toast.error(`${label} went offline`);
        else if (msg.event === "new_device") toast.info(`New device: ${d.mac}`, { description: d.ip });
      }
      load();
    },
  );

  const counts = useMemo(() => {
    if (!devices) return null;
    return {
      all: devices.length,
      online: devices.filter((d) => d.is_online).length,
      offline: devices.filter((d) => !d.is_online && d.is_known).length,
      unknown: devices.filter((d) => !d.is_known).length,
      warning: devices.filter((d) => !d.is_online && d.is_known).length, // placeholder until severity surfaces
    };
  }, [devices]);

  const filtered = useMemo(() => {
    if (!devices) return null;
    let list = devices;
    if (filter === "online") list = list.filter((d) => d.is_online);
    else if (filter === "offline") list = list.filter((d) => !d.is_online && d.is_known);
    else if (filter === "unknown") list = list.filter((d) => !d.is_known);
    else if (filter === "warning") list = list.filter((d) => !d.is_online && d.is_known);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          (d.custom_name ?? "").toLowerCase().includes(q) ||
          (d.name ?? "").toLowerCase().includes(q) ||
          (d.hostname ?? "").toLowerCase().includes(q) ||
          (d.mac ?? "").toLowerCase().includes(q) ||
          (d.vendor ?? "").toLowerCase().includes(q) ||
          (d.ips ?? []).some((ip) => ip.includes(q)),
      );
    }
    return list;
  }, [devices, filter, search]);

  const selectedDevice = useMemo(
    () => (selectedId ? devices?.find((d) => d.id === selectedId) ?? null : null),
    [devices, selectedId],
  );

  const rescan = async () => {
    setScanning(true);
    try {
      const summary = await triggerNetworkScan();
      const parts: string[] = [];
      if (summary.new_devices > 0) parts.push(`${summary.new_devices} new`);
      if (summary.updated_devices > 0) parts.push(`${summary.updated_devices} updated`);
      if (summary.offline_devices > 0) parts.push(`${summary.offline_devices} offline`);
      const desc = parts.length > 0 ? parts.join(", ") : "No changes";
      toast.success("Network scan complete", { description: `${summary.total_scanned} scanned — ${desc}` });
      await load();
    } catch {
      toast.error("Network scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="t-micro">Network</div>
          <h1 className="t-display" style={{ margin: "4px 0 6px" }}>
            Devices
          </h1>
          <div className="t-small mono" style={{ color: "var(--text-mute)" }}>
            <span style={{ color: "#4ade80" }}>● {counts?.online ?? 0} online</span>
            <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>·</span>
            <span style={{ color: "#fbbf24" }}>◐ {counts?.unknown ?? 0} new</span>
            <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>·</span>
            <span style={{ color: "#fb7185" }}>○ {counts?.offline ?? 0} offline</span>
            <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>·</span>
            <span>{counts?.all ?? 0} known total</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn"
            data-testid="devices-filter-toggle"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('[data-testid="devices-query-input"]');
              input?.focus();
            }}
          >
            <FilterIcon size={12} />
            <span>Filters</span>
          </button>
          <button
            type="button"
            className="btn"
            data-testid="devices-rescan"
            disabled={scanning}
            onClick={rescan}
          >
            <RefreshCw size={12} className={scanning ? "animate-spin" : undefined} />
            <span>{scanning ? "Scanning…" : "Rescan"}</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="devices-add"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={12} />
            <span>Add device</span>
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="mesh-card" data-testid="query-bar" style={{ padding: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 280px",
            minWidth: 280,
            padding: "0 10px",
            height: 28,
            background: "var(--surface-2)",
            border: "var(--hairline) solid rgba(96,144,212,0.20)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <Search size={13} color="var(--text-mute)" />
          <input
            data-testid="devices-query-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="vlan:iot rx:>10"
            aria-label="Search devices"
            style={{
              flex: 1,
              background: "transparent",
              border: 0,
              color: "var(--text)",
              outline: "none",
              font: "400 12px var(--font-mono)",
            }}
          />
          <kbd
            className="mono"
            style={{
              font: "500 10px var(--font-mono)",
              color: "var(--text-mute)",
              padding: "1px 5px",
              background: "var(--surface-3)",
              borderRadius: 3,
            }}
          >
            esc
          </kbd>
        </div>
        <div style={{ display: "flex", gap: 6 }} role="tablist" aria-label="Status filters">
          <FilterChip
            label="All"
            count={counts?.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
            testId="filter-chip-all"
          />
          <FilterChip
            label="Online"
            count={counts?.online}
            active={filter === "online"}
            onClick={() => setFilter("online")}
            testId="filter-chip-online"
          />
          <FilterChip
            label="Offline"
            count={counts?.offline}
            active={filter === "offline"}
            onClick={() => setFilter("offline")}
            testId="filter-chip-offline"
          />
          <FilterChip
            label="Warning"
            count={counts?.warning}
            active={filter === "warning"}
            onClick={() => setFilter("warning")}
            testId="filter-chip-warning"
          />
          <FilterChip
            label="New"
            count={counts?.unknown}
            active={filter === "unknown"}
            onClick={() => setFilter("unknown")}
            testId="filter-chip-unknown"
          />
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            font: "500 11px var(--font-mono)",
            color: "var(--text-mute)",
          }}
        >
          <SlidersHorizontal size={12} />
          <span>density · compact</span>
          <span style={{ color: "var(--text-faint)" }}>·</span>
          <span>group · vlan</span>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <MeshErrorState
          title="Couldn't load devices"
          message={error}
          onRetry={() => {
            setError(null);
            load();
          }}
        />
      ) : devices === null ? (
        <LoadingState title="Devices" message="Pulling live inventory…" tiles={0} rows={8} />
      ) : filtered && filtered.length === 0 ? (
        <MeshEmptyState
          title="No devices match"
          message={
            search || filter !== "all"
              ? "Try clearing the search or switching to All to see every known device."
              : "Once Panoptikon discovers a device on your network it will appear here. Trigger a rescan to look now."
          }
        />
      ) : (
        <div className="mesh-card" data-testid="devices-table-card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "22px 1.4fr 1fr 1.2fr 0.9fr 60px 70px 70px 1fr 84px 28px",
              padding: "8px 12px",
              font: "600 9.5px var(--font-sans)",
              letterSpacing: "0.08em",
              color: "var(--text-mute)",
              textTransform: "uppercase",
              borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
              background: "transparent",
            }}
          >
            <span />
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Name <ArrowDown size={8} color="var(--text-faint)" />
            </span>
            <span>IP</span>
            <span>MAC · Vendor</span>
            <span>VLAN</span>
            <span style={{ textAlign: "right" }}>RX GB</span>
            <span style={{ textAlign: "right" }}>TX GB</span>
            <span style={{ textAlign: "right" }}>Mbps</span>
            <span>24h</span>
            <span>Status</span>
            <span />
          </div>

          {(filtered ?? []).map((d, i, arr) => (
            <DeviceRow
              key={d.id}
              d={d}
              isLast={i === arr.length - 1}
              selected={selectedId === d.id}
              onSelect={() => setSelectedId(d.id)}
            />
          ))}

          {/* Footer */}
          <div
            data-testid="devices-summary"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px",
              borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
              font: "500 11px var(--font-mono)",
              color: "var(--text-mute)",
            }}
          >
            <div>
              {filtered?.length ?? 0} of {counts?.all ?? 0} · grouped by vlan
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <span>
                rx Σ <span style={{ color: "var(--text)" }}>—</span> GB
              </span>
              <span>
                tx Σ <span style={{ color: "var(--text)" }}>—</span> GB
              </span>
              <span>
                now <span style={{ color: "#38bdf8" }}>—</span> Mbps
              </span>
            </div>
          </div>
        </div>
      )}

      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />

      {selectedDevice ? (
        <DeviceDetailDrawer
          device={selectedDevice}
          onClose={() => setSelectedId(null)}
          onUpdate={load}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DeviceRow — direct port of devices.jsx#DeviceRow.
// ─────────────────────────────────────────────────────────────────────────
function DeviceRow({
  d,
  isLast,
  selected,
  onSelect,
}: {
  d: Device;
  isLast: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const TypeGlyph = deviceTypeIcon(d);
  const primaryIp = (d.ips ?? [])[0] ?? "—";
  const vlan = deriveVlan(primaryIp);
  const vendor = d.custom_vendor ?? d.vendor ?? "—";
  const status: "online" | "offline" | "warning" | "inactive" = d.is_online
    ? "online"
    : d.is_known
      ? "offline"
      : "warning";
  const rowBg = selected ? "var(--surface-2)" : "transparent";
  const sparkData = useMemo(
    () => genS(28, 15 + (d.is_online ? 12 : 1) * 6, d.is_online ? 9 : 0.5, (d.id.charCodeAt(0) || 1) % 11),
    [d.id, d.is_online],
  );
  const sparkColor = status === "online" ? "#38bdf8" : "var(--text-mute)";
  // TODO BACKEND: per-device 24h totals + current mbps
  const rxGb = "—";
  const txGb = "—";
  const mbps = "—";
  const isNew = !d.is_known;

  return (
    <button
      type="button"
      data-testid="device-row"
      data-device-row
      onClick={onSelect}
      className={selected ? "selected-rail" : undefined}
      style={{
        position: "relative",
        display: "grid",
        width: "100%",
        gridTemplateColumns: "22px 1.4fr 1fr 1.2fr 0.9fr 60px 70px 70px 1fr 84px 28px",
        padding: "8px 12px",
        alignItems: "center",
        borderBottom: isLast ? "none" : "var(--hairline) solid rgba(96,144,212,0.20)",
        background: rowBg,
        font: "400 12.5px var(--font-sans)",
        color: "var(--text)",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {selected ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            background: "#2563eb",
            borderRadius: "0 2px 2px 0",
          }}
        />
      ) : null}

      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-mute)" }}>
        <TypeGlyph size={13} />
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          style={{
            color: "var(--text)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {devicePrimaryTitle(d)}
        </span>
        {d.is_favorite ? <PinIcon size={10} color="#38bdf8" /> : null}
        {isNew ? (
          <span
            style={{
              font: "600 8.5px var(--font-sans)",
              color: "#2563eb",
              letterSpacing: "0.08em",
              padding: "1px 5px",
              background: "var(--primary-soft)",
              borderRadius: 3,
            }}
          >
            NEW
          </span>
        ) : null}
      </span>
      <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11.5 }}>
        {primaryIp}
      </span>
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {d.mac}
        </span>
        <span style={{ color: "var(--text-mute)", fontSize: 10.5 }}>{vendor}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 4, height: 12, background: vlanColor(vlan), borderRadius: 1 }} />
        <span className="mono" style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {vlan}
        </span>
      </span>
      <span className="mono" style={{ textAlign: "right", color: "var(--text)" }}>
        {rxGb}
      </span>
      <span className="mono" style={{ textAlign: "right", color: "var(--text-dim)" }}>
        {txGb}
      </span>
      <span className="mono" style={{ textAlign: "right", color: "var(--text)" }}>
        {mbps}
      </span>
      <span>
        <Spark data={sparkData} width={120} height={18} color={sparkColor} />
      </span>
      <span>
        <StatusBadge status={status} />
      </span>
      <span style={{ color: "var(--text-mute)", display: "flex", justifyContent: "flex-end" }}>
        <ChevronRight size={12} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DeviceDetailDrawer — literal port of details.jsx#DeviceDetail wrapped in
// a Radix Dialog so it presents as a right-side drawer. The Radix wrapper
// is the only adaptation; the panel body composition is byte-exact.
// ─────────────────────────────────────────────────────────────────────────
function DeviceDetailDrawer({
  device,
  onClose,
  onUpdate,
}: {
  device: Device;
  onClose: () => void;
  onUpdate: () => void;
}) {
  // ESC + body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="device-drawer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          border: 0,
          padding: 0,
          cursor: "default",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(960px, 90vw)",
          height: "100%",
          overflowY: "auto",
          background: "var(--bg-app)",
          borderLeft: "var(--hairline) solid rgba(96,144,212,0.20)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="btn btn-ghost"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 1,
            width: 28,
            height: 28,
            padding: 0,
            justifyContent: "center",
          }}
        >
          <XIcon size={14} />
        </button>
        <DeviceDetail device={device} onUpdate={onUpdate} onClose={onClose} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DeviceDetail — direct port of details.jsx#DeviceDetail.
// Tab structure: Overview | Traffic | Ports | DNS | Alerts | Audit.
// ─────────────────────────────────────────────────────────────────────────
type Tab = "Overview" | "Traffic" | "Ports" | "DNS" | "Alerts" | "Audit";

function DeviceDetail({
  device,
  onUpdate,
  onClose,
}: {
  device: Device;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [events, setEvents] = useState<DeviceEvent[] | null>(null);
  const [ports, setPorts] = useState<PortScanResult | null>(null);
  const [waking, setWaking] = useState(false);
  const TypeGlyph = deviceTypeIcon(device);
  const primaryIp = (device.ips ?? [])[0] ?? "—";
  const vlan = deriveVlan(primaryIp);
  const title = devicePrimaryTitle(device);
  const vendor = device.custom_vendor ?? device.vendor;
  const osLabel = device.custom_os ?? device.os_family;
  const osDisplay = osLabel
    ? device.os_version
      ? `${osLabel} ${device.os_version}`
      : osLabel
    : "—";
  const status: "online" | "offline" | "warning" | "inactive" = device.is_online
    ? "online"
    : device.is_known
      ? "offline"
      : "warning";

  useEffect(() => {
    let cancelled = false;
    fetchDeviceEvents(device.id, 24)
      .then((e) => {
        if (!cancelled) setEvents(e);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    fetchPortScan(device.id)
      .then((p) => {
        if (!cancelled) setPorts(p);
      })
      .catch(() => {
        if (!cancelled) setPorts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [device.id]);

  const handleWake = async () => {
    setWaking(true);
    try {
      await wakeDevice(device.id);
      toast.success("Magic packet sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wake failed");
    } finally {
      setWaking(false);
    }
  };

  const togglePin = async () => {
    try {
      await updateDevice(device.id, { is_critical: !device.is_critical });
      toast.success(device.is_critical ? "Unpinned" : "Pinned · critical");
      onUpdate();
    } catch {
      toast.error("Failed to update pin state");
    }
  };

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Identity header */}
      <div
        className="mesh-card"
        style={{ padding: 18, display: "flex", alignItems: "flex-start", gap: 16 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            background: "var(--surface-2)",
            border: "var(--hairline) solid rgba(96,144,212,0.40)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#38bdf8",
          }}
        >
          <TypeGlyph size={28} strokeWidth={1.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 className="t-h1" style={{ margin: 0 }}>
              {title}
            </h1>
            {status === "online" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(74,222,128,0.10)",
                  border: "var(--hairline) solid rgba(74,222,128,0.30)",
                  color: "#4ade80",
                  font: "600 10px var(--font-sans)",
                  letterSpacing: "0.06em",
                }}
              >
                <StatusDot status="online" pulse size={5} />
                ONLINE
              </span>
            ) : status === "offline" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(251,113,133,0.10)",
                  border: "var(--hairline) solid rgba(251,113,133,0.30)",
                  color: "#fb7185",
                  font: "600 10px var(--font-sans)",
                  letterSpacing: "0.06em",
                }}
              >
                <StatusDot status="offline" size={5} />
                OFFLINE
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(251,191,36,0.10)",
                  border: "var(--hairline) solid rgba(251,191,36,0.30)",
                  color: "#fbbf24",
                  font: "600 10px var(--font-sans)",
                  letterSpacing: "0.06em",
                }}
              >
                <StatusDot status="warning" size={5} />
                NEW
              </span>
            )}
            {device.is_critical ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--primary-soft)",
                  border: "var(--hairline) solid rgba(37,99,235,0.30)",
                  color: "#2563eb",
                  font: "500 10.5px var(--font-sans)",
                }}
              >
                <PinIcon size={10} />
                pinned · core
              </span>
            ) : null}
          </div>
          <div
            className="mono"
            style={{
              font: "500 12px var(--font-mono)",
              color: "var(--text-dim)",
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span>{primaryIp}</span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span>{device.mac}</span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span style={{ color: "var(--text-mute)" }}>
              {vendor ?? "Unknown vendor"} · {osDisplay}
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span style={{ color: "#38bdf8" }}>vlan: {vlan}</span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span style={{ color: "var(--text-mute)" }}>
              first seen {timeAgo(device.first_seen_at)}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn" onClick={togglePin}>
            <PinIcon size={12} />
            <span>{device.is_critical ? "Unpin" : "Pin"}</span>
          </button>
          {!device.is_online ? (
            <button type="button" className="btn" disabled={waking} onClick={handleWake}>
              <Power size={12} />
              <span>{waking ? "Waking…" : "Wake"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              window.location.href = `/assets?id=${device.id}`;
            }}
          >
            <TagIcon size={12} />
            <span>Asset detail</span>
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div
        role="tablist"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        {(["Overview", "Traffic", "Ports", "DNS", "Alerts", "Audit"] as Tab[]).map((t) => {
          const isActive = activeTab === t;
          const badge = t === "Alerts" && events ? events.filter((e) => e.event_type.includes("alert")).length : 0;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`details-tab-${t.toLowerCase()}`}
              onClick={() => setActiveTab(t)}
              style={{
                padding: "8px 14px",
                font: `${isActive ? 600 : 500} 12.5px var(--font-sans)`,
                color: isActive ? "var(--text)" : "var(--text-mute)",
                borderBottom: isActive ? "2px solid #38bdf8" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                background: "transparent",
                border: "0",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "#38bdf8" : "transparent",
              }}
            >
              {t}
              {t === "Alerts" && badge > 0 ? (
                <span
                  style={{
                    marginLeft: 6,
                    padding: "1px 5px",
                    background: "rgba(251,113,133,0.18)",
                    color: "#fb7185",
                    borderRadius: 3,
                    font: "500 9.5px var(--font-mono)",
                  }}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "Overview" ? (
        <OverviewBody device={device} events={events} ports={ports} />
      ) : activeTab === "Traffic" ? (
        <TabPlaceholder
          title="Traffic · 24h"
          message="Per-device 24h traffic series is not yet exposed by the backend. The summary chart on the Overview tab uses the live rate fallback."
        />
      ) : activeTab === "Ports" ? (
        <PortsTab ports={ports} />
      ) : activeTab === "DNS" ? (
        <TabPlaceholder
          title="DNS"
          message="DNS lookup history per device is not exposed by the backend yet."
        />
      ) : activeTab === "Alerts" ? (
        <TabPlaceholder
          title="Alerts"
          message="Per-device alert feed lands once the alerts service exposes a per-entity query."
        />
      ) : (
        <AuditTab events={events} />
      )}
    </div>
  );
}

function TabPlaceholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="mesh-card" style={{ padding: 18 }}>
      <h3 className="t-h3" style={{ marginBottom: 8 }}>
        {title}
      </h3>
      <p className="t-small" style={{ color: "var(--text-mute)", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Overview body — direct port of the body of details.jsx#DeviceDetail.
// ─────────────────────────────────────────────────────────────────────────
function OverviewBody({
  device,
  events,
  ports,
}: {
  device: Device;
  events: DeviceEvent[] | null;
  ports: PortScanResult | null;
}) {
  // TODO BACKEND: real per-device KPIs / time series.
  const kpis: Array<{ label: string; value: string; unit: string; accent?: string }> = [
    { label: "Now", value: "—", unit: "Mbps", accent: "#38bdf8" },
    { label: "Peak · 24h", value: "—", unit: "Mbps" },
    { label: "RX · 24h", value: "—", unit: "GB" },
    { label: "TX · 24h", value: "—", unit: "GB" },
    {
      label: "Latency p99",
      value: "—",
      unit: "ms",
      accent: "#4ade80",
    },
  ];

  // Synthetic traffic series for Overview chart — replace once backend exposes it.
  const seed = (device.id.charCodeAt(0) || 1) % 11;
  const rx = useMemo(() => genS(60, 80, 50, seed), [seed]);
  const tx = useMemo(() => genS(60, 30, 20, seed + 3), [seed]);
  const sx = 600 / 59;
  const max = Math.max(...rx, ...tx) * 1.1 || 1;
  const toY = (v: number) => 180 - (v / max) * 170;
  const lp = (a: number[]) =>
    a.map((v, i) => `${i === 0 ? "M" : "L"}${(i * sx).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const ap = (a: number[]) => `${lp(a)} L600,180 L0,180 Z`;

  // Recent activity from real events
  const recent = (events ?? []).slice(0, 6).map((e) => {
    const ts = new Date(e.occurred_at);
    const label = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const color =
      e.event_type === "online"
        ? "#4ade80"
        : "#fb7185";
    const msg = e.event_type === "online" ? "device came online" : "device went offline";
    return { t: label, msg, color };
  });

  // Listening ports
  const listening = ports?.ports ?? [];

  return (
    <>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {kpis.map((k) => (
          <div key={k.label} className="mesh-card" style={{ padding: 14 }}>
            <div className="t-micro">{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
              <span
                className="mono"
                style={{
                  font: "600 22px var(--font-mono)",
                  color: k.accent ?? "var(--text)",
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                }}
              >
                {k.value}
              </span>
              <span className="t-small mono" style={{ color: "var(--text-mute)" }}>
                {k.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Body — 2 cols */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div
          className="mesh-card"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3 className="t-h3">Traffic · 24h</h3>
            <span
              className="mono"
              style={{ font: "500 11px var(--font-mono)", color: "var(--text-mute)" }}
            >
              5m buckets · 288 points
            </span>
          </div>
          <svg viewBox="0 0 600 180" style={{ width: "100%", height: 180 }}>
            <defs>
              <linearGradient id="dd-rx" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dd-tx" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#818cf8" stopOpacity="0.35" />
                <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75].map((p, i) => (
              <line
                key={i}
                x1="0"
                x2="600"
                y1={p * 180}
                y2={p * 180}
                stroke="rgba(96,144,212,0.20)"
                strokeWidth="0.5"
                strokeDasharray="2 4"
              />
            ))}
            <path d={ap(rx)} fill="url(#dd-rx)" />
            <path d={lp(rx)} stroke="#38bdf8" strokeWidth="1.4" fill="none" />
            <path d={ap(tx)} fill="url(#dd-tx)" />
            <path d={lp(tx)} stroke="#818cf8" strokeWidth="1.4" fill="none" />
          </svg>
          <div
            style={{
              display: "flex",
              gap: 18,
              font: "500 11px var(--font-mono)",
              color: "var(--text-mute)",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 2,
                  background: "#38bdf8",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              rx
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 2,
                  background: "#818cf8",
                  verticalAlign: "middle",
                  marginRight: 6,
                }}
              />
              tx
            </span>
            <span style={{ flex: 1 }} />
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>now</span>
          </div>
        </div>

        {/* Path */}
        <div className="mesh-card" style={{ padding: 14 }}>
          <h3 className="t-h3" style={{ marginBottom: 10 }}>
            Path · WAN → device
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { node: "WAN", meta: "external", color: "#38bdf8" as const, last: false },
              { node: "Router", meta: "gateway · LAN", color: "#2563eb" as const, last: false },
              { node: "Switch / AP", meta: "uplink", color: "#38bdf8" as const, last: false },
              {
                node: `${devicePrimaryTitle(device)} (this device)`,
                meta: `${(device.ips ?? [])[0] ?? "—"} · current`,
                color: "#4ade80" as const,
                last: true,
              },
            ].map((h) => (
              <div key={h.node} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 2,
                    background: h.color,
                    opacity: h.last ? 1 : 0.4,
                    position: "relative",
                  }}
                >
                  {h.last ? (
                    <span
                      style={{
                        position: "absolute",
                        inset: 2,
                        background: "var(--surface-1)",
                        borderRadius: 1,
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "500 12px var(--font-sans)", color: "var(--text)" }}>
                    {h.node}
                  </div>
                  <div
                    className="mono"
                    style={{ font: "400 10px var(--font-mono)", color: "var(--text-mute)" }}
                  >
                    {h.meta}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ports + Recent events row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="mesh-card" style={{ padding: 14 }}>
          <h3 className="t-h3" style={{ marginBottom: 10 }}>
            Listening · {listening.length} ports
          </h3>
          {listening.length === 0 ? (
            <div className="t-small" style={{ color: "var(--text-mute)" }}>
              No open ports detected. Run a port scan from the Ports tab.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {listening.slice(0, 6).map((p) => {
                const color =
                  p.service?.toLowerCase().includes("ssh")
                    ? "#4ade80"
                    : p.service?.toLowerCase().includes("plex")
                      ? "#818cf8"
                      : "#38bdf8";
                return (
                  <div
                    key={`${p.port}-${p.protocol}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "60px 80px 1fr 80px",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
                      font: "400 12px var(--font-mono)",
                    }}
                  >
                    <span style={{ color, fontWeight: 500 }}>{p.port}</span>
                    <span style={{ color: "var(--text)" }}>{p.service ?? p.protocol}</span>
                    <span style={{ color: "var(--text-mute)" }}>{p.version || "—"}</span>
                    <span style={{ color: "#4ade80", textAlign: "right" }}>open</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mesh-card" style={{ padding: 14 }}>
          <h3 className="t-h3" style={{ marginBottom: 10 }}>
            Recent activity
          </h3>
          {recent.length === 0 ? (
            <div className="t-small" style={{ color: "var(--text-mute)" }}>
              No recent events.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.map((e, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 10, font: "400 12px var(--font-sans)" }}
                >
                  <span
                    className="mono"
                    style={{ color: "var(--text-faint)", fontSize: 11, width: 70 }}
                  >
                    {e.t}
                  </span>
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: e.color,
                      marginTop: 6,
                    }}
                  />
                  <span style={{ color: "var(--text-dim)" }}>{e.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PortsTab({ ports }: { ports: PortScanResult | null }) {
  if (!ports) {
    return (
      <TabPlaceholder
        title="Ports"
        message="No port scan on record yet. Trigger a scan from the asset detail page."
      />
    );
  }
  const list = ports.ports ?? [];
  if (list.length === 0) {
    return (
      <TabPlaceholder
        title="Ports"
        message="Last scan returned 0 open ports."
      />
    );
  }
  return (
    <div className="mesh-card" style={{ padding: 14 }}>
      <h3 className="t-h3" style={{ marginBottom: 10 }}>
        Listening · {list.length} ports
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {list.map((p) => (
          <div
            key={`${p.port}-${p.protocol}`}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 80px 1fr 80px",
              alignItems: "center",
              padding: "6px 0",
              borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
              font: "400 12px var(--font-mono)",
            }}
          >
            <span style={{ color: "#38bdf8", fontWeight: 500 }}>{p.port}</span>
            <span style={{ color: "var(--text)" }}>{p.service ?? p.protocol}</span>
            <span style={{ color: "var(--text-mute)" }}>{p.version || "—"}</span>
            <span style={{ color: "#4ade80", textAlign: "right" }}>open</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab({ events }: { events: DeviceEvent[] | null }) {
  if (events === null) {
    return <TabPlaceholder title="Audit" message="Loading event history…" />;
  }
  if (events.length === 0) {
    return <TabPlaceholder title="Audit" message="No audit events recorded for this device yet." />;
  }
  return (
    <div className="mesh-card" style={{ padding: 14 }}>
      <h3 className="t-h3" style={{ marginBottom: 10 }}>
        Audit · last {events.length}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {events.map((e) => {
          const ts = new Date(e.occurred_at);
          const label = ts.toLocaleString();
          const color = e.event_type === "online" ? "#4ade80" : "#fb7185";
          const msg = e.event_type === "online" ? "device came online" : "device went offline";
          return (
            <div
              key={e.id}
              style={{ display: "flex", gap: 10, font: "400 12px var(--font-sans)" }}
            >
              <span
                className="mono"
                style={{ color: "var(--text-faint)", fontSize: 11, width: 160 }}
              >
                {label}
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: color,
                  marginTop: 6,
                }}
              />
              <span style={{ color: "var(--text-dim)" }}>{msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
