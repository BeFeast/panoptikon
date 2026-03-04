"use client";

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
  "/settings/cloudflare-tunnel": {
    icon: <Globe className="h-4 w-4 text-orange-400" />,
    iconBg: "bg-orange-500/10",
  },
};

function getItemLayoutClass(index: number, total: number) {
  const classes = ["group", "block", "h-full"];

  // Tablet/medium widths (2 columns): avoid a left-floating orphan card.
  if (total % 2 === 1 && index === total - 1) {
    classes.push("sm:col-span-2", "xl:col-span-1");
  }

  // Wide desktop (3 columns): center a single orphan card in the last row.
  if (total % 3 === 1 && index === total - 1) {
    classes.push("xl:col-start-2");
  }

  return classes.join(" ");
}

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl py-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>

        <div className="mt-8 space-y-8">
          {settingsNav.map((group) => {
            const visibleItems = group.items;

            if (visibleItems.length === 0) return null;

            return (
              <section key={group.label} className="space-y-4">
                <div className="min-h-[2.75rem] space-y-1">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {group.label}
                  </h2>
                  <p
                    className={`text-xs leading-5 text-slate-500 ${
                      group.subtitle ? "" : "invisible"
                    }`}
                    aria-hidden={!group.subtitle}
                  >
                    {group.subtitle ?? "\u00A0"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleItems.map((item, index) => {
                    const visual = iconMap[item.href];

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={getItemLayoutClass(index, visibleItems.length)}
                      >
                        <Card className="h-full border-slate-800 bg-slate-900 transition-colors group-hover:border-slate-700">
                          <CardContent className="flex h-full min-h-[5.75rem] items-start gap-3 p-4">
                            {visual && (
                              <div
                                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${visual.iconBg}`}
                              >
                                {visual.icon}
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-medium leading-5 text-white">
                                {item.title}
                              </p>
                              <p className="line-clamp-2 text-xs leading-5 text-slate-500">
                                {item.description}
                              </p>
                            </div>

                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
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
      </div>
    </PageTransition>
  );
}
