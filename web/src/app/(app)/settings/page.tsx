"use client";

/**
 * Settings landing — mesh-direction port of `panopticon/project/settings.jsx`.
 *
 * Tile-based directory grouped by domain (Router · DNS · Security · Fleet ·
 * Notifications · Advanced) with eyebrow header, search/filter bar, accent
 * stripe per group, and status pip on each tile. All sub-route data-fetching
 * (settings, mikrotik, pfsense, caddy, tunnel, alert-rules, users, db,
 * backups, dns) is preserved verbatim — only the surface is renewed.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  Database,
  FileText,
  Globe,
  HardDrive,
  Lock,
  Mail,
  Network,
  Radio,
  Radar,
  Router,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageTransition } from "@/components/PageTransition";
import {
  fetchAlertRules,
  fetchCaddyStatus,
  fetchCloudflareTunnelStatus,
  fetchConfigBackups,
  fetchDbSize,
  fetchDnsBlocklistStats,
  fetchDnsSecurity,
  fetchMikrotikStatus,
  fetchPfsenseStatus,
  fetchSettings,
  fetchUsers,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  AlertRule,
  CaddyStatus,
  CloudflareTunnelStatus,
  ConfigBackupListResponse,
  DbSizeData,
  DnsBlocklistStats,
  DnsSecuritySettings,
  MikrotikStatus,
  PfsenseStatus,
  SettingsData,
  User,
} from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────

type Tone = "connected" | "enabled" | "disabled" | "error" | "neutral";

type TileStatus = {
  label: string;
  detail?: string;
  tone: Tone;
};

type DirectoryState = {
  settings: SettingsData | null;
  mikrotik: MikrotikStatus | null;
  pfsense: PfsenseStatus | null;
  caddy: CaddyStatus | null;
  cloudflare: CloudflareTunnelStatus | null;
  alertRules: AlertRule[] | null;
  users: User[] | null;
  dbSize: DbSizeData | null;
  backups: ConfigBackupListResponse | null;
  dnsSecurity: DnsSecuritySettings | null;
  dnsBlocklists: DnsBlocklistStats | null;
};

const emptyState: DirectoryState = {
  settings: null,
  mikrotik: null,
  pfsense: null,
  caddy: null,
  cloudflare: null,
  alertRules: null,
  users: null,
  dbSize: null,
  backups: null,
  dnsSecurity: null,
  dnsBlocklists: null,
};

// ── Mesh-direction settings IA ───────────────────────────────────────────

type AccentClass = {
  /** Solid stripe used by group label (3px wide). */
  stripe: string;
  /** Icon foreground (text-) class. */
  icon: string;
  /** Icon background tint. */
  iconBg: string;
};

type TileItem = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  keywords?: string[];
};

type TileGroup = {
  label: string;
  subtitle?: string;
  accent: AccentClass;
  items: TileItem[];
};

// Accent palette uses literal hex from the design source tokens (mesh
// direction): cyan #67e8f9, violet #a78bfa, emerald #4ade80, amber #fbbf24,
// rose #fb7185, slate #94a3b8. CI design-token guard whitelists hex values.
const ACCENT_PRIMARY: AccentClass = {
  stripe: "bg-mesh-primary",
  icon: "text-mesh-primary",
  iconBg: "bg-mesh-primary/10 ring-mesh-primary/20",
};
const ACCENT_CYAN: AccentClass = {
  stripe: "bg-[#67e8f9]",
  icon: "text-[#67e8f9]",
  iconBg: "bg-mesh-accent/10 ring-mesh-accent/20",
};
const ACCENT_VIOLET: AccentClass = {
  stripe: "bg-[#a78bfa]",
  icon: "text-[#a78bfa]",
  iconBg: "bg-[#a78bfa]/10 ring-[#a78bfa]/20",
};
const ACCENT_EMERALD: AccentClass = {
  stripe: "bg-[#4ade80]",
  icon: "text-[#4ade80]",
  iconBg: "bg-[#4ade80]/10 ring-[#4ade80]/20",
};
const ACCENT_AMBER: AccentClass = {
  stripe: "bg-[#fbbf24]",
  icon: "text-[#fbbf24]",
  iconBg: "bg-[#fbbf24]/10 ring-[#fbbf24]/20",
};
const ACCENT_ROSE: AccentClass = {
  stripe: "bg-[#fb7185]",
  icon: "text-[#fb7185]",
  iconBg: "bg-[#fb7185]/10 ring-[#fb7185]/20",
};
const ACCENT_MUTED: AccentClass = {
  stripe: "bg-mesh-text-mute",
  icon: "text-mesh-text-dim",
  iconBg: "bg-mesh-text-mute/10 ring-mesh-text-dim/15",
};

function I(node: ReactNode) {
  return node;
}

const DIRECTORY: TileGroup[] = [
  {
    label: "Router",
    subtitle: "Primary edge devices and NAT topology.",
    accent: ACCENT_PRIMARY,
    items: [
      {
        href: "/settings/router",
        title: "MikroTik",
        description: "RouterOS 7 REST API, primary router.",
        icon: I(<Router className="h-4 w-4" />),
        keywords: ["routeros", "primary router"],
      },
      {
        href: "/settings/pfsense",
        title: "pfSense",
        description: "Legacy CE 2.7 firewall over SSH.",
        icon: I(<ShieldCheck className="h-4 w-4" />),
        keywords: ["router", "firewall", "legacy migration"],
      },
      {
        href: "/settings/xiaomi-mesh",
        title: "Xiaomi mesh",
        description: "Mesh hub firmware and bridge controls.",
        icon: I(<Wifi className="h-4 w-4" />),
      },
    ],
  },
  {
    label: "DNS · networking",
    subtitle: "Resolver, blocklists, security, tunnels.",
    accent: ACCENT_CYAN,
    items: [
      {
        href: "/settings/dns",
        title: "Unbound DNS",
        description: "Local DNS A records via unbound-control.",
        icon: I(<Server className="h-4 w-4" />),
      },
      {
        href: "/settings/dns-blocklists",
        title: "DNS blocklists",
        description: "Block ads and trackers via curated lists.",
        icon: I(<ShieldBan className="h-4 w-4" />),
      },
      {
        href: "/settings/dns-security",
        title: "DNS security",
        description: "DNSSEC validation and DNS-over-TLS upstream.",
        icon: I(<ShieldCheck className="h-4 w-4" />),
      },
      {
        href: "/caddy",
        title: "Caddy",
        description: "Reverse proxy routes and automatic TLS.",
        icon: I(<Globe className="h-4 w-4" />),
      },
      {
        href: "/settings/cloudflare-tunnel",
        title: "Cloudflare tunnel",
        description: "Expose services to the edge without ports.",
        icon: I(<Globe className="h-4 w-4" />),
      },
      {
        href: "/settings/tailscale",
        title: "Tailscale",
        description: "WireGuard mesh VPN for remote access.",
        icon: I(<Network className="h-4 w-4" />),
      },
    ],
  },
  {
    label: "Security · operator",
    subtitle: "Authentication, audit trail, role assignments.",
    accent: ACCENT_VIOLET,
    items: [
      {
        href: "/settings/users",
        title: "Users",
        description: "Manage operators and role-based access.",
        icon: I(<Users className="h-4 w-4" />),
      },
      {
        href: "/settings/password",
        title: "Change password",
        description: "Update your login password.",
        icon: I(<Lock className="h-4 w-4" />),
      },
      {
        href: "/settings/audit-log",
        title: "Audit log",
        description: "Configuration change history.",
        icon: I(<FileText className="h-4 w-4" />),
      },
    ],
  },
  {
    label: "Fleet · telemetry",
    subtitle: "Scanners, retention, snapshots.",
    accent: ACCENT_EMERALD,
    items: [
      {
        href: "/settings/scanner",
        title: "Network scanner",
        description: "ARP, ping sweep, nmap, fingerprinting.",
        icon: I(<Radar className="h-4 w-4" />),
      },
      {
        href: "/settings/speedtest",
        title: "Speed test",
        description: "Automatic speed tests and retention.",
        icon: I(<Radar className="h-4 w-4" />),
      },
      {
        href: "/settings/retention",
        title: "Data retention",
        description: "Configure data retention and DB size.",
        icon: I(<Database className="h-4 w-4" />),
      },
      {
        href: "/settings/config-backup",
        title: "Config backup",
        description: "Router config archive snapshots.",
        icon: I(<HardDrive className="h-4 w-4" />),
      },
    ],
  },
  {
    label: "Notifications",
    subtitle: "Alert delivery channels and rules.",
    accent: ACCENT_AMBER,
    items: [
      {
        href: "/settings/alert-rules",
        title: "Alert rules",
        description: "Device offline, bandwidth, new device rules.",
        icon: I(<ShieldAlert className="h-4 w-4" />),
      },
      {
        href: "/settings/email",
        title: "Email · SMTP",
        description: "SMTP delivery for alert emails.",
        icon: I(<Mail className="h-4 w-4" />),
      },
      {
        href: "/settings/webhook",
        title: "Webhooks",
        description: "POST alerts to Discord, Slack, ntfy, custom URL.",
        icon: I(<Bell className="h-4 w-4" />),
      },
      {
        href: "/settings/snmp",
        title: "SNMP",
        description: "SNMP scanning for managed routers.",
        icon: I(<Radio className="h-4 w-4" />),
      },
    ],
  },
  {
    label: "Advanced",
    subtitle: "Power-user toggles and experimental flags.",
    accent: ACCENT_MUTED,
    items: [
      {
        href: "/settings/advanced",
        title: "Advanced",
        description: "Legacy router visibility and debug toggles.",
        icon: I(<Settings2 className="h-4 w-4" />),
      },
    ],
  },
];

// Status pip + label styling per tone.
const PIP_CLASS: Record<Tone, string> = {
  connected: "bg-[#4ade80] shadow-[0_0_0_3px_rgba(74,222,128,0.18)]",
  enabled: "bg-mesh-accent shadow-[0_0_0_3px_rgba(56,189,248,0.18)]",
  disabled: "bg-mesh-text-mute",
  error: "bg-[#fb7185] shadow-[0_0_0_3px_rgba(244,63,94,0.18)]",
  neutral: "bg-mesh-text-mute",
};

const TONE_LABEL_CLASS: Record<Tone, string> = {
  connected: "text-[#4ade80]",
  enabled: "text-mesh-accent",
  disabled: "text-mesh-text-mute",
  error: "text-[#fb7185]",
  neutral: "text-mesh-text-dim",
};

// ── Utility / status mappers (preserved from previous landing) ──────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function routerDetail(settings: SettingsData | null) {
  if (!settings?.mikrotik_url) return "Add RouterOS URL";
  return settings.mikrotik_url.replace(/^https?:\/\//, "");
}

function pfsenseDetail(settings: SettingsData | null) {
  if (!settings?.pfsense_host) return "Add SSH host";
  return `${settings.pfsense_host}:${settings.pfsense_port ?? 22}`;
}

function getStatus(
  href: string,
  state: DirectoryState,
  loading: boolean,
): TileStatus {
  const { settings } = state;

  if (loading && !settings) {
    return { label: "Checking", tone: "neutral" };
  }

  switch (href) {
    case "/settings/router":
      if (!settings?.mikrotik_enabled) {
        return { label: "Disabled", detail: routerDetail(settings), tone: "disabled" };
      }
      if (state.mikrotik?.reachable) {
        return {
          label: "Connected",
          detail: state.mikrotik.version
            ? `RouterOS ${state.mikrotik.version}`
            : routerDetail(settings),
          tone: "connected",
        };
      }
      return {
        label: state.mikrotik?.configured === false ? "Unconfigured" : "Enabled",
        detail: routerDetail(settings),
        tone: state.mikrotik?.configured === false ? "disabled" : "enabled",
      };
    case "/settings/pfsense":
      if (!settings?.pfsense_enabled) {
        return { label: "Disabled", detail: pfsenseDetail(settings), tone: "disabled" };
      }
      if (state.pfsense?.reachable) {
        return {
          label: "Connected",
          detail: state.pfsense.hostname ?? state.pfsense.version ?? pfsenseDetail(settings),
          tone: "connected",
        };
      }
      return {
        label: state.pfsense?.configured === false ? "Unconfigured" : "Enabled",
        detail: pfsenseDetail(settings),
        tone: state.pfsense?.configured === false ? "disabled" : "enabled",
      };
    case "/settings/xiaomi-mesh":
      return settings?.xiaomi_mesh_enabled
        ? { label: "Enabled", detail: settings.xiaomi_mesh_ip ?? "IP pending", tone: "enabled" }
        : { label: "Disabled", detail: settings?.xiaomi_mesh_ip ?? "Add mesh IP", tone: "disabled" };
    case "/settings/dns":
      return settings?.unbound_control_path
        ? { label: "Configured", detail: settings.unbound_control_path, tone: "enabled" }
        : { label: "Unconfigured", detail: "Add unbound-control path", tone: "disabled" };
    case "/caddy":
      if (state.caddy?.reachable) return { label: "Connected", detail: "Admin API reachable", tone: "connected" };
      if (state.caddy?.configured) return { label: "Error", detail: "Admin API unreachable", tone: "error" };
      return { label: "Unconfigured", detail: settings?.caddy_admin_url ?? "Add admin URL", tone: "disabled" };
    case "/settings/cloudflare-tunnel": {
      const configured = Boolean(
        settings?.cloudflare_api_token_set &&
          settings.cloudflare_account_id &&
          settings.cloudflare_tunnel_id,
      );
      if (state.cloudflare?.connected) {
        return {
          label: "Connected",
          detail: state.cloudflare.tunnel_name ?? state.cloudflare.tunnel_id ?? "Tunnel active",
          tone: "connected",
        };
      }
      if (configured) return { label: "Configured", detail: "Tunnel credentials saved", tone: "enabled" };
      return { label: "Unconfigured", detail: "Add token, account, and tunnel ID", tone: "disabled" };
    }
    case "/settings/webhook":
      return settings?.webhook_url
        ? { label: "Configured", detail: settings.webhook_url, tone: "enabled" }
        : { label: "Unconfigured", detail: "Add delivery URL", tone: "disabled" };
    case "/settings/email":
      return settings?.smtp_host && settings.smtp_to_email
        ? { label: "Configured", detail: settings.smtp_to_email, tone: "enabled" }
        : { label: "Unconfigured", detail: "Add SMTP host and recipient", tone: "disabled" };
    case "/settings/snmp":
      return settings?.snmp_community
        ? {
            label: "Configured",
            detail: `${settings.snmp_version ?? "v2c"}:${settings.snmp_port ?? 161}`,
            tone: "enabled",
          }
        : { label: "Unconfigured", detail: "Add community and target options", tone: "disabled" };
    case "/settings/alert-rules": {
      const count = state.alertRules?.length;
      const enabled = state.alertRules?.filter((rule) => rule.enabled).length;
      if (count == null)
        return { label: "Available", detail: "Rule state unavailable", tone: "neutral" };
      return count > 0
        ? {
            label: `${enabled} active`,
            detail: `${count} total rules`,
            tone: enabled ? "enabled" : "disabled",
          }
        : { label: "No rules", detail: "Create alert automation", tone: "disabled" };
    }
    case "/settings/scanner": {
      const sources = [
        settings?.ping_sweep_enabled && "ping",
        settings?.nmap_scan_enabled && "nmap",
        settings?.netbios_scan_enabled && "netbios",
        settings?.snmp_scan_enabled && "snmp",
        settings?.http_fingerprint_enabled && "http",
      ].filter(Boolean);
      return {
        label: sources.length > 0 ? "Enabled" : "Minimal",
        detail:
          sources.length > 0
            ? sources.join(", ")
            : `${settings?.scan_interval_seconds ?? 60}s interval`,
        tone: sources.length > 0 ? "enabled" : "neutral",
      };
    }
    case "/settings/speedtest":
      return settings?.speedtest_auto_interval_hours
        ? {
            label: "Scheduled",
            detail: `Every ${settings.speedtest_auto_interval_hours}h`,
            tone: "enabled",
          }
        : { label: "Manual", detail: "No automatic interval", tone: "neutral" };
    case "/settings/dns-blocklists":
      return state.dnsBlocklists
        ? {
            label: `${state.dnsBlocklists.enabled_blocklists} enabled`,
            detail: `${state.dnsBlocklists.total_blocklists} lists`,
            tone: state.dnsBlocklists.enabled_blocklists > 0 ? "enabled" : "disabled",
          }
        : { label: "Available", detail: "Blocklist state unavailable", tone: "neutral" };
    case "/settings/dns-security":
      return state.dnsSecurity?.dnssec_enabled || state.dnsSecurity?.dot_enabled
        ? {
            label: "Enabled",
            detail: [
              state.dnsSecurity?.dnssec_enabled && "DNSSEC",
              state.dnsSecurity?.dot_enabled && "DoT",
            ]
              .filter(Boolean)
              .join(" + "),
            tone: "enabled",
          }
        : { label: "Disabled", detail: "DNSSEC and DoT off", tone: "disabled" };
    case "/settings/retention":
      return {
        label: "Configured",
        detail: state.dbSize
          ? `DB ${formatBytes(state.dbSize.size_bytes)}`
          : `${settings?.retention_alerts_days ?? 30}d alerts`,
        tone: "neutral",
      };
    case "/settings/config-backup":
      return state.backups
        ? {
            label: `${state.backups.total} snapshots`,
            detail: "Router config archive",
            tone: state.backups.total > 0 ? "enabled" : "disabled",
          }
        : { label: "Available", detail: "Create router snapshots", tone: "neutral" };
    case "/settings/users": {
      const admins = state.users?.filter((user) => user.role === "admin").length;
      return state.users
        ? {
            label: `${state.users.length} users`,
            detail: `${admins ?? 0} admins`,
            tone: state.users.length > 0 ? "enabled" : "disabled",
          }
        : { label: "Available", detail: "User state unavailable", tone: "neutral" };
    }
    case "/settings/audit-log":
      return { label: "Live log", detail: "Configuration change history", tone: "neutral" };
    case "/settings/password":
      return { label: "Local auth", detail: "Update current password", tone: "neutral" };
    case "/settings/advanced":
      return {
        label: settings?.show_legacy_routers ? "Legacy visible" : "Default",
        detail: "Power-user controls",
        tone: settings?.show_legacy_routers ? "enabled" : "neutral",
      };
    case "/settings/tailscale":
      return {
        label: "Available",
        detail: "WireGuard mesh VPN",
        tone: "neutral",
      };
    default:
      return { label: "Available", tone: "neutral" };
  }
}

function tileMatches(item: TileItem, query: string) {
  if (!query) return true;
  const haystack = [item.title, item.description, item.href, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

// ── Component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<DirectoryState>(emptyState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDirectoryState() {
      setLoading(true);
      const [
        settings,
        mikrotik,
        pfsense,
        caddy,
        cloudflare,
        alertRules,
        users,
        dbSize,
        backups,
        dnsSecurity,
        dnsBlocklists,
      ] = await Promise.allSettled([
        fetchSettings(),
        fetchMikrotikStatus(),
        fetchPfsenseStatus(),
        fetchCaddyStatus(),
        fetchCloudflareTunnelStatus(),
        fetchAlertRules(),
        fetchUsers(),
        fetchDbSize(),
        fetchConfigBackups(1, 1),
        fetchDnsSecurity(),
        fetchDnsBlocklistStats(),
      ]);

      if (cancelled) return;

      setState({
        settings: settledValue(settings),
        mikrotik: settledValue(mikrotik),
        pfsense: settledValue(pfsense),
        caddy: settledValue(caddy),
        cloudflare: settledValue(cloudflare),
        alertRules: settledValue(alertRules),
        users: settledValue(users),
        dbSize: settledValue(dbSize),
        backups: settledValue(backups),
        dnsSecurity: settledValue(dnsSecurity),
        dnsBlocklists: settledValue(dnsBlocklists),
      });
      setLoading(false);
    }

    loadDirectoryState();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      DIRECTORY.map((group) => ({
        ...group,
        items: group.items.filter((item) => tileMatches(item, normalizedQuery)),
      })).filter((group) => group.items.length > 0),
    [normalizedQuery],
  );

  const totalItems = DIRECTORY.reduce((sum, g) => sum + g.items.length, 0);
  const attentionCount = useMemo(() => {
    let n = 0;
    for (const group of DIRECTORY) {
      for (const item of group.items) {
        const tone = getStatus(item.href, state, loading).tone;
        if (tone === "error" || tone === "disabled") n += 1;
      }
    }
    return n;
  }, [state, loading]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl py-6 sm:py-8" data-testid="settings-landing">
        {/* Header — eyebrow + title + sub-line */}
        <header className="flex flex-col gap-4 border-b border-mesh-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mesh-text-mute">
              Configuration
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Settings
            </h1>
            <p
              className="font-mono text-[11px] text-mesh-text-mute"
              data-testid="settings-summary"
            >
              {totalItems} items · {DIRECTORY.length} groups
              <span className="px-1.5 text-mesh-text-faint">·</span>
              {attentionCount} need attention
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mesh-text-mute" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              data-testid="settings-search"
              className="h-10 border-mesh-border bg-mesh-surface-1 pl-9 text-sm text-white placeholder:text-mesh-text-mute"
            />
          </div>
        </header>

        {/* Groups */}
        <div className="mt-7 space-y-8">
          {groups.length === 0 ? (
            <div
              className="border border-mesh-border bg-mesh-surface-1/70 px-4 py-8 text-center text-sm text-mesh-text-dim"
              data-testid="settings-empty"
            >
              No settings match this filter.
            </div>
          ) : (
            groups.map((group) => (
              <section
                key={group.label}
                className="space-y-3"
                data-testid={`settings-section-${group.label
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "")}`}
              >
                {/* Group header with accent stripe */}
                <div className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      "inline-block h-3 w-[3px] self-center",
                      group.accent.stripe,
                    )}
                    aria-hidden
                  />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                    {group.label}
                  </h2>
                  <span className="font-mono text-[11px] text-mesh-text-mute">
                    {group.items.length} items
                  </span>
                  {group.subtitle && (
                    <span className="ml-2 hidden text-xs text-mesh-text-mute md:inline">
                      {group.subtitle}
                    </span>
                  )}
                </div>

                {/* Tile grid */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => {
                    const status = getStatus(item.href, state, loading);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="group block h-full"
                        data-testid="settings-landing-card"
                        data-href={item.href}
                      >
                        <Card className="relative h-full overflow-hidden rounded border-mesh-border bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)] transition-colors group-hover:border-mesh-accent/40 group-hover:bg-mesh-surface-2/55">
                          {/* Status pip top-right */}
                          <span
                            className={cn(
                              "absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full",
                              PIP_CLASS[status.tone],
                            )}
                            aria-hidden
                          />

                          <CardContent className="flex h-full min-h-[7.25rem] flex-col gap-3 p-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1",
                                  group.accent.iconBg,
                                  group.accent.icon,
                                )}
                              >
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate pr-4 text-sm font-medium leading-5 text-white">
                                  {item.title}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-mesh-text-mute">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between gap-3 border-t border-mesh-border pt-2.5">
                              <span
                                className={cn(
                                  "font-mono text-[11px] font-medium",
                                  TONE_LABEL_CLASS[status.tone],
                                )}
                              >
                                {status.label}
                              </span>
                              {status.detail && (
                                <span className="min-w-0 truncate text-right font-mono text-[11px] text-mesh-text-mute">
                                  {status.detail}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Footer tip */}
        <footer
          className="mt-8 flex flex-col items-start justify-between gap-2 rounded border border-dashed border-mesh-border bg-mesh-surface-1/60 px-4 py-3 font-mono text-[11px] text-mesh-text-mute md:flex-row md:items-center"
          data-testid="settings-footer"
        >
          <span>
            Tip · use search above to quickly locate any integration or
            security control.
          </span>
          <span>{totalItems} items across {DIRECTORY.length} groups</span>
        </footer>
      </div>
    </PageTransition>
  );
}
