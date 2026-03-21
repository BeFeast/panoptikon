"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Human-friendly labels for known route segments */
const LABELS: Record<string, string> = {
  settings: "Settings",
  devices: "Devices",
  agents: "Agents",
  alerts: "Alerts",
  assets: "Assets",
  "ssh-hosts": "SSH Hosts",
  topology: "Topology",
  traffic: "Traffic",
  services: "Services",
  "vpn-status": "VPN Status",
  "dns-logs": "DNS Logs",
  "dns-queries": "DNS Queries",
  dashboard: "Dashboard",
  certificates: "Certificates",
  "cloudflare-tunnel": "Cloudflare Tunnel",
  caddy: "Caddy",
  ddns: "DDNS",
  mesh: "Mesh",
  nat: "NAT",
  npm: "Nginx Proxy Manager",
  qos: "QoS",
  router: "Router",
  xiaomi: "Xiaomi",
  // Settings sub-pages
  advanced: "Advanced",
  "alert-rules": "Alert Rules",
  "audit-log": "Audit Log",
  "config-backup": "Config Backup",
  dns: "DNS",
  "dns-blocklists": "DNS Blocklists",
  password: "Password",
  retention: "Retention",
  scanner: "Scanner",
  speedtest: "Speedtest",
  tailscale: "Tailscale",
  webhook: "Webhook",
  "xiaomi-mesh": "Xiaomi Mesh",
};

function labelFor(segment: string): string {
  return LABELS[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Only show breadcrumbs when depth > 1
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
  }));

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-slate-800/50 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-500 animate-in slide-in-from-top-1 duration-200 md:px-6"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
            {isLast ? (
              <span className="text-slate-300">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="transition-colors hover:text-slate-300"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
