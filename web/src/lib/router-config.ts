import type { SettingsData } from "./types";

/**
 * Available router types, ordered by priority (MikroTik first).
 * VyOS is kept as a legacy / secondary option.
 */
export const ROUTER_TYPES = ["mikrotik", "vyos"] as const;

export type RouterType = (typeof ROUTER_TYPES)[number];

/**
 * Default router type is always MikroTik (#330).
 * Users can still select VyOS explicitly per-entry.
 */
export function getDefaultRouterType(
  _settings: Pick<
    SettingsData,
    | "mikrotik_enabled"
    | "vyos_url"
    | "vyos_api_key_set"
    | "show_legacy_routers"
  > | null,
): RouterType {
  return "mikrotik";
}
