import type { SettingsData } from "./types";

/**
 * Available router types.
 */
export const ROUTER_TYPES = ["mikrotik"] as const;

export type RouterType = (typeof ROUTER_TYPES)[number];

/**
 * Default router type is always MikroTik.
 */
export function getDefaultRouterType(
  _settings: Pick<
    SettingsData,
    "mikrotik_enabled"
  > | null,
): RouterType {
  return "mikrotik";
}
