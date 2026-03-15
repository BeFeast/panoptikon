import type { SettingsData } from "./types";

/**
 * Available router types.
 */
export const ROUTER_TYPES = ["mikrotik", "pfsense"] as const;

export type RouterType = (typeof ROUTER_TYPES)[number];

/**
 * Determine default router type from settings.
 */
export function getDefaultRouterType(
  settings: Pick<
    SettingsData,
    "mikrotik_enabled" | "pfsense_enabled" | "default_router"
  > | null,
): RouterType {
  if (settings?.default_router === "pfsense" && settings.pfsense_enabled) {
    return "pfsense";
  }
  return "mikrotik";
}
