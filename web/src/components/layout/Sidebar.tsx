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
import { StatusDot } from "@/components/mesh/StatusDot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/api";
import { LogOut } from "lucide-react";

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
      { href: "/router", label: "Router", icon: Router },
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

interface ServerStatus {
  version: string | null;
  uptimeSeconds: number | null;
}

/** Fetches the server binary version + uptime, polls every 60s. */
export function useServerStatus(): ServerStatus {
  const [state, setState] = useState<ServerStatus>({
    version: null,
    uptimeSeconds: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/v1/version", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setState({
          version: data?.version ? `v${data.version}` : null,
          uptimeSeconds: typeof data?.uptime_seconds === "number" ? data.uptime_seconds : null,
        });
      } catch {
        /* swallow */
      }
    }
    void tick();
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

/**
 * Formats uptime in seconds into the design's compact "14d 6h" / "6h 23m" /
 * "42m" style. Per shell.jsx footer: "core · 14d 6h".
 */
function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function Sidebar() {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const wsConnected = useWsConnected();
  const serverStatus = useServerStatus();
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

        {/* Footer — user pill (per shell.jsx 122-144). Hidden when collapsed.
         * Dropdown-wrapped for logout discoverability after removing TopBar
         * user menu — pill visual is unchanged. */}
        {!sidebarCollapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-mesh-border-strong px-2.5 py-2 text-left transition-colors hover:bg-mesh-surface-2/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mesh-accent"
              >
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #2563eb, #8b5cf6)" }}
                >
                  op
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-mesh-text">operator</span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-mesh-text-mute">
                    <StatusDot status={wsConnected ? "online" : "offline"} pulse={wsConnected} size={6} />
                    <span>core · {formatUptime(serverStatus.uptimeSeconds)}</span>
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-40 border-mesh-border bg-mesh-surface-1"
            >
              <DropdownMenuItem
                className="cursor-pointer text-mesh-text"
                onClick={async () => {
                  try {
                    await logout();
                  } catch {
                    /* even if API fails, redirect to login */
                  }
                  window.location.href = "/login";
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </aside>
    </TooltipProvider>
  );
}
