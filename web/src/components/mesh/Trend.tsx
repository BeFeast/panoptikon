import { Icon } from "./Icon";

export interface TrendProps {
  /** Display string, e.g. `"+12%"` or `"-3.4 ms"`. */
  value: string;
  /** Direction of the change — drives the colour and arrow. */
  positive?: boolean;
  className?: string;
}

/**
 * Trend — small directional change chip (arrow + value).
 *
 * Faithful port of `Trend` from `atoms.jsx`. Pair with KPI tiles or table
 * cells to show delta vs previous window.
 *
 * @example
 * <Trend value="+12%" positive />
 * <Trend value="-3.4 ms" positive={false} />
 */
export function Trend({ value, positive = true, className }: TrendProps) {
  const color = positive
    ? "hsl(var(--status-online))"
    : "hsl(var(--status-offline))";
  return (
    <span
      data-direction={positive ? "up" : "down"}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        color,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      <Icon name={positive ? "arrow-up" : "arrow-down"} size={10} stroke={2} />
      {value}
    </span>
  );
}
