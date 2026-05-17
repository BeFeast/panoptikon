"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DetailsHeader, type DetailsHeaderProps } from "./DetailsHeader";
import { DetailsTabs, type DetailsTabItem } from "./DetailsTabs";

export type DetailsDrawerSide = "right" | "left" | "center";

export interface DetailsDrawerProps {
  /** Controls visibility — Radix-style controlled prop. */
  open: boolean;
  /** Called when the user dismisses the surface. */
  onOpenChange: (open: boolean) => void;
  /** Primary title — shown in the header and used as the a11y label. */
  title: ReactNode;
  /** Optional eyebrow above the title (e.g. "Device"). */
  eyebrow?: ReactNode;
  /**
   * Surface placement.
   *   - `right` (default) / `left` — slide-in side sheet
   *   - `center` — modal dialog (used for "Edit asset"-style forms)
   */
  side?: DetailsDrawerSide;
  /** Optional pre-built header props — when omitted callers can pass `children`. */
  header?: Omit<DetailsHeaderProps, "onClose"> & { onClose?: () => void };
  /** Optional tab strip rendered under the header. */
  tabs?: DetailsTabItem[];
  /** Controlled active tab value. */
  tabValue?: string;
  /** Tab change handler. */
  onTabValueChange?: (value: string) => void;
  /** Optional sticky footer (CTA row). */
  footer?: ReactNode;
  /** Body content rendered between header and footer. */
  children?: ReactNode;
  /** Plain-text description for a11y (sr-only). */
  description?: string;
  /** Override the panel width (only honoured for side variants). */
  widthClassName?: string;
  className?: string;
}

const FRAME_BASE =
  "flex h-full flex-col overflow-hidden bg-mesh-surface-1 text-mesh-text";

/**
 * DetailsDrawer — shared mesh surface for entity detail UIs.
 *
 * Faithful port of the drawer shell pattern implied by
 * `panopticon/project/details.jsx`. Wraps the shadcn `Sheet` primitive for
 * side variants and the `Dialog` primitive for the centered "form modal"
 * variant — both already consume mesh tokens after #771, so we only override
 * width / padding here.
 *
 * Composes the rest of the U3 vocabulary (`DetailsHeader`, `DetailsTabs`)
 * and exposes a `footer` slot for sticky CTAs. Pure presentational; callers
 * decide what goes inside the body.
 */
export function DetailsDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  side = "right",
  header,
  tabs,
  tabValue,
  onTabValueChange,
  footer,
  children,
  description,
  widthClassName,
  className,
}: DetailsDrawerProps) {
  const resolvedHeader: DetailsHeaderProps = {
    title,
    eyebrow,
    ...header,
    onClose: header?.onClose ?? (() => onOpenChange(false)),
  };

  const body = (
    <>
      <DetailsHeader {...resolvedHeader} />
      {tabs && tabs.length > 0 ? (
        <div data-slot="mesh-details-drawer-tabs" className="flex-shrink-0">
          <DetailsTabs
            items={tabs}
            value={tabValue}
            onValueChange={onTabValueChange}
          />
        </div>
      ) : null}
      <div
        data-slot="mesh-details-drawer-body"
        className="flex-1 overflow-y-auto"
        style={{ padding: tabs?.length ? 0 : "0 20px 20px" }}
      >
        {children}
      </div>
      {footer ? footer : null}
    </>
  );

  if (side === "center") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          data-component="mesh-details-drawer"
          data-side="center"
          className={cn(
            "p-0 gap-0 max-w-2xl w-[min(720px,calc(100vw-32px))]",
            "max-h-[min(820px,calc(100vh-32px))]",
            FRAME_BASE,
            className,
          )}
        >
          <DialogTitle className="sr-only">
            {typeof title === "string" ? title : "Details"}
          </DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side === "left" ? "left" : "right"}
        data-component="mesh-details-drawer"
        data-side={side}
        className={cn(
          "p-0 gap-0",
          "w-[min(640px,100vw)] sm:max-w-[640px]",
          widthClassName,
          FRAME_BASE,
          className,
        )}
      >
        <SheetTitle className="sr-only">
          {typeof title === "string" ? title : "Details"}
        </SheetTitle>
        {description ? (
          <SheetDescription className="sr-only">{description}</SheetDescription>
        ) : null}
        {body}
      </SheetContent>
    </Sheet>
  );
}
