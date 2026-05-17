import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  /** Bold headline naming the failure (e.g. "Couldn't reach MikroTik"). */
  title: string;
  /** Supporting mono detail — usually the upstream error / next retry. */
  message?: ReactNode;
  /** Optional small hint rendered below the message in faint mono. */
  hint?: ReactNode;
  /** Custom action node — overrides the default "Try again" button. */
  action?: ReactNode;
  /**
   * Retry handler — when provided (and `action` is not), a `Try again`
   * outline button is rendered on the right of the banner.
   */
  onRetry?: () => void;
  /** Override the default `AlertTriangle` icon glyph. */
  icon?: LucideIcon;
  /**
   * Optional stale/cached content to keep visible below the banner —
   * matches the source rule "errors never blank the screen — keep the last
   * known data with a diagonal stripe overlay to mark it stale".
   */
  staleContent?: ReactNode;
  /** Render the tight `inline` variant — single banner, no card chrome. */
  inline?: boolean;
  className?: string;
}

/**
 * ErrorState — failure banner that keeps last-known data visible.
 *
 * Faithful port of `StateError` from `panopticon/project/states.jsx`. Two
 * rules from the source:
 *
 *   1. NEVER blank the screen on error — keep stale data with a diagonal
 *      stripe overlay above it.
 *   2. Banner above the data with cause + retry action.
 *
 * @example
 * <ErrorState
 *   title="Couldn't reach MikroTik · cached 38s ago"
 *   message="RouterOS REST returned 502 — likely transient. Auto-retry in 4s."
 *   onRetry={refetch}
 *   staleContent={<DeviceMetricsGrid data={cached} />}
 * />
 */
export function ErrorState({
  title,
  message,
  hint,
  action,
  onRetry,
  icon,
  staleContent,
  inline = false,
  className,
}: ErrorStateProps) {
  const Glyph = icon ?? AlertTriangle;
  const retryNode =
    action ??
    (onRetry ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        data-action="retry"
      >
        <RefreshCw aria-hidden="true" />
        <span>Try again</span>
      </Button>
    ) : null);

  const banner = (
    <div
      style={{
        padding: inline ? "8px 12px" : "10px 14px",
        background: "rgba(244,63,94,0.06)",
        borderBottom: staleContent
          ? "1px solid rgba(244,63,94,0.25)"
          : "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          background: "rgba(244,63,94,0.12)",
          border: "1px solid rgba(244,63,94,0.30)",
          borderRadius: "calc(var(--radius) - 4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fb7185",
          flexShrink: 0,
        }}
      >
        <Glyph size={14} aria-hidden="true" strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: "600 12.5px var(--font-sans, system-ui, sans-serif)",
            color: "#e9f0fc",
          }}
        >
          {title}
        </div>
        {message ? (
          <div
            style={{
              font: "400 11px var(--font-mono, monospace)",
              color: "#98aecf",
              marginTop: 2,
            }}
          >
            {message}
          </div>
        ) : null}
        {hint ? (
          <div
            style={{
              font: "400 10.5px var(--font-mono, monospace)",
              color: "#3a5278",
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
      {retryNode}
    </div>
  );

  if (inline) {
    return (
      <div
        data-component="mesh-error-state"
        data-variant="inline"
        className={className}
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {banner}
      </div>
    );
  }

  return (
    <div
      data-component="mesh-error-state"
      data-variant="default"
      className={className}
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      {banner}
      {staleContent ? (
        <div style={{ padding: 14, position: "relative" }}>
          <div style={{ opacity: 0.6 }}>{staleContent}</div>
          <div
            aria-hidden="true"
            data-component="mesh-error-stale-overlay"
            style={{
              position: "absolute",
              inset: 14,
              backgroundImage:
                "repeating-linear-gradient(135deg, transparent 0, transparent 18px, rgba(245,158,11,0.04) 18px, rgba(245,158,11,0.04) 19px)",
              pointerEvents: "none",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
