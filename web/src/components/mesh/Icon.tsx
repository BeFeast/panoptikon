import {
  type LucideIcon,
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Bell,
  Bot,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Cog,
  Command,
  Container,
  Cpu,
  Eye,
  FileText,
  Filter,
  Gauge,
  Globe,
  LayoutDashboard,
  Lock,
  Menu,
  Network,
  Pin,
  Plus,
  PlugZap,
  RefreshCw,
  Router,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Wifi,
  X,
} from "lucide-react";

/**
 * Canonical icon names used across mesh-direction surfaces.
 *
 * The source design (`atoms.jsx`) uses Symbols Nerd Font codepoints for some
 * glyphs and hand-rolled SVGs for the rest. In production we lean on
 * `lucide-react` — the closest semantic match is chosen for each name so the
 * mapping stays a single source of truth and call sites stay short:
 *
 *     <Icon name="dashboard" />
 */
export type IconName =
  | "dashboard"
  | "alert"
  | "log"
  | "device"
  | "tag"
  | "mesh"
  | "qos"
  | "nat"
  | "router"
  | "dns"
  | "globe"
  | "cert"
  | "caddy"
  | "tunnel"
  | "service"
  | "agent"
  | "search"
  | "chevron-right"
  | "chevron-down"
  | "refresh"
  | "bell"
  | "settings"
  | "filter"
  | "plus"
  | "cmd"
  | "arrow-up"
  | "arrow-down"
  | "wifi"
  | "ethernet"
  | "lock"
  | "eye"
  | "pin"
  | "menu"
  | "check"
  | "x"
  | "sliders"
  | "plug";

const ICON_MAP: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  alert: AlertTriangle,
  log: FileText,
  device: Cpu,
  tag: Tag,
  mesh: Network,
  qos: Gauge,
  nat: ArrowRightLeft,
  router: Router,
  dns: Globe,
  globe: Globe,
  cert: ShieldCheck,
  caddy: Server,
  tunnel: Container,
  service: Server,
  agent: Bot,
  search: Search,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  refresh: RefreshCw,
  bell: Bell,
  settings: Settings,
  filter: Filter,
  plus: Plus,
  cmd: Command,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  wifi: Wifi,
  ethernet: Cable,
  lock: Lock,
  eye: Eye,
  pin: Pin,
  menu: Menu,
  check: Check,
  x: X,
  sliders: SlidersHorizontal,
  plug: PlugZap,
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Stroke colour. Defaults to `currentColor` so callers can drive it via CSS. */
  color?: string;
  /** Stroke width — matches the source default (1.5). */
  stroke?: number;
  className?: string;
}

/**
 * Icon — central glyph mapping for mesh surfaces.
 *
 * Wraps a single `lucide-react` icon per canonical name. Use this instead of
 * importing icons directly so the visual vocabulary stays consistent across
 * routes (and is easy to swap if we ever change the icon set).
 *
 * @example
 * <Icon name="dashboard" size={16} />
 * <Icon name="alert" color="hsl(var(--status-warning))" />
 */
export function Icon({
  name,
  size = 14,
  color = "currentColor",
  stroke = 1.5,
  className,
}: IconProps) {
  const Glyph = ICON_MAP[name];
  return (
    <Glyph
      width={size}
      height={size}
      color={color}
      strokeWidth={stroke}
      className={className}
      aria-hidden="true"
    />
  );
}

export { ICON_MAP };
