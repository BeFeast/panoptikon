"use client";

/**
 * PfSenseRouterDesign — pfSense vendor wrapper for the literal-port
 * RouterPage. Same chrome (header + stats + tabs + footer) as the
 * MikroTik wrapper, but with pfSense-specific data hooks and per-tab
 * panel switching:
 *
 *   - system      → SystemTab (legacy CRUD card grid)
 *   - interfaces  → literal-port Interfaces table
 *   - firewall    → literal-port Firewall rules panel
 *   - dhcp        → literal-port DHCP leases panel
 *   - dns         → DnsTab
 *   - services    → ServicesTab
 *   - routing     → RoutingTab
 *   - config      → ConfigTab
 *
 * The legacy tab components are reused for the non-design sub-routes
 * because the design source only ships interfaces / firewall / dhcp as
 * literal artboards.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import { Shield, RefreshCcw, Save, TerminalSquare } from "lucide-react";
import { useData } from "@/hooks/useData";
import {
  fetchPfsenseStatus,
  fetchPfsenseInterfaces,
  fetchPfsenseFirewallRules,
  fetchPfsenseDhcpLeases,
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
import { SystemTab } from "@/components/pfsense/tabs/SystemTab";
import { DnsTab } from "@/components/pfsense/tabs/DnsTab";
import { ServicesTab } from "@/components/pfsense/tabs/ServicesTab";
import { RoutingTab } from "@/components/pfsense/tabs/RoutingTab";
import { ConfigTab } from "@/components/pfsense/tabs/ConfigTab";

const PFSENSE_TABS: RouterTab[] = [
  { id: "system", label: "System" },
  { id: "interfaces", label: "Interfaces" },
  { id: "firewall", label: "Firewall" },
  { id: "dhcp", label: "DHCP" },
  { id: "dns", label: "DNS" },
  { id: "services", label: "Services" },
  { id: "routing", label: "Routing" },
  { id: "config", label: "Config" },
];

const HEADER_ACTIONS = [
  { label: "Reload", icon: RefreshCcw },
  { label: "Backup", icon: Save },
  { label: "Open shell", icon: TerminalSquare, primary: true },
];

function ifaceTypeFromPfsense(t: string | null | undefined): string {
  if (!t) return "ethernet";
  const lower = t.toLowerCase();
  if (lower.includes("bridge")) return "bridge";
  if (lower.includes("vlan")) return "vlan";
  if (lower.includes("wg") || lower.includes("wireguard")) return "wireguard";
  return "ethernet";
}

export default function PfSenseRouterDesign({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  const status = useData(useCallback(() => fetchPfsenseStatus(), []));
  const interfaces = useData(useCallback(() => fetchPfsenseInterfaces(), []));
  const rules = useData(useCallback(() => fetchPfsenseFirewallRules(), []));
  const leases = useData(useCallback(() => fetchPfsenseDhcpLeases(), []));

  const headerMeta: RouterHeaderMeta[] = useMemo(() => {
    const meta: RouterHeaderMeta[] = [];
    if (status.data?.version) meta.push({ label: `pfSense ${status.data.version}` });
    if (status.data?.platform) meta.push({ label: status.data.platform });
    if (status.data?.hostname) meta.push({ label: status.data.hostname });
    if (status.data?.uptime)
      meta.push({ label: `uptime ${status.data.uptime}` });
    return meta;
  }, [status.data]);

  const stats: RouterStatRow[] = useMemo(() => {
    const cpu = Number(status.data?.cpu_usage ?? 0) || 0;
    const memTotal = Number(status.data?.memory_total ?? 0) || 0;
    const memUsed = Number(status.data?.memory_used ?? 0) || 0;
    const memMb = memTotal > 0
      ? Math.round(memUsed / (1024 * 1024))
      : 0;
    const totalIfaces = (interfaces.data ?? []).length;
    const ruleCount = (rules.data ?? []).length;
    const leaseCount = (leases.data ?? []).length;

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
        v: memMb.toString(),
        u: "MB",
        spark: gen(28, Math.max(memMb, 128), 12),
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
        k: "Interfaces",
        v: totalIfaces.toString(),
        u: "",
        spark: gen(28, Math.max(totalIfaces, 4), 2),
        color: "#38bdf8",
      },
      {
        k: "Rules",
        v: ruleCount.toString(),
        u: "FW",
        spark: gen(28, Math.max(ruleCount, 10), 4),
        color: "var(--accent-violet)",
      },
      {
        k: "Leases",
        v: leaseCount.toString(),
        u: "DHCP",
        spark: gen(28, Math.max(leaseCount, 10), 4),
        color: "var(--text)",
      },
    ];
  }, [status.data, interfaces.data, rules.data, leases.data]);

  const ifaceRows: RouterInterfaceRow[] = useMemo(() => {
    return (interfaces.data ?? []).map((it) => ({
      name: it.descr ?? it.name,
      type: ifaceTypeFromPfsense(it.iface_type),
      running: (it.status ?? "").toLowerCase() === "up",
      ip: it.ip_address ?? "—",
      role: it.descr ?? it.name,
      mac: it.mac ?? "—",
      mtu: it.mtu != null ? String(it.mtu) : "—",
      rx: 0, // pfSense API does not expose per-interface byte counters
      tx: 0,
    }));
  }, [interfaces.data]);

  const fwRows: RouterFirewallRow[] = useMemo(() => {
    return (rules.data ?? []).map((r, idx) => ({
      idx,
      chain: r.interface,
      action: r.action,
      src: r.source,
      dst: r.destination,
      comment: r.description ?? "",
      hits: r.tracker ?? "—",
      enabled: !r.disabled,
    }));
  }, [rules.data]);

  const dhcpRows: RouterDhcpRow[] = useMemo(() => {
    return (leases.data ?? []).map((l) => ({
      ip: l.ip,
      mac: l.mac,
      name: l.hostname ?? "(unknown)",
      exp: l.end ?? "—",
      server: l.interface,
      static: l.status === "static",
    }));
  }, [leases.data]);

  const totalIfaces = ifaceRows.length;
  const runningIfaces = ifaceRows.filter((r) => r.running).length;
  const downIfaces = totalIfaces - runningIfaces;
  const staticLeases = dhcpRows.filter((r) => r.static).length;
  const disabledRules = fwRows.filter((r) => !r.enabled).length;

  const connected = !!status.data?.reachable;
  const title = status.data?.hostname
    ? `pfSense · ${status.data.hostname}`
    : "pfSense Firewall";

  // ── Per-tab panel selection. The header/stats/tabs strip + footer stay
  //    identical across tabs; only the body content swaps. ───────────────
  const showInterfaces = activeTab === "interfaces";
  const showFirewall = activeTab === "firewall";
  const showDhcp = activeTab === "dhcp";

  const extraContent: ReactNode = (() => {
    switch (activeTab) {
      case "system":
        return status.data ? (
          <div data-testid="pfsense-panel-system">
            <SystemTab status={status.data} />
          </div>
        ) : null;
      case "dns":
        return (
          <div data-testid="pfsense-panel-dns">
            <DnsTab />
          </div>
        );
      case "services":
        return (
          <div data-testid="pfsense-panel-services">
            <ServicesTab />
          </div>
        );
      case "routing":
        return (
          <div data-testid="pfsense-panel-routing">
            <RoutingTab />
          </div>
        );
      case "config":
        return (
          <div data-testid="pfsense-panel-config">
            <ConfigTab />
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <RouterPage
      headerTitle={title}
      headerConnected={connected}
      headerIcon={Shield}
      headerIconColor="#2563eb"
      headerMeta={headerMeta}
      headerActions={HEADER_ACTIONS}
      stats={stats}
      tabs={PFSENSE_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
      interfaces={ifaceRows}
      showInterfaces={showInterfaces}
      interfacesTotalsLabel={
        totalIfaces > 0
          ? `${totalIfaces} total · ${runningIfaces} up · ${downIfaces} down`
          : interfaces.loading
            ? "loading…"
            : "no data"
      }
      firewall={
        showFirewall
          ? {
              rules: fwRows,
              label:
                fwRows.length > 0
                  ? `${fwRows.length} rules · ${disabledRules} disabled`
                  : rules.loading
                    ? "loading…"
                    : "no rules",
            }
          : undefined
      }
      dhcp={
        showDhcp
          ? {
              leases: dhcpRows,
              label:
                dhcpRows.length > 0
                  ? `${dhcpRows.length} · ${staticLeases} static`
                  : leases.loading
                    ? "loading…"
                    : "no leases",
            }
          : undefined
      }
      extraContent={extraContent}
      footer={{
        snapshotLabel: "Live pfSense state",
        driftLabel: status.data?.domain
          ? `domain · ${status.data.domain}`
          : undefined,
        actions: DEFAULT_ROUTER_FOOTER_ACTIONS,
      }}
    />
  );
}
