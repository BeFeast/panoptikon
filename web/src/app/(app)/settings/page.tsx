"use client";

import Link from "next/link";
import {
  Router,
  Globe,
  Shield,
  ShieldBan,
  Radar,
  Bell,
  Database,
  FileText,
  Lock,
  ChevronRight,
  ShieldAlert,
  Server,
  Wifi,
  Network,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";

interface SettingsItem {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
}

interface SettingsGroup {
  label: string;
  subtitle?: string;
  items: SettingsItem[];
}

const settingsGroups: SettingsGroup[] = [
  {
    label: "Integrations",
    items: [
      {
        href: "/settings/router",
        icon: <Router className="h-4 w-4 text-blue-400" />,
        iconBg: "bg-blue-500/10",
        title: "Router",
        description: "Configure MikroTik or VyOS router integration.",
      },
      {
        href: "/settings/xiaomi-mesh",
        icon: <Wifi className="h-4 w-4 text-red-400" />,
        iconBg: "bg-red-500/10",
        title: "Xiaomi Mesh",
        description: "Configure Xiaomi mesh router integration.",
      },
      {
        href: "/settings/caddy",
        icon: <Shield className="h-4 w-4 text-emerald-400" />,
        iconBg: "bg-emerald-500/10",
        title: "Caddy Reverse Proxy",
        description: "Primary reverse proxy — manage hosts via Caddy.",
      },
      {
        href: "/settings/dns",
        icon: <Server className="h-4 w-4 text-teal-400" />,
        iconBg: "bg-teal-500/10",
        title: "Unbound DNS",
        description: "Manage local DNS A records via Unbound.",
      },
      {
        href: "/settings/tailscale",
        icon: <Network className="h-4 w-4 text-indigo-400" />,
        iconBg: "bg-indigo-500/10",
        title: "Tailscale",
        description: "Secure remote access via WireGuard mesh VPN.",
      },
      {
        href: "/settings/webhook",
        icon: <Bell className="h-4 w-4 text-purple-400" />,
        iconBg: "bg-purple-500/10",
        title: "Webhook Notifications",
        description: "POST alerts to Discord, Slack, ntfy.sh, or any URL.",
      },
      {
        href: "/settings/alert-rules",
        icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,
        iconBg: "bg-amber-500/10",
        title: "Alert Rules",
        description: "Configure rules for device offline, bandwidth, and new devices.",
      },
    ],
  },
  {
    label: "Network",
    items: [
      {
        href: "/settings/scanner",
        icon: <Radar className="h-4 w-4 text-cyan-400" />,
        iconBg: "bg-cyan-500/10",
        title: "Network Scanner",
        description: "Configure ARP scanning, subnets, and ping sweep.",
      },
      {
        href: "/settings/speedtest",
        icon: <Radar className="h-4 w-4 text-blue-400" />,
        iconBg: "bg-blue-500/10",
        title: "Speed Test",
        description: "Configure automatic speed tests and retention.",
      },
      {
        href: "/settings/dns-blocklists",
        icon: <ShieldBan className="h-4 w-4 text-rose-400" />,
        iconBg: "bg-rose-500/10",
        title: "DNS Blocklists",
        description: "Block ads and trackers via DNS blocklists.",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/settings/retention",
        icon: <Database className="h-4 w-4 text-amber-400" />,
        iconBg: "bg-amber-500/10",
        title: "Data Retention",
        description: "Configure data retention and manage database size.",
      },
      {
        href: "/settings/audit-log",
        icon: <FileText className="h-4 w-4 text-indigo-400" />,
        iconBg: "bg-indigo-500/10",
        title: "Audit Log",
        description: "View all VyOS configuration changes made via Panoptikon.",
      },
      {
        href: "/settings/config-backup",
        icon: <Database className="h-4 w-4 text-emerald-400" />,
        iconBg: "bg-emerald-500/10",
        title: "Config Backup",
        description: "Download, snapshot, and restore VyOS router configurations.",
      },
      {
        href: "/settings/password",
        icon: <Lock className="h-4 w-4 text-blue-400" />,
        iconBg: "bg-blue-500/10",
        title: "Change Password",
        description: "Update your login password.",
      },
    ],
  },
  {
    label: "Legacy / Optional",
    subtitle: "Use Caddy for new deployments.",
    items: [
      {
        href: "/settings/npm",
        icon: <Globe className="h-4 w-4 text-orange-400" />,
        iconBg: "bg-orange-500/10",
        title: "Nginx Proxy Manager",
        description: "Legacy reverse proxy — consider migrating to Caddy.",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>

        {settingsGroups.map((group) => (
          <section key={group.label} className="space-y-3">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {group.label}
              </h2>
              {group.subtitle && (
                <p className="mt-1 text-xs text-slate-600">
                  {group.subtitle}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="group">
                  <Card className="h-full border-slate-800 bg-slate-900 transition-colors group-hover:border-slate-700">
                    <CardContent className="flex items-center gap-3 py-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.iconBg}`}
                      >
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageTransition>
  );
}
