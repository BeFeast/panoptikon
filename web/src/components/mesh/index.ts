/**
 * Mesh atoms — faithful port of `panopticon/project/atoms.jsx`.
 *
 * Each module is a small, pure-presentational building block used by the
 * mesh-direction route shells (dashboard, devices, alerts, etc.). They are
 * intentionally dependency-free aside from `lucide-react` (icon glyph map)
 * so they can be composed freely inside both server- and client-rendered
 * trees without bringing in extra runtime weight.
 */

export { Spark } from "./Spark";
export type { SparkProps } from "./Spark";

export { MiniBars } from "./MiniBars";
export type { MiniBarsProps } from "./MiniBars";

export { Trend } from "./Trend";
export type { TrendProps } from "./Trend";

export { BandwidthBar } from "./BandwidthBar";
export type { BandwidthBarProps } from "./BandwidthBar";

export { StatusDot } from "./StatusDot";
export type { StatusDotProps, StatusKind } from "./StatusDot";

export { SevDot } from "./SevDot";
export type { SevDotProps, Severity } from "./SevDot";

export { Icon, ICON_MAP } from "./Icon";
export type { IconProps, IconName } from "./Icon";

export { KPI } from "./KPI";
export type { KPIProps } from "./KPI";
