"use client";

/**
 * MikrotikRouterDesign — vendor wrapper around the literal-port RouterPage.
 *
 * Mounts the design's read-only dashboard for MikroTik with real data hooks.
 * Tabs (System / Interfaces / VLANs / Routes / DHCP / Firewall / NAT / DNS /
 * WireGuard) come from router-header.jsx; the rich CRUD UI for each tab
 * still lives in <MikrotikRouter />, reachable via the legacy
 * `/router/mikrotik?legacy=1` query for now.
 *
 * Token substitutions per task brief are applied inside RouterPage; this
 * wrapper only emits prop data and is colour-free.
 */

import { useCallback, useMemo } from "react";
import { Router as RouterIcon, RefreshCcw, Save, TerminalSquare } from "lucide-react";
import { useData } from "@/hooks/useData";
import {
  fetchMikrotikStatus,
  fetchMikrotikInterfaces,
  fetchMikrotikFirewall,
  fetchMikrotikDhcpLeases,
} from "@/lib/api";
import {
  RouterPage,
  type RouterFirewallRow,
  type RouterDhcpRow,
  type RouterInterfaceRow,
  type RouterStatRow,
  gen,
  DEFAULT_ROUTER_FOOTER_ACTIONS,
} from "@/components/router/RouterPage";
import type { RouterTab } from "@/components/router/RouterTabs";
import type { RouterHeaderMeta } from "@/components/router/RouterHeader";

const MIKROTIK_TABS: RouterTab[] = [
  { id: "system", label: "System" },
  { id: "interfaces", label: "Interfaces" },
  { id: "vlans", label: "VLANs" },
  { id: "routes", label: "Routes" },
  { id: "dhcp", label: "DHCP" },
  { id: "firewall", label: "Firewall" },
  { id: "nat", label: "NAT" },
  { id: "dns", label: "DNS" },
  { id: "wireguard", label: "WireGuard" },
];

const HEADER_ACTIONS = [
  { label: "Reboot", icon: RefreshCcw },
  { label: "Backup", icon: Save },
  { label: "Open terminal", icon: TerminalSquare, primary: true },
];

function parseBytesString(value: string | null | undefined): number {
  // RouterOS reports byte counters as numeric strings. Convert to GB.
  if (!value) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000_000;
}

function ifaceTypeFromOs(t: string | null | undefined): string {
  if (!t) return "ethernet";
  const lower = t.toLowerCase();
  if (lower.includes("bridge")) return "bridge";
  if (lower.includes("vlan")) return "vlan";
  if (lower.includes("wg") || lower.includes("wireguard")) return "wireguard";
  return "ethernet";
}

function actionFromOs(a: string | null | undefined): string {
  if (!a) return "accept";
  return a.toLowerCase();
}

export default function MikrotikRouterDesign({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const status = useData(useCallback(() => fetchMikrotikStatus(), []));
  const interfaces = useData(useCallback(() => fetchMikrotikInterfaces(), []));
  const firewall = useData(useCallback(() => fetchMikrotikFirewall(), []));
  const dhcp = useData(useCallback(() => fetchMikrotikDhcpLeases(), []));

  const headerMeta: RouterHeaderMeta[] = useMemo(() => {
    const meta: RouterHeaderMeta[] = [];
    if (status.data?.version) meta.push({ label: `RouterOS ${status.data.version}` });
    if (status.data?.board_name) meta.push({ label: status.data.board_name });
    if (status.data?.architecture)
      meta.push({ label: status.data.architecture });
    if (status.data?.uptime)
      meta.push({ label: `uptime ${status.data.uptime}` });
    return meta;
  }, [status.data]);

  const stats: RouterStatRow[] = useMemo(() => {
    const cpu = Number(status.data?.cpu_load ?? 0) || 0;
    const mem = (() => {
      const total = Number(status.data?.total_memory ?? 0);
      const free = Number(status.data?.free_memory ?? 0);
      if (!Number.isFinite(total) || !Number.isFinite(free)) return 0;
      return Math.max(0, Math.round((total - free) / 1_000_000));
    })();
    const totalRx = (interfaces.data ?? []).reduce(
      (sum, it) => sum + parseBytesString(it.rx_bytes),
      0,
    );
    const totalTx = (interfaces.data ?? []).reduce(
      (sum, it) => sum + parseBytesString(it.tx_bytes),
      0,
    );
    const sessions = (firewall.data?.filter_rules.length ?? 0) +
      (firewall.data?.nat_rules.length ?? 0);

    return [
      {
        k: "CPU",
        v: cpu.toString(),
        u: "%",
        spark: gen(28, Math.max(cpu, 8), 8),
        color: "var(--accent-cyan)",
      },
      {
        k: "Memory",
        v: mem.toString(),
        u: "MB",
        spark: gen(28, Math.max(mem, 64), 10),
        color: "var(--accent-violet)",
      },
      {
        k: "Uptime",
        v: status.data?.uptime ?? "—",
        u: "",
        spark: gen(28, 50, 4),
        color: "#fbbf24",
      },
      {
        k: "WAN · RX",
        v: totalRx.toFixed(0),
        u: "GB",
        spark: gen(28, Math.max(totalRx, 100), 60),
        color: "#38bdf8",
      },
      {
        k: "WAN · TX",
        v: totalTx.toFixed(0),
        u: "GB",
        spark: gen(28, Math.max(totalTx, 40), 30),
        color: "var(--accent-violet)",
      },
      {
        k: "Rules",
        v: sessions.toString(),
        u: "FW",
        spark: gen(28, Math.max(sessions, 10), 6),
        color: "var(--text)",
      },
    ];
  }, [status.data, interfaces.data, firewall.data]);

  const ifaceRows: RouterInterfaceRow[] = useMemo(() => {
    return (interfaces.data ?? []).map((it) => ({
      name: it.name,
      type: ifaceTypeFromOs(it.iface_type),
      running: !!it.running,
      ip: it.ip_address ?? "—",
      role: it.comment ?? "—",
      mac: it.mac ?? "—",
      mtu: it.mtu ?? "—",
      rx: parseBytesString(it.rx_bytes),
      tx: parseBytesString(it.tx_bytes),
    }));
  }, [interfaces.data]);

  const fwRows: RouterFirewallRow[] = useMemo(() => {
    return (firewall.data?.filter_rules ?? []).map((r, idx) => ({
      idx,
      chain: r.chain ?? "—",
      action: actionFromOs(r.action),
      src: r.src_address ?? "any",
      dst: r.dst_address ?? "any",
      comment: r.comment ?? "",
      hits: r.packets ?? r.bytes ?? "—",
      enabled: !r.disabled,
    }));
  }, [firewall.data]);

  const dhcpRows: RouterDhcpRow[] = useMemo(() => {
    return (dhcp.data ?? []).map((l) => ({
      ip: l.address,
      mac: l.mac_address ?? "—",
      name: l.host_name ?? "(unknown)",
      exp: l.expires_after ?? "—",
      server: l.server ?? "—",
      static: !l.dynamic,
    }));
  }, [dhcp.data]);

  const totalIfaces = ifaceRows.length;
  const runningIfaces = ifaceRows.filter((r) => r.running).length;
  const downIfaces = totalIfaces - runningIfaces;
  const staticLeases = dhcpRows.filter((r) => r.static).length;
  const disabledRules = fwRows.filter((r) => !r.enabled).length;

  const connected = !!status.data?.reachable;
  const title = status.data?.board_name
    ? `MikroTik · ${status.data.board_name}`
    : "MikroTik Router";

  return (
    <RouterPage
      headerTitle={title}
      headerConnected={connected}
      headerIcon={RouterIcon}
      headerMeta={headerMeta}
      headerActions={HEADER_ACTIONS}
      stats={stats}
      tabs={MIKROTIK_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
      interfaces={ifaceRows}
      interfacesTotalsLabel={
        totalIfaces > 0
          ? `${totalIfaces} total · ${runningIfaces} running · ${downIfaces} down`
          : interfaces.loading
            ? "loading…"
            : "no data"
      }
      firewall={{
        rules: fwRows,
        label:
          fwRows.length > 0
            ? `${fwRows.length} rules · ${disabledRules} disabled`
            : firewall.loading
              ? "loading…"
              : "no rules",
      }}
      dhcp={{
        leases: dhcpRows,
        label:
          dhcpRows.length > 0
            ? `${dhcpRows.length} · ${staticLeases} static`
            : dhcp.loading
              ? "loading…"
              : "no leases",
      }}
      footer={{
        snapshotLabel: "Live RouterOS state",
        driftLabel: status.data?.platform
          ? `platform · ${status.data.platform}`
          : undefined,
        actions: DEFAULT_ROUTER_FOOTER_ACTIONS,
      }}
    />
  );
}
