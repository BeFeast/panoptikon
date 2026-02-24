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
 * 2. VyOS if legacy routers are shown and configured (url + api key set)
 * 3. MikroTik as fallback
 */
export function getDefaultRouterType(
  settings: Pick<
    SettingsData,
    "mikrotik_enabled" | "vyos_url" | "vyos_api_key_set" | "show_legacy_routers"
  > | null,
): RouterType {
  if (!settings) return "mikrotik";

  if (settings.mikrotik_enabled) return "mikrotik";
  if (settings.show_legacy_routers && settings.vyos_url && settings.vyos_api_key_set)
    return "vyos";
  return "mikrotik";
}

/**
 * Compute which router types should be available in a selector.
 *
 * VyOS is included when:
 * - The `show_legacy_routers` toggle is on, OR
 * - The entry being edited already uses VyOS (backward compat — never
 *   hide a type that an existing record already references).
 */
export function getAvailableRouterTypes(
  settings: Pick<SettingsData, "show_legacy_routers" | "vyos_url" | "vyos_api_key_set"> | null,
  currentRouterType?: string,
): string[] {
  const showVyos =
    (settings?.show_legacy_routers && !!settings.vyos_url && settings.vyos_api_key_set) ||
    currentRouterType === "vyos";
  return showVyos ? [...ROUTER_TYPES] : ["mikrotik"];
}
