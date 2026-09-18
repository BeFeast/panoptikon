import { cn } from "@/lib/utils";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Path of the canonical Panoptikon mark, served from web/public. */
export const BRAND_MARK_SRC = "/brand/panoptikon-mark.svg";

/**
 * Panoptikon mesh mark.
 *
 * Renders the static brand asset at `public/brand/panoptikon-mark.svg`.
 * The same file backs the favicon; the app icons (apple-icon.png,
 * icon-192.png, icon-512.png) are rasterised from it on a navy tile.
 */
export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG asset, no optimisation needed
    <img
      src={BRAND_MARK_SRC}
      width={size}
      height={size}
      alt="Panoptikon"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      data-brand-mark="panoptikon"
    />
  );
}
