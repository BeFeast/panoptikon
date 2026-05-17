import type { ReactNode } from "react";

export interface DetailsFooterProps {
  /** Footer body — typically a row of primary / secondary buttons. */
  children: ReactNode;
  /** Render the buttons centered instead of right-aligned. */
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * DetailsFooter — sticky bottom action bar inside a detail drawer.
 *
 * Mirrors the implicit footer pattern from `panopticon/project/details.jsx`
 * (primary actions sat in the header card there; for non-trivial forms we
 * promote them into a dedicated sticky footer to keep the CTA in reach as
 * the body scrolls).
 */
export function DetailsFooter({
  children,
  align = "end",
  className,
}: DetailsFooterProps) {
  const justify =
    align === "center" ? "center" : align === "start" ? "flex-start" : "flex-end";
  return (
    <footer
      data-component="mesh-details-footer"
      className={className}
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        gap: 8,
        padding: "12px 20px",
        background: "hsl(var(--card))",
        borderTop: "1px solid hsl(var(--border))",
        backdropFilter: "saturate(140%) blur(6px)",
      }}
    >
      {children}
    </footer>
  );
}
