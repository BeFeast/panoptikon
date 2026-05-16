"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { navGroups, useGroupCollapse, useServerVersion } from "./Sidebar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWsConnected } from "@/components/providers/WebSocketProvider";

export function MobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wsConnected = useWsConnected();
  const serverVersion = useServerVersion();
  const { collapsed: groupCollapsed, toggle: toggleGroup } = useGroupCollapse(
    navGroups,
    pathname,
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-800/70 text-slate-400 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-white md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex h-full w-72 flex-col border-slate-800 bg-slate-950 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {/* Logo */}
          <div className="flex h-14 shrink-0 items-center border-b border-slate-800 px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/40 bg-cyan-500 text-sm font-bold text-slate-950">
              P
            </div>
            <span className="ml-2 text-lg font-semibold text-white">
              Panoptikon
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-2">
            {navGroups.map((group) => {
              const isCollapsed = groupCollapsed[group.key] ?? false;
              const hasActive = group.items.some((i) =>
                pathname?.startsWith(i.href),
              );

              return (
                <div key={group.key} className="mb-1">
                  <div
                    className={cn(
                      "flex w-full items-center gap-1 px-3 py-1.5",
                      group.key !== "network" && "mt-3 border-t border-slate-800/70 pt-2",
                    )}
                  >
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors text-slate-500 hover:bg-slate-800/60 hover:text-slate-300"
                      aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.label}`}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform duration-200",
                          isCollapsed && "-rotate-90",
                        )}
                      />
                    </button>
                    <span
                      className={cn(
                        "cursor-default select-none text-[11px] font-semibold uppercase tracking-wider",
                        hasActive ? "text-cyan-400" : "text-slate-500",
                      )}
                    >
                      {group.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "grid transition-all duration-200",
                      isCollapsed
                        ? "grid-rows-[0fr] opacity-0"
                        : "grid-rows-[1fr] opacity-100",
                    )}
                  >
                    <div className="overflow-hidden">
                      {group.items.map((item) => {
                        const active = pathname?.startsWith(item.href);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "group/nav relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                              active
                                ? "bg-cyan-500/10 text-cyan-500"
                                : "text-slate-400 hover:bg-slate-800/60 hover:text-white",
                            )}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600" />
                            )}
                            <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover/nav:scale-105" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Settings — pinned after groups */}
            <div className="mt-1 border-t border-slate-800/50 pt-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={cn(
                  "group/nav relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                  pathname?.startsWith("/settings")
                    ? "bg-cyan-500/10 text-cyan-500"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white",
                )}
              >
                {pathname?.startsWith("/settings") && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600" />
                )}
                <Settings className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover/nav:scale-105" />
                <span>Settings</span>
              </Link>
            </div>
          </nav>

          {/* Status */}
          <div className="shrink-0 border-t border-slate-800/50 p-3">
            <div className="flex items-center gap-1.5 px-2">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  wsConnected
                    ? "bg-emerald-400 ring-2 ring-emerald-400/30 status-glow-online"
                    : "bg-slate-600"
                )}
              />
              <span className="text-xs text-slate-500">
                {wsConnected ? "Live" : "Disconnected"}
              </span>
              <p className="ml-auto font-mono text-[10px] tabular-nums text-slate-600">
                Panoptikon {serverVersion ?? "..."}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
