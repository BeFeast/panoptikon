"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Globe,
  LayoutDashboard,
  MonitorSmartphone,
  Network,
  Router,
  Server,
  Settings,
  Shield,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWsConnected } from "@/components/providers/WebSocketProvider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: MonitorSmartphone },
  { href: "/agents", label: "Agents", icon: Cpu },
  { href: "/assets", label: "Assets", icon: Box },
  { href: "/ssh-hosts", label: "SSH Hosts", icon: Server },
  { href: "/router", label: "Router", icon: Router },
  { href: "/npm", label: "NPM", icon: Globe },
  { href: "/services", label: "Services", icon: Workflow },
  { href: "/topology", label: "Topology", icon: Network },
  { href: "/traffic", label: "Traffic", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/certificates", label: "Certificates", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** NPM connectivity state: null = not configured, true = reachable, false = unreachable. */
function useNpmStatus(): null | boolean {
  const [status, setStatus] = useState<null | boolean>(null);

  const poll = useCallback(() => {
    fetch("/api/v1/npm/status", { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data || !data.configured) {
          setStatus(null);
        } else {
          setStatus(data.reachable === true);
        }
      })
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, [poll]);

  return status;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const wsConnected = useWsConnected();
  const npmStatus = useNpmStatus();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-slate-800 px-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 text-sm font-bold text-white">
            P
          </div>
          {!collapsed && (
            <span className="ml-2 text-lg font-semibold text-white">
              Panoptikon
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-500/10 text-blue-500"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors",
                  collapsed && "justify-center px-0"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="border-slate-800 bg-slate-900">
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href}>{linkContent}</div>;
          })}
        </nav>

        {/* Collapse toggle + version */}
        <div className="border-t border-slate-800 p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-800/60 hover:text-slate-400"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
          {!collapsed ? (
            <div className="mt-1 flex items-center gap-1.5 px-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      wsConnected
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                        : "bg-slate-600"
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="border-slate-800 bg-slate-900">
                  <p>{wsConnected ? "Live — connected" : "Disconnected"}</p>
                </TooltipContent>
              </Tooltip>
              {npmStatus !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        npmStatus
                          ? "bg-orange-400 ring-2 ring-orange-400/30"
                          : "bg-rose-500 ring-2 ring-rose-500/30"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="border-slate-800 bg-slate-900">
                    <p>{npmStatus ? "NPM — connected" : "NPM — unreachable"}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <p className="text-[10px] text-slate-700">Panoptikon {process.env.NEXT_PUBLIC_VERSION || "v0.1.0"}</p>
            </div>
          ) : (
            <div className="mt-1 flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      wsConnected
                        ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                        : "bg-slate-600"
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="right" className="border-slate-800 bg-slate-900">
                  <p>{wsConnected ? "Live — connected" : "Disconnected"}</p>
                </TooltipContent>
              </Tooltip>
              {npmStatus !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        npmStatus
                          ? "bg-orange-400 ring-2 ring-orange-400/30"
                          : "bg-rose-500 ring-2 ring-rose-500/30"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="border-slate-800 bg-slate-900">
                    <p>{npmStatus ? "NPM — connected" : "NPM — unreachable"}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
