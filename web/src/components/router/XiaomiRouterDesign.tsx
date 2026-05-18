"use client";

/**
 * XiaomiRouterDesign — Xiaomi vendor wrapper for the literal-port
 * RouterPage. Xiaomi MiWiFi exposes neither pf-style firewall rules nor
 * DHCP leases via the public API, so the firewall + DHCP panels are
 * suppressed (the design source's `firewall` and `dhcp` slots become
 * optional in RouterPage). The interfaces table is populated from the
 * mesh topology (root + child node uplinks), preserving the design's
 * Interfaces panel chrome.
 */

import { useCallback, useMemo } from "react";
import { Network, RefreshCcw, Save } from "lucide-react";
import { useData } from "@/hooks/useData";
import {
  fetchXiaomiStatus,
  fetchXiaomiTopology,
  fetchXiaomiWanInfo,
  fetchXiaomiLanInfo,
} from "@/lib/api";
import {
  RouterPage,
  type RouterInterfaceRow,
  type RouterStatRow,
  gen,
} from "@/components/router/RouterPage";
import type { RouterTab } from "@/components/router/RouterTabs";
import type { RouterHeaderMeta } from "@/components/router/RouterHeader";

const XIAOMI_TABS: RouterTab[] = [
  { id: "system", label: "System" },
  { id: "mesh", label: "Mesh" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "wan", label: "WAN" },
  { id: "lan", label: "LAN" },
  { id: "devices", label: "Devices" },
];

const HEADER_ACTIONS = [
  { label: "Refresh", icon: RefreshCcw },
  { label: "Backup", icon: Save },
];

export default function XiaomiRouterDesign({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const status = useData(useCallback(() => fetchXiaomiStatus(), []));
  const topology = useData(useCallback(() => fetchXiaomiTopology(), []));
  const wan = useData(useCallback(() => fetchXiaomiWanInfo(), []));
  const lan = useData(useCallback(() => fetchXiaomiLanInfo(), []));

  const headerMeta: RouterHeaderMeta[] = useMemo(() => {
    const meta: RouterHeaderMeta[] = [];
    if (status.data?.devices_online != null)
      meta.push({ label: `${status.data.devices_online} devices online` });
    if (wan.data?.wan_type) meta.push({ label: `WAN ${wan.data.wan_type}` });
    if (wan.data?.ip) meta.push({ label: wan.data.ip });
    if (status.data?.uptime)
      meta.push({ label: `uptime ${status.data.uptime}` });
    return meta;
  }, [status.data, wan.data]);

  const stats: RouterStatRow[] = useMemo(() => {
    const cpu = Number(status.data?.cpu_load ?? 0) || 0;
    const mem = Number(status.data?.mem_usage ?? 0) || 0;
    const temp = Number(status.data?.temperature ?? 0) || 0;
    const onlineCount = status.data?.devices_online ?? 0;
    const totalCount = status.data?.devices_total ?? 0;
    const wanDown = status.data?.wan_download ?? "—";
    const wanUp = status.data?.wan_upload ?? "—";

    return [
      {
        k: "CPU",
        v: cpu.toString(),
        u: "%",
        spark: gen(28, Math.max(cpu, 8), 6),
        color: "var(--accent-cyan)",
      },
      {
        k: "Memory",
        v: mem.toString(),
        u: "%",
        spark: gen(28, Math.max(mem, 30), 8),
        color: "var(--accent-violet)",
      },
      {
        k: "Temperature",
        v: temp.toString(),
        u: "°C",
        spark: gen(28, Math.max(temp, 35), 4),
        color: "#fbbf24",
      },
      {
        k: "Devices online",
        v: onlineCount.toString(),
        u: totalCount > 0 ? `of ${totalCount}` : "",
        spark: gen(28, Math.max(onlineCount, 8), 3),
        color: "#38bdf8",
      },
      {
        k: "WAN · RX",
        v: wanDown,
        u: "",
        spark: gen(28, 200, 120),
        color: "var(--accent-violet)",
      },
      {
        k: "WAN · TX",
        v: wanUp,
        u: "",
        spark: gen(28, 60, 38),
        color: "var(--text)",
      },
    ];
  }, [status.data]);

  const ifaceRows: RouterInterfaceRow[] = useMemo(() => {
    const rows: RouterInterfaceRow[] = [];
    if (lan.data) {
      rows.push({
        name: "lan",
        type: "bridge",
        running: true,
        ip: lan.data.ip ?? "—",
        role: "LAN",
        mac: "—",
        mtu: "—",
        rx: 0,
        tx: 0,
      });
      for (const port of lan.data.ports ?? []) {
        rows.push({
          name: `lan${port.port ?? ""}`,
          type: "ethernet",
          running: (port.link_status ?? "").toLowerCase() === "up",
          ip: "—",
          role: port.speed ?? "—",
          mac: "—",
          mtu: "—",
          rx: 0,
          tx: 0,
        });
      }
    }
    if (wan.data) {
      rows.unshift({
        name: "wan",
        type: "ethernet",
        running: true,
        ip: wan.data.ip ?? "—",
        role: "WAN",
        mac: "—",
        mtu: "—",
        rx: 0,
        tx: 0,
      });
    }
    for (const node of topology.data?.nodes ?? []) {
      rows.push({
        name: node.name ?? node.mac ?? "node",
        type: "bridge",
        running: !!node.online,
        ip: node.ip ?? "—",
        role: node.hardware ?? node.model ?? "—",
        mac: node.mac ?? "—",
        mtu: "—",
        rx: 0,
        tx: 0,
      });
    }
    return rows;
  }, [lan.data, wan.data, topology.data]);

  const totalIfaces = ifaceRows.length;
  const runningIfaces = ifaceRows.filter((r) => r.running).length;
  const downIfaces = totalIfaces - runningIfaces;

  const connected = !!status.data?.reachable;
  const title = "Xiaomi Mesh";

  return (
    <RouterPage
      headerTitle={title}
      headerConnected={connected}
      headerIcon={Network}
      headerIconColor="#fbbf24"
      headerMeta={headerMeta}
      headerActions={HEADER_ACTIONS}
      stats={stats}
      tabs={XIAOMI_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
      interfaces={ifaceRows}
      interfacesTotalsLabel={
        totalIfaces > 0
          ? `${totalIfaces} total · ${runningIfaces} up · ${downIfaces} down`
          : topology.loading || lan.loading || wan.loading
            ? "loading…"
            : "no data"
      }
      // Xiaomi has no firewall / DHCP panels in the API surface.
      // The design source's `firewall` and `dhcp` slots stay collapsed.
    />
  );
}
