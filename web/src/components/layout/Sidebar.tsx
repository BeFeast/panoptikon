"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  Bell,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Cpu,
  Gauge,
  Globe,
  LayoutDashboard,
  MonitorSmartphone,
  Network,
  Router,
  ScrollText,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWsConnected } from "@/components/providers/WebSocketProvider";
import { BrandMark } from "@/components/brand/BrandMark";

/* -------------------------------------------------------------------------- */
/*  Navigation structure                                                      */
/* -------------------------------------------------------------------------- */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
  /** When true the group starts collapsed (e.g. Legacy). */
  defaultCollapsed?: boolean;
}

export const navGroups: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/audit-log", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    key: "network",
    label: "Network",
    items: [
      { href: "/devices", label: "Devices", icon: MonitorSmartphone },
      { href: "/assets", label: "Assets", icon: Box },
      { href: "/topology", label: "Topology", icon: Network },
      { href: "/mesh", label: "Mesh", icon: Share2 },
      { href: "/traffic", label: "Traffic", icon: Activity },
      { href: "/qos", label: "QoS", icon: Gauge },
      { href: "/nat", label: "NAT", icon: ArrowRightLeft },
    ],
  },
  {
    key: "services",
    label: "Services",
    items: [
      { href: "/router", label: "Router", icon: Router, exact: true },
      { href: "/router/mikrotik", label: "MikroTik", icon: Router },
      { href: "/router/pfsense", label: "pfSense", icon: Shield },
      { href: "/caddy", label: "Caddy", icon: Shield },
      { href: "/services", label: "Services", icon: Workflow },
      { href: "/vpn-status", label: "VPN Status", icon: Shield },
      { href: "/ddns", label: "DDNS", icon: Globe },
      { href: "/dns-logs", label: "DNS Logs", icon: Search },
      { href: "/dns-queries", label: "DNS Queries", icon: Search },
      { href: "/certificates", label: "Certificates", icon: Shield },
      { href: "/cloudflare-tunnel", label: "CF Tunnel", icon: Cloud },
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    items: [
      { href: "/agents", label: "Agents", icon: Cpu },
      { href: "/ssh-hosts", label: "SSH Hosts", icon: Server },
    ],
  },
];

/** Flat list of all nav items — used by MobileSidebar. */
export const navItems: NavItem[] = [
  ...navGroups.flatMap((g) => g.items),
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(pathname: string | null, item: NavItem) {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Settings link — always visible at the bottom, outside groups. */
const settingsItem: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "panoptikon-nav-groups";

export function useGroupCollapse(groups: NavGroup[], pathname: string | null) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    for (const g of groups) {
      defaults[g.key] = g.defaultCollapsed ?? false;
    }
    return defaults;
  });

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCollapsed((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-expand the group containing the active page.
  useEffect(() => {
    if (!pathname) return;
    for (const g of groups) {
      if (g.items.some((i) => pathname.startsWith(i.href))) {
        setCollapsed((prev) => {
          if (!prev[g.key]) return prev;
          const next = { ...prev, [g.key]: false };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        break;
      }
    }
  }, [pathname, groups]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

/** Fetches the server binary version from the backend. */
export function useServerVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/version", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.version) setVersion(`v${data.version}`);
      })
      .catch(() => {});
  }, []);

  return version;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function Sidebar() {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const wsConnected = useWsConnected();
  const serverVersion = useServerVersion();
  const { collapsed: groupCollapsed, toggle: toggleGroup } = useGroupCollapse(
    navGroups,
    pathname,
  );

  /** Render a single navigation link. */
  function renderNavLink(item: NavItem) {
    const active = isNavItemActive(pathname, item);
    const Icon = item.icon;

    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          "group/nav relative flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
          active
            ? "bg-mesh-accent/10 text-mesh-accent"
            : "text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white",
          sidebarCollapsed && "justify-center px-0",
        )}
      >
        {/* Active accent bar */}
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-mesh-accent" />
        )}
        <Icon className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover/nav:scale-105" />
        {!sidebarCollapsed && <span>{item.label}</span>}
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent
            side="right"
            className="border-mesh-border bg-mesh-surface-1 animate-in slide-in-from-left-1 duration-150"
          >
            <p>{item.label}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.href}>{linkContent}</div>;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative z-20 hidden md:flex flex-col border-r border-mesh-border-strong bg-mesh-bg/90 shadow-[12px_0_36px_-30px_rgba(56,189,248,0.30)] backdrop-blur-xl transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
      >
        {/* Brand lockup — design source `Lockup direction="mesh"` */}
        <div className="flex h-[3.75rem] items-center justify-between border-b border-mesh-border-strong px-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 min-w-0"
            aria-label="Panoptikon"
          >
            <BrandMark size={28} className="text-mesh-accent" />
            {!sidebarCollapsed && (
              <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-mesh-text truncate">
                Panoptikon
              </span>
            )}
          </Link>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-mesh-text-mute transition-colors hover:bg-mesh-surface-2/55 hover:text-mesh-text"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {sidebarCollapsed
            ? /* Collapsed sidebar: flat icon list — no group headers */
              navGroups.flatMap((g) =>
                g.items.map((item) => renderNavLink(item)),
              )
            : /* Expanded sidebar: grouped with collapsible headers */
              navGroups.map((group, groupIdx) => {
                const isCollapsed = groupCollapsed[group.key] ?? false;
                const hasActive = group.items.some((i) =>
                  isNavItemActive(pathname, i),
                );

                return (
                  <div key={group.key} className="mb-1">
                    <div
                      className={cn(
                        "flex w-full items-center gap-1 px-3 py-1.5",
                        groupIdx > 0 && "mt-3 border-t border-dotted border-mesh-border-strong pt-2",
                      )}
                    >
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors text-mesh-text-mute hover:bg-mesh-surface-2/55 hover:text-mesh-text"
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.label}`}
                        aria-expanded={!isCollapsed}
                      >
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 transition-transform duration-200",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          "cursor-default select-none text-[10px] font-semibold uppercase tracking-[0.08em]",
                          hasActive ? "text-mesh-accent" : "text-mesh-text-mute",
                        )}
                      >
                        {group.label}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "grid transition-all duration-200",
                        isCollapsed
                          ? "grid-rows-[0fr] opacity-0"
                          : "grid-rows-[1fr] opacity-100",
                      )}
                    >
                      <div className={cn("overflow-hidden", isCollapsed && "invisible")}>
                        {group.items.map((item) => renderNavLink(item))}
                      </div>
                    </div>
                  </div>
                );
              })}

          {/* Settings — always visible, pinned after groups */}
          <div
            className={cn(
              "mt-1 border-t border-mesh-border-strong pt-1",
              sidebarCollapsed && "border-t-0",
            )}
          >
            {renderNavLink(settingsItem)}
          </div>
        </nav>

        {/* Version + connection status */}
        <div className="border-t border-mesh-border-strong p-2">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-1.5 px-3 py-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      wsConnected
                        ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30 status-glow-online"
                        : "bg-mesh-text-mute",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="border-mesh-border bg-mesh-surface-1"
                >
                  <p>{wsConnected ? "Live — connected" : "Disconnected"}</p>
                </TooltipContent>
              </Tooltip>
              <p className="text-[10px] text-mesh-border-strong">
                Panoptikon {serverVersion ?? "..."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 py-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      wsConnected
                        ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30 status-glow-online"
                        : "bg-mesh-text-mute",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="border-mesh-border bg-mesh-surface-1"
                >
                  <p>{wsConnected ? "Live — connected" : "Disconnected"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
