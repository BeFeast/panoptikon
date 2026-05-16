"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Readable labels for URL segments. Falls back to title-cased slug. */
const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  assets: "Assets",
  topology: "Topology",
  mesh: "Mesh",
  traffic: "Traffic",
  router: "Router",
  mikrotik: "MikroTik",
  pfsense: "pfSense",
  caddy: "Caddy",
  services: "Services",
  nat: "NAT",
  qos: "QoS",
  "vpn-status": "VPN Status",
  ddns: "DDNS",
  "dns-logs": "DNS Logs",
  "dns-queries": "DNS Queries",
  alerts: "Alerts",
  certificates: "Certificates",
  agents: "Agents",
  "ssh-hosts": "SSH Hosts",
  "cloudflare-tunnel": "CF Tunnel",
  settings: "Settings",
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
  npm: "NPM",
  xiaomi: "Xiaomi",
};

function labelFor(segment: string): string {
  return (
    segmentLabels[segment] ??
    segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function Breadcrumbs() {
  const pathname = usePathname();

  // Split path into segments, filter empty strings
  const segments = pathname.split("/").filter(Boolean);

  // Only show when depth > 1 (e.g. /settings/scanner)
  if (segments.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-slate-900/80 bg-slate-950/35 px-3 py-1.5 text-xs text-slate-500 animate-in slide-in-from-left-2 fade-in duration-300 md:px-5"
    >
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;

        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-slate-600" />
            )}
            {isLast ? (
              <span className="text-slate-300 font-medium">
                {labelFor(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className="transition-colors hover:text-slate-300"
              >
                {labelFor(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
