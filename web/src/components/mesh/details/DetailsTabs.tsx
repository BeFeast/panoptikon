"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface DetailsTabItem {
  /** Stable identifier used as the Radix `value`. */
  value: string;
  /** Visible label of the tab. */
  label: ReactNode;
  /** Optional small badge — typically a count chip (e.g. unread alerts). */
  badge?: ReactNode;
  /** Body content rendered when the tab is active. */
  content?: ReactNode;
  /** Disable the tab trigger. */
  disabled?: boolean;
}

export interface DetailsTabsProps {
  /** Tab definitions; first item is used as the default active tab. */
  items: DetailsTabItem[];
  /** Controlled active tab value. */
  value?: string;
  /** Change handler for controlled mode. */
  onValueChange?: (value: string) => void;
  /** Optional default tab when used uncontrolled. */
  defaultValue?: string;
  className?: string;
  /** Slot rendered to the right of the tab triggers (e.g. filter chips). */
  trailing?: ReactNode;
}

/**
 * DetailsTabs — mesh-styled tab strip inside a detail drawer.
 *
 * Faithful port of the tab nav row from `panopticon/project/details.jsx`.
 * Wraps shadcn `Tabs` primitive (already on mesh tokens after #771) and
 * overrides the trigger styling to match the source: underline accent on the
 * active trigger, `text-mute` for inactive, optional badge chip after the
 * label.
 */
export function DetailsTabs({
  items,
  value,
  onValueChange,
  defaultValue,
  className,
  trailing,
}: DetailsTabsProps) {
  if (items.length === 0) return null;
  const resolvedDefault = defaultValue ?? items[0]?.value;

  return (
    <Tabs
      value={value}
      defaultValue={resolvedDefault}
      onValueChange={onValueChange}
      data-component="mesh-details-tabs"
      className={cn("flex flex-col", className)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          borderBottom: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <TabsList
          className={cn(
            "h-auto bg-transparent border-0 p-0 gap-0 rounded-none",
            "items-end",
          )}
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              data-slot="mesh-details-tab-trigger"
              className={cn(
                "rounded-none px-3.5 py-2 text-[12.5px] font-medium",
                "bg-transparent text-mesh-text-mute",
                "border-b-2 border-transparent mb-[-1px]",
                "data-[state=active]:bg-transparent data-[state=active]:text-mesh-text",
                "data-[state=active]:font-semibold data-[state=active]:shadow-none",
                "data-[state=active]:border-mesh-accent",
                "hover:text-mesh-text",
              )}
            >
              <span>{item.label}</span>
              {item.badge != null ? (
                <span
                  data-slot="mesh-details-tab-badge"
                  style={{
                    marginLeft: 6,
                    padding: "1px 5px",
                    background: "rgba(244,63,94,0.18)",
                    color: "#f43f5e",
                    borderRadius: 3,
                    font: "500 9.5px var(--font-mono, monospace)",
                  }}
                >
                  {item.badge}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {trailing ? (
          <div
            data-slot="mesh-details-tabs-trailing"
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}
          >
            {trailing}
          </div>
        ) : null}
      </div>

      {items.map((item) =>
        item.content != null ? (
          <TabsContent
            key={item.value}
            value={item.value}
            className="m-0 px-5 py-4 outline-none"
          >
            {item.content}
          </TabsContent>
        ) : null,
      )}
    </Tabs>
  );
}
