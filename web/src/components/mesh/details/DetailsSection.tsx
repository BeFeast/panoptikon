import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/mesh/Icon";

export interface DetailsSectionProps {
  /** Section heading rendered as a small uppercase tracked label. */
  title?: ReactNode;
  /** Optional mesh icon glyph rendered before the title. */
  icon?: IconName;
  /** Right-aligned slot for a single secondary action / chip. */
  action?: ReactNode;
  /** Optional second-line subtitle / hint below the title. */
  subtitle?: ReactNode;
  /** Body content (cards, grids, charts). */
  children?: ReactNode;
  /** Render the section as a bare card (default `true`). */
  card?: boolean;
  className?: string;
}

/**
 * DetailsSection — labelled block inside a drawer body.
 *
 * Faithful port of the body section pattern from
 * `panopticon/project/details.jsx` ("Traffic · 24h", "Path · WAN → device",
 * "Listening · 4 ports", etc.). Provides the consistent uppercase-tracked
 * label + optional action slot contract every detail surface relies on.
 */
export function DetailsSection({
  title,
  icon,
  action,
  subtitle,
  children,
  card = true,
  className,
}: DetailsSectionProps) {
  const body = (
    <>
      {title || action ? (
        <div
          data-slot="mesh-details-section-head"
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {icon ? <Icon name={icon} size={12} color="#5d7799" /> : null}
            {title ? (
              <h3
                style={{
                  font: "600 10px var(--font-sans, system-ui, sans-serif)",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "#5d7799",
                  margin: 0,
                }}
              >
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <span
                style={{
                  font: "500 11px var(--font-mono, monospace)",
                  color: "#5d7799",
                }}
              >
                {subtitle}
              </span>
            ) : null}
          </div>
          {action ? (
            <div
              data-slot="mesh-details-section-action"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {action}
            </div>
          ) : null}
        </div>
      ) : null}
      <div data-slot="mesh-details-section-body">{children}</div>
    </>
  );

  return (
    <section
      data-component="mesh-details-section"
      data-variant={card ? "card" : "bare"}
      className={className}
      style={
        card
          ? {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              padding: 14,
            }
          : { padding: 0 }
      }
    >
      {body}
    </section>
  );
}
