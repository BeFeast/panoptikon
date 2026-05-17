"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, navGroups, useGroupCollapse, useServerVersion } from "./Sidebar";
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
        className="flex h-9 w-9 items-center justify-center rounded-md text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white transition-colors md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex h-full w-72 flex-col border-mesh-border-strong bg-mesh-bg/95 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {/* Logo */}
          <div className="flex h-14 shrink-0 items-center border-b border-mesh-border-strong px-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-mesh-accent/40 bg-mesh-accent/12 text-sm font-bold text-mesh-accent">
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
                isNavItemActive(pathname, i),
              );

              return (
                <div key={group.key} className="mb-1">
                  <div
                    className={cn(
                      "flex w-full items-center gap-1 px-3 py-1.5",
                      group.key !== "network" && "mt-3 border-t border-dotted border-mesh-border-strong pt-2",
                    )}
                  >
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors text-mesh-text-mute hover:bg-mesh-surface-2/55 hover:text-mesh-text"
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
                        hasActive ? "text-mesh-accent" : "text-mesh-text-mute",
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
                        const active = isNavItemActive(pathname, item);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "group/nav relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                              active
                                ? "bg-mesh-accent/10 text-mesh-accent"
                                : "text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white",
                            )}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-mesh-accent" />
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
            <div className="mt-1 border-t border-mesh-border pt-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className={cn(
                  "group/nav relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                  pathname?.startsWith("/settings")
                    ? "bg-mesh-accent/10 text-mesh-accent"
                    : "text-mesh-text-dim hover:bg-mesh-surface-2/55 hover:text-white",
                )}
              >
                {pathname?.startsWith("/settings") && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-mesh-accent" />
                )}
                <Settings className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover/nav:scale-105" />
                <span>Settings</span>
              </Link>
            </div>
          </nav>

          {/* Status */}
          <div className="shrink-0 border-t border-mesh-border p-3">
            <div className="flex items-center gap-1.5 px-2">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  wsConnected
                    ? "bg-[#4ade80] ring-2 ring-[#4ade80]/30 status-glow-online"
                    : "bg-mesh-text-mute"
                )}
              />
              <span className="text-xs text-mesh-text-mute">
                {wsConnected ? "Live" : "Disconnected"}
              </span>
              <p className="ml-auto text-[10px] text-mesh-border-strong">
                Panoptikon {serverVersion ?? "..."}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
