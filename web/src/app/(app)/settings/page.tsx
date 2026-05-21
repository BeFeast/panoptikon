"use client";

/**
 * Settings landing — literal port of `panopticon/project/settings.jsx`
 * (mesh direction).
 *
 * Port protocol (per design-export-to-ux runbook):
 *   1. The verbatim copy of settings.jsx lives at
 *      web/src/components/settings/_design-source/settings.jsx (commit N).
 *   2. This file is the adaptation layer (commit N+1):
 *        - <Icon name="X" size={N} /> swapped for lucide-react primitives;
 *        - mock SETTINGS_GROUPS data merged with real fetch hooks (the
 *          `description` / `meta` / `status` fields now resolve against
 *          live API state where available, otherwise fall back to the
 *          design-source string);
 *        - tile click → next/link navigation to existing /settings/*
 *          sub-routes;
 *        - shadcn-conflicting CSS vars (--border, --primary, --status-*)
 *          inlined as literal hex/rgba from tokens.css per runbook fallback.
 *
 * No re-layout. No re-spacing. No re-coloring. If a value looks off,
 * diff this file against _design-source/settings.jsx and fix the drift.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Cable,
  Eye,
  FileCode2,
  FileText,
  Globe,
  Lock,
  Network,
  Plug,
  Router as RouterIcon,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { ShortcutKey } from "@/components/ShortcutKey";
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

// ── Status tone vocabulary (matches design source) ──────────────────────

type Status = "online" | "warning" | "offline" | "inactive";

// Map literal hex values from tokens.css mesh direction:
//   --status-online:  #4ade80
//   --status-warning: #fbbf24
//   --status-offline: #fb7185
//   --text-mute:      #5d7799
// These are the runbook-mandated inline fallback when --status-* / --primary
// / --border would clash with shadcn HSL aliases.
const STATUS_COLOR: Record<Status, string> = {
  online: "#4ade80",
  warning: "#fbbf24",
  offline: "#fb7185",
  inactive: "#5d7799",
};

const STATUS_PIP_SHADOW: Record<Status, string> = {
  online: "0 0 0 2px rgba(74,222,128,0.18)",
  warning: "0 0 0 2px rgba(245,158,11,0.18)",
  offline: "0 0 0 2px rgba(244,63,94,0.18)",
  inactive: "0 0 0 0 rgba(0,0,0,0)",
};

// ── Settings IA (literal port of SETTINGS_GROUPS from settings.jsx) ─────
//
// Structure mirrors the design source 1:1. The `icon` slot holds the
// lucide-react JSX (replacement for <Icon name="X" size={N} stroke={1.6} />).
// `href` maps each tile to the existing /settings/* sub-route. `meta` and
// `desc` may be overridden at render time by the live-status mapper; if no
// live mapping exists, the design-source string ships verbatim.

type TileItem = {
  id: string;
  icon: ReactNode;
  name: string;
  desc: string;
  meta: string;
  status: Status;
  href: string;
};

type TileGroup = {
  label: string;
  accent: string;
  items: TileItem[];
};

function tileIcon(node: ReactNode) {
  return node;
}

const SETTINGS_GROUPS: TileGroup[] = [
  {
    label: "Router",
    // var(--primary) — shadcn conflict → literal #2563eb (tokens.css L175)
    accent: "#2563eb",
    items: [
      {
        id: "router-mikrotik",
        icon: tileIcon(<RouterIcon size={15} strokeWidth={1.6} />),
        name: "MikroTik",
        desc: "RouterOS 7 REST API, primary router",
        meta: "connected · v7.16",
        status: "online",
        href: "/settings/router",
      },
      {
        id: "router-pfsense",
        icon: tileIcon(<RouterIcon size={15} strokeWidth={1.6} />),
        name: "pfSense",
        desc: "CE 2.7 · backups every 6h",
        meta: "connected · drift 1",
        status: "warning",
        href: "/settings/pfsense",
      },
      {
        id: "router-xiaomi",
        icon: tileIcon(<RouterIcon size={15} strokeWidth={1.6} />),
        name: "Xiaomi",
        desc: "Mesh hub · firmware locked",
        meta: "connected · 2h",
        status: "online",
        href: "/settings/xiaomi-mesh",
      },
      {
        id: "nat",
        icon: tileIcon(<ArrowLeftRight size={15} strokeWidth={1.6} />),
        name: "NAT & port maps",
        desc: "14 active mappings · 3 reserved",
        meta: "14/512 used",
        status: "online",
        // No dedicated NAT sub-route — falls back to router admin.
        href: "/settings/router",
      },
      {
        id: "qos",
        icon: tileIcon(<Activity size={15} strokeWidth={1.6} />),
        name: "QoS classes",
        desc: "5 classes · 90% sustained capacity",
        meta: "5 classes",
        status: "warning",
        href: "/settings/router",
      },
      {
        id: "mesh-cfg",
        icon: tileIcon(<Network size={15} strokeWidth={1.6} />),
        name: "Wi-Fi mesh",
        desc: "3 APs · 802.11ax · 6GHz disabled",
        meta: "3 APs",
        status: "online",
        href: "/settings/xiaomi-mesh",
      },
    ],
  },
  {
    label: "DNS · networking",
    accent: "var(--accent-cyan)",
    items: [
      {
        id: "dns",
        icon: tileIcon(<Globe size={15} strokeWidth={1.6} />),
        name: "DNS resolver",
        desc: "unbound · 14ms p50 · 38ms p99",
        meta: "24k qps · 24h",
        status: "online",
        href: "/settings/dns",
      },
      {
        id: "dns-block",
        icon: tileIcon(<Globe size={15} strokeWidth={1.6} />),
        name: "Blocklists",
        desc: "5 lists · 1.2M domains · 11.8k blocks/24h",
        meta: "5 lists",
        status: "online",
        href: "/settings/dns-blocklists",
      },
      {
        id: "dns-security",
        icon: tileIcon(<Lock size={15} strokeWidth={1.6} />),
        name: "DNS security",
        desc: "DoT enforced · DoH allowed for trusted",
        meta: "enforced",
        status: "online",
        href: "/settings/dns-security",
      },
      {
        id: "ddns",
        icon: tileIcon(<Globe size={15} strokeWidth={1.6} />),
        name: "Dynamic DNS",
        desc: "Cloudflare · 2 records · 3min interval",
        meta: "2 records",
        status: "online",
        href: "/settings/cloudflare-tunnel",
      },
      {
        id: "tunnel",
        icon: tileIcon(<Cable size={15} strokeWidth={1.6} />),
        name: "Cloudflare tunnel",
        desc: "4 services exposed · ws-3 unreachable",
        meta: "4 routes",
        status: "warning",
        href: "/settings/cloudflare-tunnel",
      },
      {
        id: "caddy",
        icon: tileIcon(<ServerCog size={15} strokeWidth={1.6} />),
        name: "Caddy proxy",
        desc: "12 reverse-proxy routes · auto TLS",
        meta: "12 routes",
        status: "online",
        href: "/caddy",
      },
    ],
  },
  {
    label: "Certificates · security",
    accent: "var(--accent-violet)",
    items: [
      {
        id: "cert",
        icon: tileIcon(<ShieldCheck size={15} strokeWidth={1.6} />),
        name: "Certificates",
        desc: "4 active · 1 expiring in 6d",
        meta: "4 active",
        status: "warning",
        href: "/settings/dns-security",
      },
      {
        id: "password",
        icon: tileIcon(<Lock size={15} strokeWidth={1.6} />),
        name: "Operator auth",
        desc: "argon2id · TOTP recommended",
        meta: "TOTP off",
        status: "warning",
        href: "/settings/password",
      },
      {
        id: "audit",
        icon: tileIcon(<FileText size={15} strokeWidth={1.6} />),
        name: "Audit log",
        desc: "14d retention · 218 events · 24h",
        meta: "218 evt",
        status: "online",
        href: "/settings/audit-log",
      },
      {
        id: "sessions",
        icon: tileIcon(<Eye size={15} strokeWidth={1.6} />),
        name: "Active sessions",
        desc: "2 browser · 0 API tokens · 1 agent",
        meta: "3 active",
        status: "online",
        href: "/settings/users",
      },
    ],
  },
  {
    label: "Fleet · telemetry",
    // var(--status-online) — shadcn conflict → literal #4ade80
    accent: "#4ade80",
    items: [
      {
        id: "agents",
        icon: tileIcon(<UserIcon size={15} strokeWidth={1.6} />),
        name: "Agents",
        desc: "panopticon-agent 0.8.1 · 12 of 14 online",
        meta: "12/14",
        status: "warning",
        href: "/settings/scanner",
      },
      {
        id: "retention",
        icon: tileIcon(<FileText size={15} strokeWidth={1.6} />),
        name: "Data retention",
        desc: "metrics 14d · netflow 7d · audit 14d",
        meta: "auto",
        status: "online",
        href: "/settings/retention",
      },
      {
        id: "prometheus",
        icon: tileIcon(<Plug size={15} strokeWidth={1.6} />),
        name: "Prometheus export",
        desc: "/metrics public · 8 series · auto",
        meta: "enabled",
        status: "online",
        href: "/settings/snmp",
      },
      {
        id: "config-backup",
        icon: tileIcon(<FileCode2 size={15} strokeWidth={1.6} />),
        name: "Config backup",
        desc: "last · 14m ago · S3 + local snapshot",
        meta: "every 6h",
        status: "online",
        href: "/settings/config-backup",
      },
    ],
  },
  {
    label: "Notifications",
    // var(--status-warning) — shadcn conflict → literal #fbbf24
    accent: "#fbbf24",
    items: [
      {
        id: "alert-rules",
        icon: tileIcon(<AlertTriangle size={15} strokeWidth={1.6} />),
        name: "Alert rules",
        desc: "12 rules · 4 firing now",
        meta: "12 rules · 4 firing",
        status: "warning",
        href: "/settings/alert-rules",
      },
      {
        id: "email",
        icon: tileIcon(<Plug size={15} strokeWidth={1.6} />),
        name: "Email · SMTP",
        desc: "mail.lan · verified · last 14m",
        meta: "configured",
        status: "online",
        href: "/settings/email",
      },
      {
        id: "webhooks",
        icon: tileIcon(<Plug size={15} strokeWidth={1.6} />),
        name: "Webhooks",
        desc: "2 endpoints · Discord + ntfy",
        meta: "2 endpoints",
        status: "online",
        href: "/settings/webhook",
      },
    ],
  },
  {
    label: "Advanced",
    accent: "var(--text-mute)",
    items: [
      {
        id: "advanced",
        icon: tileIcon(<SlidersHorizontal size={15} strokeWidth={1.6} />),
        name: "Advanced",
        desc: "Show legacy routers · debug · experimental flags",
        meta: "3 experiments on",
        status: "inactive",
        href: "/settings/advanced",
      },
      {
        id: "about",
        icon: tileIcon(<FileCode2 size={15} strokeWidth={1.6} />),
        name: "About · build",
        desc: "v0.8.1 · build e7998f1 · MIT",
        meta: "up 14d 6h",
        status: "inactive",
        href: "/settings/advanced",
      },
    ],
  },
];

// ── Live data mappers (adaptation layer — preserves prior fetch behavior) ─

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

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * For each tile id, return live (desc, meta, status) when the corresponding
 * fetch resolved; otherwise return the design-source defaults verbatim.
 * The IA, layout, and tile copy from settings.jsx remain authoritative —
 * live data only replaces fields where the API actually has a value.
 */
function applyLive(item: TileItem, state: DirectoryState): TileItem {
  const { settings } = state;
  switch (item.id) {
    case "router-mikrotik": {
      if (!settings) return item;
      if (!settings.mikrotik_enabled) {
        return { ...item, desc: "RouterOS 7 REST API · disabled", meta: "disabled", status: "inactive" };
      }
      if (state.mikrotik?.reachable) {
        return {
          ...item,
          desc: `RouterOS ${state.mikrotik.version ?? "7"} · primary router`,
          meta: `connected · ${state.mikrotik.version ?? "v7"}`,
          status: "online",
        };
      }
      return { ...item, desc: "RouterOS 7 REST API · unreachable", meta: "unreachable", status: "warning" };
    }
    case "router-pfsense": {
      if (!settings) return item;
      if (!settings.pfsense_enabled) {
        return { ...item, desc: "CE 2.7 firewall · disabled", meta: "disabled", status: "inactive" };
      }
      if (state.pfsense?.reachable) {
        return {
          ...item,
          desc: `CE 2.7 · ${state.pfsense.hostname ?? settings.pfsense_host ?? "linked"}`,
          meta: `connected · ${state.pfsense.version ?? "2.7"}`,
          status: "online",
        };
      }
      return { ...item, desc: "CE 2.7 firewall · unreachable", meta: "unreachable", status: "warning" };
    }
    case "router-xiaomi": {
      if (!settings) return item;
      if (!settings.xiaomi_mesh_enabled) {
        return { ...item, desc: "Mesh hub · disabled", meta: "disabled", status: "inactive" };
      }
      return {
        ...item,
        desc: `Mesh hub · ${settings.xiaomi_mesh_ip ?? "ip pending"}`,
        meta: "connected",
        status: "online",
      };
    }
    case "dns": {
      if (!settings) return item;
      return settings.unbound_control_path
        ? { ...item, desc: `unbound · ${settings.unbound_control_path}`, meta: "configured", status: "online" }
        : { ...item, desc: "unbound · path not set", meta: "unconfigured", status: "warning" };
    }
    case "dns-block": {
      if (!state.dnsBlocklists) return item;
      return {
        ...item,
        desc: `${state.dnsBlocklists.total_blocklists} lists · ${state.dnsBlocklists.enabled_blocklists} enabled`,
        meta: `${state.dnsBlocklists.enabled_blocklists} enabled`,
        status: state.dnsBlocklists.enabled_blocklists > 0 ? "online" : "inactive",
      };
    }
    case "dns-security": {
      if (!state.dnsSecurity) return item;
      const parts = [
        state.dnsSecurity.dnssec_enabled && "DNSSEC",
        state.dnsSecurity.dot_enabled && "DoT",
      ].filter(Boolean);
      return parts.length > 0
        ? { ...item, desc: parts.join(" + ") + " enabled", meta: "enforced", status: "online" }
        : { ...item, desc: "DNSSEC and DoT off", meta: "off", status: "warning" };
    }
    case "tunnel": {
      if (!settings) return item;
      if (state.cloudflare?.connected) {
        return {
          ...item,
          desc: `${state.cloudflare.tunnel_name ?? state.cloudflare.tunnel_id ?? "tunnel"} · active`,
          meta: "connected",
          status: "online",
        };
      }
      const configured = Boolean(
        settings.cloudflare_api_token_set &&
          settings.cloudflare_account_id &&
          settings.cloudflare_tunnel_id,
      );
      return configured
        ? { ...item, desc: "credentials saved · tunnel inactive", meta: "configured", status: "warning" }
        : { ...item, desc: "Add token, account, tunnel id", meta: "unconfigured", status: "inactive" };
    }
    case "caddy": {
      if (state.caddy?.reachable) {
        return { ...item, desc: "Admin API reachable · auto TLS", meta: "connected", status: "online" };
      }
      if (state.caddy?.configured) {
        return { ...item, desc: "Admin API unreachable", meta: "error", status: "offline" };
      }
      return { ...item, desc: "Admin URL not set", meta: "unconfigured", status: "inactive" };
    }
    case "alert-rules": {
      if (!state.alertRules) return item;
      const total = state.alertRules.length;
      const enabled = state.alertRules.filter((rule) => rule.enabled).length;
      return {
        ...item,
        desc: `${total} rules · ${enabled} active`,
        meta: `${total} rules · ${enabled} active`,
        status: enabled > 0 ? "online" : total > 0 ? "warning" : "inactive",
      };
    }
    case "email": {
      if (!settings) return item;
      return settings.smtp_host && settings.smtp_to_email
        ? { ...item, desc: `${settings.smtp_host} · ${settings.smtp_to_email}`, meta: "configured", status: "online" }
        : { ...item, desc: "Add SMTP host and recipient", meta: "unconfigured", status: "warning" };
    }
    case "webhooks": {
      if (!settings) return item;
      return settings.webhook_url
        ? { ...item, desc: settings.webhook_url, meta: "1 endpoint", status: "online" }
        : { ...item, desc: "Add delivery URL", meta: "unconfigured", status: "warning" };
    }
    case "sessions": {
      if (!state.users) return item;
      const admins = state.users.filter((u) => u.role === "admin").length;
      return {
        ...item,
        desc: `${state.users.length} users · ${admins} admins`,
        meta: `${state.users.length} active`,
        status: "online",
      };
    }
    case "retention": {
      if (!state.dbSize && !settings) return item;
      const dbDesc = state.dbSize ? `DB ${formatBytes(state.dbSize.size_bytes)}` : "";
      const retentionDesc = settings ? `metrics ${settings.retention_alerts_days ?? 30}d` : "";
      return {
        ...item,
        desc: [retentionDesc, dbDesc].filter(Boolean).join(" · ") || item.desc,
        meta: "auto",
        status: "online",
      };
    }
    case "config-backup": {
      if (!state.backups) return item;
      return {
        ...item,
        desc: `${state.backups.total} snapshots stored`,
        meta: `${state.backups.total} snapshots`,
        status: state.backups.total > 0 ? "online" : "warning",
      };
    }
    case "advanced": {
      if (!settings) return item;
      return settings.show_legacy_routers
        ? { ...item, desc: "Legacy routers visible · debug toggles", meta: "legacy on", status: "warning" }
        : item;
    }
    default:
      return item;
  }
}

// ── Tile (literal port of SettingsTile from settings.jsx) ───────────────

function SettingsTile({ item, accent }: { item: TileItem; accent: string }) {
  const statusColor = STATUS_COLOR[item.status];
  const pipShadow = STATUS_PIP_SHADOW[item.status];

  return (
    <Link
      href={item.href}
      className="mesh-card block"
      style={{
        padding: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        position: "relative",
        textDecoration: "none",
        color: "inherit",
      }}
      data-testid="settings-tile"
      data-tile-id={item.id}
    >
      {/* Status pip top-right (settings.jsx L83-90) */}
      {item.status !== "inactive" && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: statusColor,
            boxShadow: pipShadow,
          }}
        />
      )}

      {/* Icon box (settings.jsx L92-103) */}
      <div
        style={{
          flex: "0 0 32px",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2)",
          // var(--border) → literal #2563eb-clear rgba per token table
          border: "var(--hairline) solid rgba(96,144,212,0.20)",
          borderRadius: "var(--radius-sm)",
          color: accent,
        }}
      >
        {item.icon}
      </div>

      {/* Text column (settings.jsx L105-111) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              font: "600 13px var(--font-sans)",
              color: "var(--text)",
            }}
          >
            {item.name}
          </span>
        </div>
        <div
          className="t-small"
          style={{
            color: "var(--text-dim)",
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          {item.desc}
        </div>
        <div
          className="mono"
          style={{
            font: "500 10.5px var(--font-mono)",
            color: "var(--text-mute)",
          }}
        >
          {item.meta}
        </div>
      </div>
    </Link>
  );
}

// ── Quick filter pill (literal port of settings.jsx L146-165) ───────────

type QuickFilter = {
  label: string;
  count: number;
  color?: string;
};

function QuickFilterPill({ filter }: { filter: QuickFilter }) {
  const borderColor = filter.color ?? "rgba(96,144,212,0.20)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        background: "var(--surface-2)",
        border: `var(--hairline) solid ${borderColor}`,
        borderRadius: "var(--radius-sm)",
        font: "500 11px var(--font-sans)",
        color: filter.color ?? "var(--text-dim)",
        cursor: "pointer",
      }}
    >
      {filter.label}
      <span className="mono" style={{ fontSize: 10, color: "var(--text-mute)" }}>
        {filter.count}
      </span>
    </span>
  );
}

// ── Page (literal port of Settings() from settings.jsx) ─────────────────

export default function SettingsPage() {
  const [state, setState] = useState<DirectoryState>(emptyState);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve each tile against live data once per state change.
  const groups = useMemo(
    () =>
      SETTINGS_GROUPS.map((g) => ({
        ...g,
        items: g.items.map((it) => applyLive(it, state)),
      })),
    [state],
  );

  // Header counters (literal port of L122-126).
  const totalItems = SETTINGS_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
  const needsAttention = useMemo(() => {
    let n = 0;
    for (const g of groups) {
      for (const it of g.items) {
        if (it.status === "warning" || it.status === "offline") n += 1;
      }
    }
    return n;
  }, [groups]);

  // Quick filters (literal port of L146-150). Counts derived from live state
  // so the badge stays honest after status mappers run.
  const filters: QuickFilter[] = useMemo(() => {
    let attention = 0;
    let connected = 0;
    for (const g of groups) {
      for (const it of g.items) {
        if (it.status === "warning" || it.status === "offline") attention += 1;
        if (it.status === "online") connected += 1;
      }
    }
    return [
      { label: "Needs attention", count: attention, color: "#fbbf24" },
      // var(--accent-cyan) for "Recently changed" — keep the token; mesh
      // resolves it to #38bdf8, but we use the var to stay consistent
      // with the design source.
      { label: "Recently changed", count: 3, color: "var(--accent-cyan)" },
      { label: "Connected services", count: connected },
      { label: "Experimental", count: 3 },
    ];
  }, [groups]);

  const containerStyle: CSSProperties = {
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };

  return (
    <PageTransition>
      <div style={containerStyle} data-testid="settings-landing">
        {/* Header — literal port of settings.jsx L119-132 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div className="t-micro">Configuration</div>
            <h1 className="t-display" style={{ margin: "4px 0 6px" }}>
              Settings
            </h1>
            <div
              className="t-small mono"
              style={{ color: "var(--text-mute)" }}
              data-testid="settings-summary"
            >
              {totalItems} items · {SETTINGS_GROUPS.length} groups{" "}
              <span style={{ color: "var(--text-faint)" }}>·</span>{" "}
              {needsAttention} need attention
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/settings/audit-log" className="btn" style={{ textDecoration: "none" }}>
              <FileText size={12} />
              <span>Open audit log</span>
            </Link>
            <Link href="/settings/config-backup" className="btn" style={{ textDecoration: "none" }}>
              <FileCode2 size={12} />
              <span>Export config</span>
            </Link>
          </div>
        </div>

        {/* Search card — literal port of settings.jsx L135-167 */}
        <div className="mesh-card" style={{ padding: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
            }}
          >
            <Search size={14} color="var(--text-mute)" />
            <input
              placeholder="search settings · e.g. 'expiring cert' 'dns' 'backup'"
              aria-label="Search settings"
              data-testid="settings-search"
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text)",
                font: "400 13px var(--font-sans)",
              }}
            />
            <kbd
              className="mono"
              style={{
                font: "500 10px var(--font-mono)",
                color: "var(--text-mute)",
                padding: "1px 5px",
                background: "var(--surface-2)",
                borderRadius: 3,
                // var(--border) → literal rgba per token table
                border: "var(--hairline) solid rgba(96,144,212,0.20)",
              }}
            >
              <ShortcutKey actionKey="k" />
            </kbd>
          </div>
          <div
            style={{
              // var(--border) → literal rgba per token table
              borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span className="t-micro">Quick filters</span>
            {filters.map((f) => (
              <QuickFilterPill key={f.label} filter={f} />
            ))}
          </div>
        </div>

        {/* Groups — literal port of settings.jsx L170-181 */}
        {groups.map((g) => (
          <div
            key={g.label}
            data-testid={`settings-section-${g.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "")}`}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 12,
                  background: g.accent,
                  alignSelf: "center",
                }}
              />
              <h3 className="t-h3" style={{ margin: 0 }}>
                {g.label}
              </h3>
              <span
                className="mono"
                style={{
                  font: "500 11px var(--font-mono)",
                  color: "var(--text-mute)",
                }}
              >
                {g.items.length} items
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
              className="settings-tile-grid"
            >
              {g.items.map((it) => (
                <SettingsTile key={it.id} item={it} accent={g.accent} />
              ))}
            </div>
          </div>
        ))}

        {/* Footer — literal port of settings.jsx L184-196 */}
        <div
          data-testid="settings-footer"
          style={{
            marginTop: 6,
            padding: "12px 14px",
            background: "var(--surface-1)",
            // var(--border) → literal rgba per token table; design uses dashed
            border: "var(--hairline) dashed rgba(96,144,212,0.20)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            font: "400 11px var(--font-mono)",
            color: "var(--text-mute)",
          }}
        >
          <span>
            Tip · <ShortcutKey actionKey="k" /> from anywhere to search across settings, devices, alerts,
            and runbooks.
          </span>
          <span>
            Last config change · 14m ago by{" "}
            <span style={{ color: "var(--text)" }}>operator</span>
          </span>
        </div>
      </div>
    </PageTransition>
  );
}
