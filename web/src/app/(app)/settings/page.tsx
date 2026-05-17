"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronRight,
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
import { settingsNav, type SettingsNavItem } from "@/lib/settings-nav";
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

const iconMap: Record<string, { icon: ReactNode; iconBg: string }> = {
  "/settings/router": {
    icon: <Router className="h-4 w-4 text-cyan-300" />,
    iconBg: "bg-cyan-500/10 ring-cyan-400/20",
  },
  "/settings/pfsense": {
    icon: <ShieldCheck className="h-4 w-4 text-sky-300" />,
    iconBg: "bg-sky-500/10 ring-sky-400/20",
  },
  "/settings/xiaomi-mesh": {
    icon: <Wifi className="h-4 w-4 text-rose-300" />,
    iconBg: "bg-rose-500/10 ring-rose-400/20",
  },
  "/settings/dns": {
    icon: <Server className="h-4 w-4 text-teal-300" />,
    iconBg: "bg-teal-500/10 ring-teal-400/20",
  },
  "/caddy": {
    icon: <Globe className="h-4 w-4 text-blue-300" />,
    iconBg: "bg-blue-500/10 ring-blue-400/20",
  },
  "/settings/cloudflare-tunnel": {
    icon: <Globe className="h-4 w-4 text-orange-300" />,
    iconBg: "bg-orange-500/10 ring-orange-400/20",
  },
  "/settings/tailscale": {
    icon: <Network className="h-4 w-4 text-indigo-300" />,
    iconBg: "bg-indigo-500/10 ring-indigo-400/20",
  },
  "/settings/webhook": {
    icon: <Bell className="h-4 w-4 text-violet-300" />,
    iconBg: "bg-violet-500/10 ring-violet-400/20",
  },
  "/settings/email": {
    icon: <Mail className="h-4 w-4 text-emerald-300" />,
    iconBg: "bg-emerald-500/10 ring-emerald-400/20",
  },
  "/settings/snmp": {
    icon: <Radio className="h-4 w-4 text-amber-300" />,
    iconBg: "bg-amber-500/10 ring-amber-400/20",
  },
  "/settings/alert-rules": {
    icon: <ShieldAlert className="h-4 w-4 text-amber-300" />,
    iconBg: "bg-amber-500/10 ring-amber-400/20",
  },
  "/settings/scanner": {
    icon: <Radar className="h-4 w-4 text-cyan-300" />,
    iconBg: "bg-cyan-500/10 ring-cyan-400/20",
  },
  "/settings/speedtest": {
    icon: <Radar className="h-4 w-4 text-blue-300" />,
    iconBg: "bg-blue-500/10 ring-blue-400/20",
  },
  "/settings/dns-blocklists": {
    icon: <ShieldBan className="h-4 w-4 text-rose-300" />,
    iconBg: "bg-rose-500/10 ring-rose-400/20",
  },
  "/settings/dns-security": {
    icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />,
    iconBg: "bg-emerald-500/10 ring-emerald-400/20",
  },
  "/settings/retention": {
    icon: <Database className="h-4 w-4 text-amber-300" />,
    iconBg: "bg-amber-500/10 ring-amber-400/20",
  },
  "/settings/audit-log": {
    icon: <FileText className="h-4 w-4 text-indigo-300" />,
    iconBg: "bg-indigo-500/10 ring-indigo-400/20",
  },
  "/settings/config-backup": {
    icon: <HardDrive className="h-4 w-4 text-emerald-300" />,
    iconBg: "bg-emerald-500/10 ring-emerald-400/20",
  },
  "/settings/users": {
    icon: <Users className="h-4 w-4 text-blue-300" />,
    iconBg: "bg-blue-500/10 ring-blue-400/20",
  },
  "/settings/password": {
    icon: <Lock className="h-4 w-4 text-slate-300" />,
    iconBg: "bg-slate-500/10 ring-slate-400/20",
  },
  "/settings/advanced": {
    icon: <Settings2 className="h-4 w-4 text-slate-300" />,
    iconBg: "bg-slate-500/10 ring-slate-400/20",
  },
};

const toneClass: Record<Tone, string> = {
  connected: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  enabled: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  disabled: "border-mesh-border-strong bg-mesh-surface-1/95 text-slate-400",
  error: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  neutral: "border-mesh-border-strong bg-mesh-surface-1/95 text-slate-300",
};

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
          detail: state.mikrotik.version ? `RouterOS ${state.mikrotik.version}` : routerDetail(settings),
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
        ? { label: "Configured", detail: `${settings.snmp_version ?? "v2c"}:${settings.snmp_port ?? 161}`, tone: "enabled" }
        : { label: "Unconfigured", detail: "Add community and target options", tone: "disabled" };
    case "/settings/alert-rules": {
      const count = state.alertRules?.length;
      const enabled = state.alertRules?.filter((rule) => rule.enabled).length;
      if (count == null) return { label: "Available", detail: "Rule state unavailable", tone: "neutral" };
      return count > 0
        ? { label: `${enabled} active`, detail: `${count} total rules`, tone: enabled ? "enabled" : "disabled" }
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
        detail: sources.length > 0 ? sources.join(", ") : `${settings?.scan_interval_seconds ?? 60}s interval`,
        tone: sources.length > 0 ? "enabled" : "neutral",
      };
    }
    case "/settings/speedtest":
      return settings?.speedtest_auto_interval_hours
        ? { label: "Scheduled", detail: `Every ${settings.speedtest_auto_interval_hours}h`, tone: "enabled" }
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
            detail: [state.dnsSecurity?.dnssec_enabled && "DNSSEC", state.dnsSecurity?.dot_enabled && "DoT"]
              .filter(Boolean)
              .join(" + "),
            tone: "enabled",
          }
        : { label: "Disabled", detail: "DNSSEC and DoT off", tone: "disabled" };
    case "/settings/retention":
      return {
        label: "Configured",
        detail: state.dbSize ? `DB ${formatBytes(state.dbSize.size_bytes)}` : `${settings?.retention_alerts_days ?? 30}d alerts`,
        tone: "neutral",
      };
    case "/settings/config-backup":
      return state.backups
        ? { label: `${state.backups.total} snapshots`, detail: "Router config archive", tone: state.backups.total > 0 ? "enabled" : "disabled" }
        : { label: "Available", detail: "Create router snapshots", tone: "neutral" };
    case "/settings/users": {
      const admins = state.users?.filter((user) => user.role === "admin").length;
      return state.users
        ? { label: `${state.users.length} users`, detail: `${admins ?? 0} admins`, tone: state.users.length > 0 ? "enabled" : "disabled" }
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
    default:
      return { label: "Available", tone: "neutral" };
  }
}

function itemMatches(item: SettingsNavItem, query: string) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.description,
    item.href,
    ...(item.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

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
      settingsNav
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => itemMatches(item, normalizedQuery)),
        }))
        .filter((group) => group.items.length > 0),
    [normalizedQuery],
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl py-6 sm:py-8">
        <div className="flex flex-col gap-4 border-b border-mesh-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Configure router clients, network services, security controls, and operator access.
            </p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter settings"
              aria-label="Filter settings"
              className="h-10 border-mesh-border-strong bg-mesh-surface-1 pl-9 text-sm text-white placeholder:text-mesh-text-mute"
            />
          </div>
        </div>

        <div className="mt-7 space-y-8">
          {groups.length === 0 ? (
            <div className="border border-mesh-border-strong bg-mesh-surface-1/70 px-4 py-8 text-center text-sm text-slate-400">
              No settings match this filter.
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex min-h-10 flex-col justify-end gap-1">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {group.label}
                  </h2>
                  {group.subtitle && (
                    <p className="text-xs leading-5 text-slate-500">{group.subtitle}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => {
                    const visual = iconMap[item.href];
                    const status = getStatus(item.href, state, loading);

                    return (
                      <Link key={item.href} href={item.href} className="group block h-full">
                        <Card className="h-full overflow-hidden rounded border-mesh-border-strong bg-mesh-surface-1/95 shadow-[0_18px_40px_-28px_rgba(56,189,248,0.45)] transition-colors group-hover:border-mesh-accent/40 group-hover:bg-mesh-surface-2/55">
                          <CardContent className="flex h-full min-h-[7.25rem] flex-col gap-4 p-4">
                            <div className="flex items-start gap-3">
                              {visual && (
                                <div
                                  className={cn(
                                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1",
                                    visual.iconBg,
                                  )}
                                >
                                  {visual.icon}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="truncate text-sm font-medium leading-5 text-white">
                                    {item.title}
                                  </p>
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-cyan-300" />
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between gap-3 border-t border-mesh-border pt-3">
                              <span
                                className={cn(
                                  "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium",
                                  toneClass[status.tone],
                                )}
                              >
                                {status.label}
                              </span>
                              {status.detail && (
                                <span className="min-w-0 truncate text-right font-mono text-[11px] text-slate-500">
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
      </div>
    </PageTransition>
  );
}
