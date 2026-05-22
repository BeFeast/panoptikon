"use client";

/* eslint-disable react/jsx-no-comment-textnodes */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  Bell,
  Box,
  Cloud,
  Cpu,
  Gauge,
  Globe,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  Network,
  Router,
  ScrollText,
  Search as SearchIcon,
  Server,
  Settings as SettingsIcon,
  Share2,
  Shield,
  Workflow,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { StatusDot } from "@/components/mesh/StatusDot";
import { ShortcutKey } from "@/components/ShortcutKey";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout, searchAll } from "@/lib/api";
import { useWsConnected } from "@/components/providers/WebSocketProvider";
import type {
  SearchAgent,
  SearchAlert,
  SearchAsset,
  SearchDevice,
  SearchResponse,
  SearchSshTarget,
} from "@/lib/types";

/* --------------------------------------------------------------------------
 * Nav data — same shape used previously; per-item href + active match logic
 * is wired below. Icons map to lucide-react components (replacement for the
 * design'\''s <Icon name="..." /> primitive).
 * -------------------------------------------------------------------------- */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badgeKind?: "alerts" | "agents" | "devices";
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/alerts", label: "Alerts", icon: Bell, badgeKind: "alerts" },
      { href: "/audit-log", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    key: "network",
    label: "Network",
    items: [
      { href: "/devices", label: "Devices", icon: MonitorSmartphone, badgeKind: "devices" },
      { href: "/assets", label: "Assets", icon: Box },
      { href: "/topology", label: "Topology", icon: Network },
      { href: "/qos", label: "QoS", icon: Gauge },
      { href: "/nat", label: "NAT", icon: ArrowRightLeft },
      { href: "/traffic", label: "Traffic", icon: Activity },
    ],
  },
  {
    key: "services",
    label: "Services",
    items: [
      { href: "/router", label: "Router", icon: Router },
      { href: "/dns-logs", label: "DNS", icon: Globe },
      { href: "/dns-queries", label: "DNS queries", icon: SearchIcon },
      { href: "/certificates", label: "Certificates", icon: Shield },
      { href: "/caddy", label: "Caddy", icon: Server },
      { href: "/vpn-status", label: "VPN status", icon: Shield },
      { href: "/cloudflare-tunnel", label: "Cloudflare tunnel", icon: Cloud },
      { href: "/services", label: "Services", icon: Share2 },
    ],
  },
  {
    key: "fleet",
    label: "Fleet",
    items: [
      { href: "/agents", label: "Agents", icon: Cpu, badgeKind: "agents" },
      { href: "/ssh-hosts", label: "SSH hosts", icon: Workflow },
    ],
  },
];

export const utilityNavItems: NavItem[] = [{
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
}];

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href || pathname === `${item.href}/`;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/* --------------------------------------------------------------------------
 * Server-version polling — drives the user-pill `core · {uptime}` line.
 * -------------------------------------------------------------------------- */

interface ServerStatus {
  version: string | null;
  uptimeSeconds: number | null;
}

export function useServerStatus(): ServerStatus {
  const [state, setState] = useState<ServerStatus>({ version: null, uptimeSeconds: null });
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

export function formatUptime(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* --------------------------------------------------------------------------
 * Group collapse state (carried over from prior implementation; mesh nav
 * groups stay expanded by default but allow click-to-toggle).
 * -------------------------------------------------------------------------- */

export function useGroupCollapse(groups: NavGroup[], _pathname: string) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  return { collapsed, toggle, allGroups: groups };
}

/* ==========================================================================
 * Sidebar — literal port of shell.jsx `function Sidebar(...)` (lines 42-147).
 * Conflict-resolved tokens:
 *   var(--border)         → literal rgba(96,144,212,0.20)
 *   var(--primary)        → literal #2563eb
 *   var(--status-offline) → literal #fb7185
 * ========================================================================== */

export function Sidebar() {
  const pathname = usePathname() || "";
  const [collapsed, setCollapsed] = useState(false);
  const wsConnected = useWsConnected();
  const serverStatus = useServerStatus();
  const W = collapsed ? 56 : 224;

  return (
    <aside
      style={{
        width: W,
        flex: `0 0 ${W}px`,
        background: "var(--surface-1)",
        borderRight: "1px solid rgba(96,144,212,0.20)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transition: "width var(--motion)",
        position: "relative",
        overflow: "hidden",
      }}
      className="hidden md:flex"
    >
      {/* Mesh direction decorative vertical rail (shell.jsx 58-63) */}
      {!collapsed && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 64,
            bottom: 64,
            right: 12,
            width: 1,
            backgroundImage:
              "linear-gradient(180deg, transparent, rgba(96,144,212,0.20) 12%, rgba(96,144,212,0.20) 88%, transparent)",
            opacity: 0.6,
          }}
        />
      )}

      {/* Brand */}
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: collapsed ? "0 12px" : "0 14px",
          borderBottom: "1px solid rgba(96,144,212,0.20)",
        }}
      >
        <Link
          href="/dashboard"
          aria-label="Panoptikon"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <BrandMark size={28} className="text-mesh-accent" />
          {!collapsed && (
            <span
              className="font-mono"
              style={{
                font: "600 13px var(--font-sans)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Panoptikon
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: 24,
            height: 24,
            padding: 0,
            background: "transparent",
            border: 0,
            color: "var(--text-mute)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Search (shell.jsx 78-100) */}
      {!collapsed && (
        <div style={{ padding: "10px 12px" }}>
          <SidebarSearch />
        </div>
      )}

      {/* Nav groups (shell.jsx 103-122) */}
      <nav
        className="no-scrollbar"
        style={{ flex: 1, overflowY: "auto", padding: "6px 8px 12px" }}
      >
        {navGroups.map((group) => (
          <div key={group.key} style={{ marginBottom: 14 }}>
            {!collapsed && (
              <div
                style={{
                  padding: "8px 6px 4px",
                  font: "500 10px var(--font-sans)",
                  color: "var(--text-mute)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {group.label}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {group.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={isNavItemActive(pathname, item)}
                />
              ))}
            </div>
          </div>
        ))}
        {/* Utility nav — pinned after groups, shared with mobile sidebar */}
        <div style={{ marginTop: 8 }}>
          {utilityNavItems.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              active={isNavItemActive(pathname, item)}
            />
          ))}
        </div>
      </nav>

      {/* Footer — user + server health (shell.jsx 124-145) */}
      {!collapsed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              style={{
                padding: "8px 10px",
                borderTop: "1px solid rgba(96,144,212,0.20)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "transparent",
                border: 0,
                borderTopColor: "rgba(96,144,212,0.20)",
                borderTopWidth: 1,
                borderTopStyle: "solid",
                color: "var(--text)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "var(--radius-pill)",
                  background: "linear-gradient(135deg, #2563eb, var(--accent-violet))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 11px var(--font-sans)",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                op
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    font: "500 12px var(--font-sans)",
                    color: "var(--text)",
                  }}
                >
                  operator
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    font: "400 10px var(--font-mono)",
                    color: "var(--text-mute)",
                  }}
                >
                  <StatusDot
                    status={wsConnected ? "online" : "offline"}
                    pulse={wsConnected}
                    size={6}
                  />
                  <span>core · {formatUptime(serverStatus.uptimeSeconds)}</span>
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            style={{
              minWidth: 160,
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await logout();
                } catch {
                  /* even if API fails, redirect to login */
                }
                window.location.href = "/login";
              }}
              style={{ cursor: "pointer", color: "var(--text)" }}
            >
              <LogOut size={14} style={{ marginRight: 8 }} aria-hidden="true" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </aside>
  );
}

/* --------------------------------------------------------------------------
 * NavItemLink — literal port of shell.jsx `function NavItem(...)` (149-196),
 * scoped to mesh direction. Active state uses dashed cyan bottom rail.
 * -------------------------------------------------------------------------- */

function NavItemLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const IconComp = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 9,
        height: 28,
        padding: collapsed ? "0 10px" : "0 8px",
        margin: 0,
        borderRadius: "var(--radius-sm)",
        font: `${active ? 500 : 400} 12.5px var(--font-sans)`,
        color: active ? "var(--text)" : "var(--text-dim)",
        background: active ? "var(--surface-2)" : "transparent",
        cursor: "pointer",
        textDecoration: "none",
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 1,
            backgroundImage:
              "linear-gradient(90deg, var(--accent-cyan) 50%, transparent 50%)",
            backgroundSize: "4px 1px",
            backgroundRepeat: "repeat-x",
          }}
        />
      )}
      <IconComp
        size={14}
        color={active ? "#2563eb" : "var(--text-mute)"}
        strokeWidth={active ? 2 : 1.6}
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      />
      {!collapsed && (
        <span
          style={{
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

/* --------------------------------------------------------------------------
 * SidebarSearch — literal port of shell.jsx Search slot (78-100).
 * Inline-styled per source; dropdown is a production extension wired to the
 * existing /api/v1/search endpoint.
 * -------------------------------------------------------------------------- */

function SidebarSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setIsOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await searchAll(query);
        setResults(data);
        setIsOpen(true);
        setActiveIndex(-1);
      } catch {
        setResults(null);
        setIsOpen(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const flatItems = useMemo(() => {
    if (!results) return [] as Array<{ type: string; id: string; label: string }>;
    const items: Array<{ type: string; id: string; label: string }> = [];
    for (const d of results.devices)
      items.push({ type: "device", id: d.id, label: d.ip_address || d.hostname || d.mac_address });
    for (const a of results.agents)
      items.push({ type: "agent", id: a.id, label: a.hostname || a.id });
    for (const st of results.ssh_targets)
      items.push({ type: "ssh_target", id: st.id, label: `${st.username}@${st.host}` });
    for (const as of results.assets) items.push({ type: "asset", id: as.id, label: as.name });
    for (const al of results.alerts) items.push({ type: "alert", id: al.id, label: al.message });
    return items;
  }, [results]);

  function navigateTo(type: string, id: string) {
    setIsOpen(false);
    setQuery("");
    if (type === "device") window.location.href = `/devices?highlight=${id}`;
    else if (type === "agent") window.location.href = "/agents";
    else if (type === "ssh_target") window.location.href = "/ssh-hosts";
    else if (type === "asset") window.location.href = "/assets";
    else if (type === "alert") window.location.href = "/alerts";
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || flatItems.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % flatItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? flatItems.length - 1 : prev - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          navigateTo(flatItems[activeIndex].type, flatItems[activeIndex].id);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 28,
          padding: "0 10px",
          background: "var(--surface-2)",
          border: "1px solid rgba(96,144,212,0.20)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-mute)",
          font: "400 12px var(--font-sans)",
        }}
      >
        <SearchIcon size={13} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (results && query.length >= 2) setIsOpen(true);
          }}
          placeholder="Search"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: "none",
            color: "var(--text)",
            font: "400 12px var(--font-sans)",
            minWidth: 0,
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
            border: "1px solid rgba(96,144,212,0.20)",
          }}
        >
          <ShortcutKey actionKey="k" />
        </kbd>
      </div>

      {isOpen && results && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--surface-1)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-pop)",
            zIndex: 50,
          }}
        >
          {flatItems.length === 0 ? (
            <div
              style={{
                padding: "10px 12px",
                font: "400 11px var(--font-sans)",
                color: "var(--text-mute)",
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <SearchResultsList
              results={results}
              activeIndex={activeIndex}
              navigateTo={navigateTo}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultsList({
  results,
  activeIndex,
  navigateTo,
}: {
  results: SearchResponse;
  activeIndex: number;
  navigateTo: (type: string, id: string) => void;
}) {
  let idx = 0;
  const section = (label: string, content: React.ReactNode) => (
    <div style={{ padding: "4px 0" }}>
      <div
        style={{
          padding: "4px 12px",
          font: "500 9px var(--font-mono)",
          color: "var(--text-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {content}
    </div>
  );
  const row = (key: string, isActive: boolean, label: string, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        width: "100%",
        padding: "6px 12px",
        background: isActive ? "var(--surface-2)" : "transparent",
        border: 0,
        textAlign: "left",
        font: "400 12px var(--font-sans)",
        color: "var(--text)",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
  return (
    <>
      {results.devices.length > 0 &&
        section(
          "Devices",
          results.devices.map((d: SearchDevice) => {
            const here = idx++;
            const label = d.ip_address || d.hostname || d.mac_address;
            return row(`d-${d.id}`, here === activeIndex, label, () =>
              navigateTo("device", d.id),
            );
          }),
        )}
      {results.agents.length > 0 &&
        section(
          "Agents",
          results.agents.map((a: SearchAgent) => {
            const here = idx++;
            return row(`a-${a.id}`, here === activeIndex, a.hostname || a.id, () =>
              navigateTo("agent", a.id),
            );
          }),
        )}
      {results.ssh_targets.length > 0 &&
        section(
          "SSH targets",
          results.ssh_targets.map((st: SearchSshTarget) => {
            const here = idx++;
            return row(
              `s-${st.id}`,
              here === activeIndex,
              `${st.username}@${st.host}`,
              () => navigateTo("ssh_target", st.id),
            );
          }),
        )}
      {results.assets.length > 0 &&
        section(
          "Assets",
          results.assets.map((as: SearchAsset) => {
            const here = idx++;
            return row(`as-${as.id}`, here === activeIndex, as.name, () =>
              navigateTo("asset", as.id),
            );
          }),
        )}
      {results.alerts.length > 0 &&
        section(
          "Alerts",
          results.alerts.map((al: SearchAlert) => {
            const here = idx++;
            return row(`al-${al.id}`, here === activeIndex, al.message, () =>
              navigateTo("alert", al.id),
            );
          }),
        )}
    </>
  );
}
