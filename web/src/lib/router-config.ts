import type { SettingsData } from "./types";

/**
 * Available router types, ordered by priority (MikroTik first).
 * VyOS is kept as a legacy / secondary option.
 */
export const ROUTER_TYPES = ["mikrotik", "vyos"] as const;

export type RouterType = (typeof ROUTER_TYPES)[number];

/**
 * Derive the default router type from the current settings.
 *
 * Priority:
 * 1. MikroTik if explicitly enabled
 * 2. VyOS if configured (url + api key set)
 * 3. MikroTik as fallback
 */
export function getDefaultRouterType(
  settings: Pick<
    SettingsData,
    "mikrotik_enabled" | "vyos_url" | "vyos_api_key_set"
  > | null,
): RouterType {
  if (!settings) return "mikrotik";

  if (settings.mikrotik_enabled) return "mikrotik";
  if (settings.vyos_url && settings.vyos_api_key_set) return "vyos";
  return "mikrotik";
}
