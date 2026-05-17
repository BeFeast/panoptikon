"use client";

import type { ReactNode } from "react";
import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Side the drawer slides in from. Defaults to right. */
  side?: "right" | "left";
  /** Pixel width on >= md viewports. Defaults to 560. */
  width?: number;
  /** Optional test id forwarded to the panel. */
  "data-testid"?: string;
  children: ReactNode;
}

/**
 * DetailsDrawer — shared mesh-direction drawer chrome.
 *
 * Wraps the existing shadcn Sheet primitive (Radix Dialog under the hood) and
 * applies mesh tokens so the panel matches the design handoff
 * (`panopticon/project/details.jsx`). Body of the drawer is a vertical stack
 * of `DetailsHeader` → `DetailsTabs` → `DetailsSection` → `DetailsFooter`.
 */
export function DetailsDrawer({
  open,
  onOpenChange,
  side = "right",
  width = 560,
  children,
  ...rest
}: DetailsDrawerProps) {
  const testId = rest["data-testid"];
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/72 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        />
        <SheetPrimitive.Content
          data-testid={testId}
          data-component="mesh-details-drawer"
          className={cn(
            "fixed z-50 top-0 bottom-0 flex flex-col gap-0",
            "border-l border-mesh-border bg-mesh-bg text-mesh-text shadow-2xl",
            "outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:duration-200 data-[state=closed]:duration-150",
            side === "right"
              ? "right-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right border-l"
              : "left-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left border-r",
          )}
          style={{
            width: "100%",
            maxWidth: width,
          }}
        >
          <SheetPrimitive.Close
            className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-mesh-text-mute transition-colors hover:bg-mesh-surface-2 hover:text-mesh-text focus:outline-none focus:ring-1 focus:ring-mesh-accent"
            aria-label="Close details"
          >
            <X size={14} />
          </SheetPrimitive.Close>
          <SheetPrimitive.Title className="sr-only">Details</SheetPrimitive.Title>
          <SheetPrimitive.Description className="sr-only">
            Details panel
          </SheetPrimitive.Description>
          <div className="flex h-full flex-col overflow-hidden">{children}</div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
