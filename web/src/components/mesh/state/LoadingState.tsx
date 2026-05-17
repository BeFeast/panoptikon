import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface LoadingStateProps {
  /** Optional title rendered above the skeleton ridges (e.g. "Loading agents"). */
  title?: string;
  /** Optional supporting line shown under the title in muted text. */
  message?: ReactNode;
  /**
   * Number of grid placeholder tiles to render above the row stack (matches
   * the source `StateLoading` top-row count). Set to `0` to omit the row.
   */
  tiles?: number;
  /**
   * Number of skeleton rows in the bottom list. Set to `0` to omit.
   */
  rows?: number;
  /** Render the tight `inline` variant — single bar, no card chrome. */
  inline?: boolean;
  className?: string;
}

/**
 * LoadingState — skeleton placeholder that matches the real surface layout.
 *
 * Faithful port of `StateLoading` from `panopticon/project/states.jsx`. The
 * design rule from the source is explicit: skeletons MUST match the real
 * layout — same column widths, same row heights, same count. Generic blocks
 * are forbidden, so the component lets the caller tune `tiles` / `rows` to
 * mirror the real surface.
 *
 * Internally we reuse the shared `Skeleton` from `@/components/ui/skeleton`
 * which already provides the mesh-accent shimmer, so this component stays a
 * pure layout wrapper.
 *
 * @example
 * <LoadingState
 *   title="Devices"
 *   message="Pulling live inventory…"
 *   tiles={4}
 *   rows={5}
 * />
 */
export function LoadingState({
  title,
  message,
  tiles = 4,
  rows = 5,
  inline = false,
  className,
}: LoadingStateProps) {
  if (inline) {
    return (
      <div
        data-component="mesh-loading-state"
        data-variant="inline"
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
        }}
      >
        <Skeleton style={{ width: 14, height: 14, borderRadius: 3 }} />
        <Skeleton style={{ flex: 1, height: 10, borderRadius: 3 }} />
      </div>
    );
  }

  return (
    <div
      data-component="mesh-loading-state"
      data-variant="default"
      className={className}
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "var(--radius)",
        padding: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {title ? (
        <div
          style={{
            font: "600 13px var(--font-sans, system-ui, sans-serif)",
            color: "#e9f0fc",
            marginBottom: message ? 4 : 12,
          }}
        >
          {title}
        </div>
      ) : (
        <Skeleton style={{ width: 120, height: 11, borderRadius: 3 }} />
      )}
      {message ? (
        <div
          style={{
            font: "400 11.5px var(--font-sans, system-ui, sans-serif)",
            color: "#98aecf",
            marginBottom: 12,
          }}
        >
          {message}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <Skeleton style={{ width: 180, height: 20, borderRadius: 3 }} />
        </div>
      )}
      {tiles > 0 ? (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: `repeat(${tiles}, 1fr)`,
            gap: 8,
          }}
        >
          {Array.from({ length: tiles }, (_, i) => (
            <Skeleton
              key={`tile-${i}`}
              style={{ width: "100%", height: 56, borderRadius: 3 }}
            />
          ))}
        </div>
      ) : null}
      {rows > 0 ? (
        <div style={{ marginTop: 14 }}>
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={`row-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 80px 60px",
                gap: 10,
                padding: "7px 0",
                borderBottom:
                  i < rows - 1
                    ? "1px solid hsl(var(--border))"
                    : "none",
              }}
            >
              <Skeleton style={{ width: "100%", height: 10, borderRadius: 3 }} />
              <Skeleton style={{ width: "80%", height: 10, borderRadius: 3 }} />
              <Skeleton style={{ width: "100%", height: 10, borderRadius: 3 }} />
              <Skeleton style={{ width: "100%", height: 10, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
