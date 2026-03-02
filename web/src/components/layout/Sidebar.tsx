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

/* -------------------------------------------------------------------------- */
/*  Navigation structure                                                      */
/* -------------------------------------------------------------------------- */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
    key: "network",
    label: "Network",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/devices", label: "Devices", icon: MonitorSmartphone },
      { href: "/assets", label: "Assets", icon: Box },
      { href: "/topology", label: "Topology", icon: Network },
      { href: "/mesh", label: "Mesh", icon: Share2 },
      { href: "/traffic", label: "Traffic", icon: Activity },
    ],
  },
  {
    key: "routing",
    label: "Routing & Proxy",
    items: [
      { href: "/router", label: "Router", icon: Router },
      { href: "/caddy", label: "Caddy", icon: Shield },
      { href: "/services", label: "Services", icon: Workflow },
      { href: "/nat", label: "NAT", icon: ArrowRightLeft },
      { href: "/qos", label: "QoS", icon: Gauge },
      { href: "/vpn-status", label: "VPN Status", icon: Shield },
      { href: "/ddns", label: "DDNS", icon: Globe },
    ],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    items: [
      { href: "/dns-logs", label: "DNS Logs", icon: Search },
      { href: "/dns-queries", label: "DNS Queries", icon: Search },
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/certificates", label: "Certificates", icon: Shield },
    ],
  },
  {
    key: "infrastructure",
    label: "Infrastructure",
    items: [
      { href: "/agents", label: "Agents", icon: Cpu },
      { href: "/ssh-hosts", label: "SSH Hosts", icon: Server },
      { href: "/cloudflare-tunnel", label: "CF Tunnel", icon: Cloud },
    ],
  },
];

/** Flat list of all nav items — used by MobileSidebar. */
export const navItems: NavItem[] = [
  ...navGroups.flatMap((g) => g.items),
  { href: "/settings", label: "Settings", icon: Settings },
];

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
    const active = pathname?.startsWith(item.href);
    const Icon = item.icon;

    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-blue-500/10 text-blue-500"
            : "text-slate-400 hover:bg-slate-800/60 hover:text-white",
          sidebarCollapsed && "justify-center px-0",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!sidebarCollapsed && <span>{item.label}</span>}
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent
            side="right"
            className="border-slate-800 bg-slate-900"
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
          "hidden md:flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-slate-800 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 text-sm font-bold text-white">
            P
          </div>
          {!sidebarCollapsed && (
            <span className="ml-2 text-lg font-semibold text-white">
              Panoptikon
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {sidebarCollapsed
            ? /* Collapsed sidebar: flat icon list — no group headers */
              navGroups.flatMap((g) =>
                g.items.map((item) => renderNavLink(item)),
              )
            : /* Expanded sidebar: grouped with collapsible headers */
              navGroups.map((group) => {
                const isCollapsed = groupCollapsed[group.key] ?? false;
                const hasActive = group.items.some((i) =>
                  pathname?.startsWith(i.href),
                );

                return (
                  <div key={group.key} className="mb-1">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                        hasActive
                          ? "text-blue-400"
                          : "text-slate-500 hover:text-slate-300",
                      )}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 shrink-0 transition-transform duration-200",
                          isCollapsed && "-rotate-90",
                        )}
                      />
                      <span>{group.label}</span>
                    </button>
                    <div
                      className={cn(
                        "grid transition-all duration-200",
                        isCollapsed
                          ? "grid-rows-[0fr] opacity-0"
                          : "grid-rows-[1fr] opacity-100",
                      )}
                    >
                      <div className="overflow-hidden">
                        {group.items.map((item) => renderNavLink(item))}
                      </div>
                    </div>
                  </div>
                );
              })}

          {/* Settings — always visible, pinned after groups */}
          <div
            className={cn(
              "mt-1 border-t border-slate-800/50 pt-1",
              sidebarCollapsed && "border-t-0",
            )}
          >
            {renderNavLink(settingsItem)}
          </div>
        </nav>

        {/* Collapse toggle + version */}
        <div className="border-t border-slate-800 p-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-800/60 hover:text-slate-400"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
          {!sidebarCollapsed ? (
            <div className="mt-1 flex items-center gap-1.5 px-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      wsConnected
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                        : "bg-slate-600",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="border-slate-800 bg-slate-900"
                >
                  <p>{wsConnected ? "Live — connected" : "Disconnected"}</p>
                </TooltipContent>
              </Tooltip>
              <p className="text-[10px] text-slate-700">
                Panoptikon {serverVersion ?? "..."}
              </p>
            </div>
          ) : (
            <div className="mt-1 flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      wsConnected
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                        : "bg-slate-600",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="border-slate-800 bg-slate-900"
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
