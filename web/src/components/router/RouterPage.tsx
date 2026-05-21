"use client";

/**
 * RouterPage — literal TSX port of
 *   /tmp/panopticon-design/panopticon/project/router-page.jsx
 *
 * Pinned verbatim copy lives at
 *   web/src/components/router/_design-source/router-page.jsx
 *
 * Allowed adaptations (Source Code Port Protocol):
 *   - JSX → TSX (type-only changes).
 *   - `<Icon name="filter|plus|log|service|check|chevron-right|pin" />`
 *     → lucide-react equivalents at the same `size`.
 *   - Mock arrays INTERFACES / FW_RULES / DHCP_LEASES + scalar header
 *     metrics replaced by props so per-vendor pages can wire real
 *     fetch hooks (fetchMikrotikStatus / fetchPfsenseStatus / ...).
 *   - `gen()` sparkline RNG retained as the design's data fallback when
 *     a vendor API does not expose history yet — clearly marked.
 *
 * Token substitutions (per task brief):
 *   var(--border)         → rgba(96,144,212,0.20)
 *   var(--primary)        → #2563eb
 *   var(--status-online)  → #4ade80
 *   var(--status-offline) → #fb7185
 *   var(--status-warning) → #fbbf24
 *   var(--status-info)    → #38bdf8
 *   Other --X stay as-is.
 */

import { type CSSProperties, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Filter,
  Pin,
  Plus,
  ServerCog,
} from "lucide-react";
import { Spark } from "@/components/mesh/Spark";
import {
  RouterHeader,
  type RouterHeaderAction,
  type RouterHeaderMeta,
} from "@/components/router/RouterHeader";
import { RouterTabs, type RouterTab } from "@/components/router/RouterTabs";
import type { LucideIcon } from "lucide-react";

// ── Reproducible sparkline noise (router-header.jsx line 4). Used only
//    where a vendor API does not yet expose history data. Same algorithm as
//    the design source so visual fidelity is preserved.
export function gen(n: number, b: number, v: number): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    a.push(
      Math.max(
        0,
        b + Math.sin(i / 3) * v * 0.5 + (Math.random() - 0.5) * v,
      ),
    );
  }
  return a;
}

// ── Inline helpers ported byte-exact from router-page.jsx lines 3-39 ──────

const TYPE_BADGE: Record<string, [label: string, color: string]> = {
  ethernet: ["ether", "#4ade80"],
  bridge: ["bridge", "var(--accent-cyan)"],
  vlan: ["vlan", "var(--accent-violet)"],
  wireguard: ["wg", "#fbbf24"],
};

export function ifaceTypeBadge(t: string): ReactNode {
  const m = TYPE_BADGE[t] ?? [t, "var(--text-mute)"];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-2)",
        border: "var(--hairline) solid rgba(96,144,212,0.20)",
        color: m[1],
        font: "500 10px var(--font-mono)",
      }}
    >
      {m[0]}
    </span>
  );
}

const ACTION_COLOR: Record<string, string> = {
  accept: "#4ade80",
  drop: "#fb7185",
  fasttrack: "var(--accent-cyan)",
  log: "#fbbf24",
  reject: "#fb7185",
  pass: "#4ade80", // pfSense terminology — same visual as accept
  block: "#fb7185", // pfSense terminology — same visual as drop
};

export function actionBadge(a: string): ReactNode {
  const color = ACTION_COLOR[a] ?? "var(--text-mute)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "var(--radius-sm)",
        background: `${color}1F`,
        color,
        font: "500 10px var(--font-mono)",
        border: "var(--hairline) solid transparent",
      }}
    >
      {a}
    </span>
  );
}

// ── Public prop shapes ────────────────────────────────────────────────────

export type RouterStatRow = {
  k: string;
  v: string;
  u: string;
  spark: number[];
  color: string;
};

export type RouterInterfaceRow = {
  name: string;
  type: string;
  running: boolean;
  ip: string;
  role: string;
  mac: string;
  mtu: string;
  rx: number; // GB total
  tx: number; // GB total
};

export type RouterFirewallRow = {
  idx: number;
  chain: string;
  action: string;
  src: string;
  dst: string;
  comment: string;
  hits: string;
  enabled: boolean;
};

export type RouterDhcpRow = {
  ip: string;
  mac: string;
  name: string;
  exp: string;
  server: string;
  static: boolean;
};

export type RouterPageProps = {
  // Header inputs (forwarded straight to <RouterHeader />)
  headerTitle: string;
  headerConnected: boolean;
  headerIcon?: LucideIcon;
  headerIconColor?: string;
  headerStatusLabel?: string;
  headerMeta?: RouterHeaderMeta[];
  headerActions?: RouterHeaderAction[];

  // 6-up stat row
  stats: RouterStatRow[];

  // Tabs strip (active tab managed by caller)
  tabs: RouterTab[];
  activeTab: string;
  onTabChange?: (id: string) => void;

  // Interfaces panel
  interfaces: RouterInterfaceRow[];
  interfacesTotalsLabel?: string; // e.g. "9 total · 8 running · 1 down"
  onAddInterface?: () => void;
  onFilterInterface?: () => void;

  // Firewall panel (omit to hide the panel — e.g. Xiaomi)
  firewall?: {
    rules: RouterFirewallRow[];
    label?: string; // e.g. "9 rules · 2 disabled · drag to reorder"
    onAdd?: () => void;
  };

  // DHCP panel (omit to hide)
  dhcp?: {
    leases: RouterDhcpRow[];
    label?: string; // e.g. "6 · 3 static"
    onFilter?: () => void;
  };

  /**
   * Custom content rendered between the tab bar and the footer.
   * When provided, REPLACES the default Interfaces / Firewall / DHCP panels —
   * letting vendor wrappers swap panel content per active tab (e.g. pfSense
   * hash subroutes).
   */
  tabPanels?: ReactNode;

  // Quick actions footer (omit to hide)
  footer?: {
    snapshotLabel?: string; // "Config snapshot · 14m ago"
    driftLabel?: string; // "drift since last apply · 1 rule"
    actions?: RouterHeaderAction[];
  };
};

// ── Layout ────────────────────────────────────────────────────────────────

const PAGE_STYLE: CSSProperties = {
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const STATS_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const IFACE_GRID =
  "60px 1.4fr 60px 1.2fr 1.4fr 60px 80px 80px 90px 28px";

const IFACE_HEADER_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: IFACE_GRID,
  padding: "8px 14px",
  font: "600 9.5px var(--font-sans)",
  letterSpacing: "0.08em",
  color: "var(--text-mute)",
  textTransform: "uppercase",
  borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
  borderBottom: "var(--hairline) solid rgba(96,144,212,0.20)",
};

const FW_GRID =
  "22px 30px 70px 70px 1fr 1fr 1.4fr 60px";

const DHCP_GRID = "90px 1fr 70px 22px";

export function RouterPage(props: RouterPageProps) {
  const {
    headerTitle,
    headerConnected,
    headerIcon,
    headerIconColor,
    headerStatusLabel,
    headerMeta,
    headerActions,
    stats,
    tabs,
    activeTab,
    onTabChange,
    interfaces,
    interfacesTotalsLabel,
    onAddInterface,
    onFilterInterface,
    firewall,
    dhcp,
    tabPanels,
    footer,
  } = props;

  return (
    <div style={PAGE_STYLE} data-testid="router-page">
      <RouterHeader
        title={headerTitle}
        connected={headerConnected}
        icon={headerIcon}
        iconColor={headerIconColor}
        statusLabel={headerStatusLabel}
        meta={headerMeta}
        actions={headerActions}
      />

      {/* Stat row — router-page.jsx lines 48-69 */}
      <div style={STATS_GRID}>
        {stats.map((m) => (
          <div key={m.k} className="card" style={{ padding: 14 }}>
            <div className="t-micro">{m.k}</div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 5,
                marginTop: 4,
              }}
            >
              <span
                className="mono"
                style={{
                  font: "600 22px var(--font-mono)",
                  color: m.color,
                  lineHeight: 1,
                }}
              >
                {m.v}
              </span>
              <span
                className="t-small mono"
                style={{ color: "var(--text-mute)" }}
              >
                {m.u}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              <Spark
                data={m.spark}
                width={180}
                height={26}
                color={m.color}
              />
            </div>
          </div>
        ))}
      </div>

      <RouterTabs tabs={tabs} active={activeTab} onChange={onTabChange} />

      {tabPanels !== undefined ? (
        tabPanels
      ) : (
        <>
          <RouterInterfacesPanel
            interfaces={interfaces}
            interfacesTotalsLabel={interfacesTotalsLabel}
            onAddInterface={onAddInterface}
            onFilterInterface={onFilterInterface}
          />
          {(firewall || dhcp) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: firewall && dhcp ? "1.4fr 1fr" : "1fr",
                gap: 12,
              }}
            >
              {firewall && <RouterFirewallPanel firewall={firewall} />}
              {dhcp && <RouterDhcpPanel dhcp={dhcp} />}
            </div>
          )}
        </>
      )}

      {/* Quick actions footer — router-page.jsx lines 203-216 */}
      {footer && (
        <div
          className="card"
          style={{
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            className="t-small"
            style={{ color: "var(--text-dim)" }}
          >
            {footer.snapshotLabel}
            {footer.driftLabel && (
              <>
                <span
                  style={{
                    color: "var(--text-faint)",
                    margin: "0 8px",
                  }}
                >
                  ·
                </span>
                {footer.driftLabel}
              </>
            )}
          </div>
          {footer.actions && footer.actions.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {footer.actions.map((a) => {
                const Icon = a.icon;
                const className = a.primary
                  ? "btn btn-sm btn-primary"
                  : "btn btn-sm";
                return (
                  <button
                    key={a.label}
                    type="button"
                    className={className}
                    onClick={a.onClick}
                  >
                    <Icon size={11} />
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Default footer actions matching router-page.jsx lines 207-212. */
export const DEFAULT_ROUTER_FOOTER_ACTIONS: RouterHeaderAction[] = [
  { label: "Diff against snapshot", icon: FileText },
  { label: "Export .rsc", icon: ServerCog },
  { label: "Apply staged changes", icon: Check, primary: true },
];

// ── Panel components ──────────────────────────────────────────────────────
// Extracted so vendor wrappers can compose them per active tab (e.g. pfSense
// hash subroutes). The default RouterPage layout uses them together.

export type RouterInterfacesPanelProps = {
  interfaces: RouterInterfaceRow[];
  interfacesTotalsLabel?: string;
  onAddInterface?: () => void;
  onFilterInterface?: () => void;
};

export function RouterInterfacesPanel({
  interfaces,
  interfacesTotalsLabel,
  onAddInterface,
  onFilterInterface,
}: RouterInterfacesPanelProps) {
  return (
    <div className="card" style={{ padding: 0 }} data-testid="router-panel-interfaces">
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h3 className="t-h3">Interfaces</h3>
          {interfacesTotalsLabel && (
            <span
              className="mono"
              style={{
                font: "500 11px var(--font-mono)",
                color: "var(--text-mute)",
              }}
            >
              {interfacesTotalsLabel}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onFilterInterface}
          >
            <Filter size={11} />
            <span>Type · all</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onAddInterface}
          >
            <Plus size={11} />
            <span>Add</span>
          </button>
        </div>
      </div>
      <div style={IFACE_HEADER_STYLE}>
        <span>State</span>
        <span>Interface</span>
        <span>Type</span>
        <span>IP / role</span>
        <span>MAC</span>
        <span>MTU</span>
        <span style={{ textAlign: "right" }}>RX GB</span>
        <span style={{ textAlign: "right" }}>TX GB</span>
        <span>24h</span>
        <span />
      </div>
      {interfaces.map((it, i) => (
        <div
          key={it.name}
          style={{
            display: "grid",
            gridTemplateColumns: IFACE_GRID,
            padding: "8px 14px",
            alignItems: "center",
            borderBottom:
              i < interfaces.length - 1
                ? "var(--hairline) solid rgba(96,144,212,0.20)"
                : "none",
            background: !it.running
              ? "rgba(251,113,133,0.03)"
              : "transparent",
            font: "400 12.5px var(--font-sans)",
          }}
        >
          <span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                font: "600 9px var(--font-sans)",
                letterSpacing: "0.06em",
                padding: "1px 6px",
                borderRadius: 2,
                background: it.running
                  ? "rgba(74,222,128,0.10)"
                  : "var(--surface-2)",
                color: it.running ? "#4ade80" : "var(--text-mute)",
                border: `var(--hairline) solid ${
                  it.running
                    ? "rgba(74,222,128,0.30)"
                    : "rgba(96,144,212,0.20)"
                }`,
              }}
            >
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  background: it.running ? "#4ade80" : "#fb7185",
                }}
              />
              {it.running ? "UP" : "DOWN"}
            </span>
          </span>
          <span
            className="mono"
            style={{ color: "var(--text)", fontWeight: 500 }}
          >
            {it.name}
          </span>
          <span>{ifaceTypeBadge(it.type)}</span>
          <span style={{ minWidth: 0 }}>
            <div
              className="mono"
              style={{ color: "var(--text-dim)", fontSize: 11.5 }}
            >
              {it.ip}
            </div>
            {it.role !== "—" && it.role !== "" && (
              <div
                style={{
                  font: "500 10px var(--font-sans)",
                  color: "var(--accent-cyan)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {it.role}
              </div>
            )}
          </span>
          <span
            className="mono"
            style={{ color: "var(--text-mute)", fontSize: 11 }}
          >
            {it.mac}
          </span>
          <span
            className="mono"
            style={{ color: "var(--text-mute)", fontSize: 11 }}
          >
            {it.mtu}
          </span>
          <span
            className="mono"
            style={{ textAlign: "right", color: "var(--text)" }}
          >
            {it.rx.toFixed(1)}
          </span>
          <span
            className="mono"
            style={{ textAlign: "right", color: "var(--text-dim)" }}
          >
            {it.tx.toFixed(1)}
          </span>
          <span>
            <Spark
              data={gen(20, 30 + it.rx / 5, 18)}
              width={70}
              height={20}
              color={it.running ? "#38bdf8" : "var(--text-mute)"}
            />
          </span>
          <span
            style={{
              color: "var(--text-mute)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <ChevronRight size={12} />
          </span>
        </div>
      ))}
    </div>
  );
}

export type RouterFirewallPanelProps = {
  firewall: NonNullable<RouterPageProps["firewall"]>;
};

export function RouterFirewallPanel({ firewall }: RouterFirewallPanelProps) {
  return (
    <div className="card" style={{ padding: 0 }} data-testid="router-panel-firewall">
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h3 className="t-h3">Firewall rules</h3>
          {firewall.label && (
            <span
              className="mono"
              style={{
                font: "500 11px var(--font-mono)",
                color: "var(--text-mute)",
              }}
            >
              {firewall.label}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={firewall.onAdd}
        >
          <Plus size={11} />
          <span>New rule</span>
        </button>
      </div>
      <div
        style={{
          borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        {firewall.rules.map((r, i) => (
          <div
            key={`${r.idx}-${r.chain}-${r.src}-${r.dst}`}
            style={{
              display: "grid",
              gridTemplateColumns: FW_GRID,
              padding: "7px 14px",
              alignItems: "center",
              gap: 8,
              borderBottom:
                i < firewall.rules.length - 1
                  ? "var(--hairline) solid rgba(96,144,212,0.20)"
                  : "none",
              font: "400 12px var(--font-sans)",
              opacity: r.enabled ? 1 : 0.55,
            }}
          >
            <span style={{ color: "var(--text-faint)", cursor: "grab" }}>
              ⋮⋮
            </span>
            <span
              className="mono"
              style={{ color: "var(--text-mute)", fontSize: 11 }}
            >
              {r.idx}
            </span>
            <span
              style={{
                font: "500 10.5px var(--font-mono)",
                color: "var(--text-dim)",
              }}
            >
              {r.chain}
            </span>
            <span>{actionBadge(r.action)}</span>
            <span
              className="mono"
              style={{ color: "var(--text-dim)", fontSize: 11 }}
            >
              {r.src}
            </span>
            <span
              className="mono"
              style={{ color: "var(--text-dim)", fontSize: 11 }}
            >
              {r.dst}
            </span>
            <span
              style={{
                color: "var(--text-mute)",
                fontSize: 11.5,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.comment}
            </span>
            <span
              className="mono"
              style={{
                textAlign: "right",
                color:
                  r.action === "fasttrack" || r.action === "accept"
                    ? "var(--text)"
                    : "#fbbf24",
                fontSize: 11,
              }}
            >
              {r.hits}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type RouterDhcpPanelProps = {
  dhcp: NonNullable<RouterPageProps["dhcp"]>;
};

export function RouterDhcpPanel({ dhcp }: RouterDhcpPanelProps) {
  return (
    <div className="card" style={{ padding: 0 }} data-testid="router-panel-dhcp">
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h3 className="t-h3">DHCP leases</h3>
          {dhcp.label && (
            <span
              className="mono"
              style={{
                font: "500 11px var(--font-mono)",
                color: "var(--text-mute)",
              }}
            >
              {dhcp.label}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={dhcp.onFilter}
        >
          <Filter size={11} />
        </button>
      </div>
      <div
        style={{
          borderTop: "var(--hairline) solid rgba(96,144,212,0.20)",
        }}
      >
        {dhcp.leases.map((l, i) => (
          <div
            key={`${l.ip}-${l.mac}`}
            style={{
              display: "grid",
              gridTemplateColumns: DHCP_GRID,
              padding: "8px 14px",
              alignItems: "center",
              gap: 6,
              borderBottom:
                i < dhcp.leases.length - 1
                  ? "var(--hairline) solid rgba(96,144,212,0.20)"
                  : "none",
              font: "400 12px var(--font-sans)",
            }}
          >
            <span
              className="mono"
              style={{ color: "var(--text)", fontSize: 11.5 }}
            >
              {l.ip}
            </span>
            <span style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "var(--text)",
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                {l.name}
              </div>
              <div
                className="mono"
                style={{ color: "var(--text-mute)", fontSize: 10 }}
              >
                {l.mac} · {l.server}
              </div>
            </span>
            <span
              className="mono"
              style={{
                color: l.static ? "var(--accent-cyan)" : "var(--text-mute)",
                fontSize: 11,
                textAlign: "right",
              }}
            >
              {l.static ? "static" : l.exp}
            </span>
            <span style={{ color: "var(--text-mute)" }}>
              {l.static ? <Pin size={11} /> : <Plus size={11} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
