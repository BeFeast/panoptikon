"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Router,
  Globe,
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
  Settings2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/PageTransition";
import { fetchSettings } from "@/lib/api";
import { settingsNav } from "@/lib/settings-nav";

/** Map href → icon + iconBg for each settings item. */
const iconMap: Record<string, { icon: React.ReactNode; iconBg: string }> = {
  "/settings/router": {
    icon: <Router className="h-4 w-4 text-blue-400" />,
    iconBg: "bg-blue-500/10",
  },
  "/settings/xiaomi-mesh": {
    icon: <Wifi className="h-4 w-4 text-red-400" />,
    iconBg: "bg-red-500/10",
  },
  "/settings/dns": {
    icon: <Server className="h-4 w-4 text-teal-400" />,
    iconBg: "bg-teal-500/10",
  },
  "/settings/tailscale": {
    icon: <Network className="h-4 w-4 text-indigo-400" />,
    iconBg: "bg-indigo-500/10",
  },
  "/settings/webhook": {
    icon: <Bell className="h-4 w-4 text-purple-400" />,
    iconBg: "bg-purple-500/10",
  },
  "/settings/alert-rules": {
    icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,
    iconBg: "bg-amber-500/10",
  },
  "/settings/scanner": {
    icon: <Radar className="h-4 w-4 text-cyan-400" />,
    iconBg: "bg-cyan-500/10",
  },
  "/settings/speedtest": {
    icon: <Radar className="h-4 w-4 text-blue-400" />,
    iconBg: "bg-blue-500/10",
  },
  "/settings/dns-blocklists": {
    icon: <ShieldBan className="h-4 w-4 text-rose-400" />,
    iconBg: "bg-rose-500/10",
  },
  "/settings/retention": {
    icon: <Database className="h-4 w-4 text-amber-400" />,
    iconBg: "bg-amber-500/10",
  },
  "/settings/audit-log": {
    icon: <FileText className="h-4 w-4 text-indigo-400" />,
    iconBg: "bg-indigo-500/10",
  },
  "/settings/config-backup": {
    icon: <Database className="h-4 w-4 text-emerald-400" />,
    iconBg: "bg-emerald-500/10",
  },
  "/settings/password": {
    icon: <Lock className="h-4 w-4 text-blue-400" />,
    iconBg: "bg-blue-500/10",
  },
  "/settings/advanced": {
    icon: <Settings2 className="h-4 w-4 text-slate-400" />,
    iconBg: "bg-slate-500/10",
  },
  "/settings/npm": {
    icon: <Globe className="h-4 w-4 text-orange-400" />,
    iconBg: "bg-orange-500/10",
  },
};

const VYOS_ONLY_SETTINGS = new Set([
  "/settings/audit-log",
  "/settings/config-backup",
]);

export default function SettingsPage() {
  const [vyosConfigured, setVyosConfigured] = useState(false);
  const [legacyRoutersEnabled, setLegacyRoutersEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        setVyosConfigured(!!settings.vyos_url && settings.vyos_api_key_set);
        setLegacyRoutersEnabled(settings.show_legacy_routers);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-8 py-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>

        {settingsNav.map((group) => {
          const visibleItems = loaded
            ? group.items.filter(
                (item) =>
                  (legacyRoutersEnabled && vyosConfigured) ||
                  !VYOS_ONLY_SETTINGS.has(item.href)
              )
            : group.items;

          if (visibleItems.length === 0) return null;

          return (
            <section key={group.label} className="space-y-3">
              <div className="static">
                <h2 className="static text-xs font-medium uppercase tracking-wider text-slate-500">
                  {group.label}
                </h2>
                {group.subtitle && (
                  <p className="mt-1 text-xs text-slate-600">
                    {group.subtitle}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {visibleItems.map((item) => {
                  const visual = iconMap[item.href];
                  const description =
                    item.href === "/settings/router" &&
                    (!legacyRoutersEnabled || !vyosConfigured)
                      ? "Configure MikroTik router integration."
                      : item.description;

                  return (
                    <Link key={item.href} href={item.href} className="group">
                      <Card className="h-full border-slate-800 bg-slate-900 transition-colors group-hover:border-slate-700">
                        <CardContent className="flex items-center gap-3 py-3">
                          {visual && (
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${visual.iconBg}`}
                            >
                              {visual.icon}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">
                              {item.title}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {description}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PageTransition>
  );
}
