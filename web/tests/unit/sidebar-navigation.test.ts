import { describe, expect, it } from "vitest";
import {
  isNavItemActive,
  navGroups,
  utilityNavItems,
} from "@/components/layout/Sidebar";

describe("sidebar navigation model", () => {
  it("exposes Settings exactly once across primary and utility navigation", () => {
    const allItems = [
      ...navGroups.flatMap((group) => group.items),
      ...utilityNavItems,
    ];

    expect(allItems.filter((item) => item.label === "Settings")).toHaveLength(1);
    expect(allItems.filter((item) => item.href === "/settings")).toHaveLength(1);
  });

  it("keeps Settings out of primary groups so the pinned utility entry is not duplicated", () => {
    const primarySettingsItems = navGroups
      .flatMap((group) => group.items)
      .filter((item) => item.label === "Settings" || item.href === "/settings");

    expect(primarySettingsItems).toHaveLength(0);
  });

  it("marks Settings active for nested settings routes", () => {
    const settingsItem = utilityNavItems.find((item) => item.href === "/settings");

    expect(settingsItem).toBeDefined();
    expect(isNavItemActive("/settings", settingsItem!)).toBe(true);
    expect(isNavItemActive("/settings/router", settingsItem!)).toBe(true);
    expect(isNavItemActive("/dashboard", settingsItem!)).toBe(false);
  });
});
