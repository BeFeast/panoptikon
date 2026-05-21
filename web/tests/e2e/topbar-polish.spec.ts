import { test, expect, login } from "../../e2e/fixtures";
import type { Locator, Page } from "@playwright/test";

const ALERT = {
  id: "topbar-alert-1",
  type: "device_offline",
  device_id: null,
  agent_id: null,
  message: "Router heartbeat missed",
  details: null,
  is_read: false,
  severity: "WARNING",
  acknowledged_at: null,
  acknowledged_by: null,
  created_at: "2026-05-21T17:41:07Z",
};

async function stubTopbarData(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/auth/status", async (route) => {
    await route.fulfill({
      json: { authenticated: false, needs_setup: false, sso_enabled: false, sso_login_url: null },
    });
  });
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/v1/version", async (route) => {
    await route.fulfill({ json: { version: "0.6.103" } });
  });
  await page.route("**/api/v1/dashboard/stats", async (route) => {
    await route.fulfill({
      json: {
        router_status: "online",
        router_type: "mikrotik",
        devices_online: 3,
        devices_total: 4,
        alerts_unread: 1,
        wan_rx_bps: 0,
        wan_tx_bps: 0,
        critical_online: 1,
        critical_total: 1,
      },
    });
  });
  await page.route("**/api/v1/alerts?limit=5", async (route) => {
    await route.fulfill({ json: [ALERT] });
  });
  await page.route("**/api/v1/traffic/history?*", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/devices", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/dashboard/top-devices?*", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/topology/graph", async (route) => {
    await route.fulfill({
      json: {
        devices: [],
        positions: [],
        router: {
          router_type: "mikrotik",
          is_online: true,
          wan_ip: null,
          hostname: "core.lan",
          version: null,
        },
      },
    });
  });
  await page.route("**/api/v1/agents", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/dns-queries/stats?*", async (route) => {
    await route.fulfill({
      json: {
        total_queries: 0,
        blocked_queries: 0,
        unique_domains: 0,
        unique_clients: 0,
        top_queried_domains: [],
        top_blocked_domains: [],
        per_device_stats: [],
        queries_over_time: [],
      },
    });
  });
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function expectStableBox(
  locator: Locator,
  before: { x: number; y: number; width: number; height: number },
) {
  const after = await box(locator);
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
}

test.describe("TopBar polish (#803)", () => {
  test.beforeEach(async ({ page }) => {
    await stubTopbarData(page);
    await login(page);
    await page.goto("/dashboard/");
    await expect(page.getByTestId("topbar-actions")).toBeVisible({ timeout: 15000 });
  });

  test("top-right icon controls keep fixed geometry on hover and focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    const actions = page.getByTestId("topbar-actions");
    const reload = page.getByRole("button", { name: "Reload" });
    const notifications = page.getByRole("button", { name: "Notifications" });
    const settings = page.getByRole("button", { name: "Settings" });
    const buttons = [reload, notifications, settings];

    await expect(actions).toBeVisible();
    const groupBefore = await box(actions);

    for (const button of buttons) {
      const before = await box(button);
      expect(before.width).toBe(28);
      expect(before.height).toBe(28);

      await button.hover();
      await expectStableBox(button, before);
      await expectStableBox(actions, groupBefore);

      await button.focus();
      await expectStableBox(button, before);
      await expectStableBox(actions, groupBefore);

      const focusStyle = await button.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          backgroundColor: style.backgroundColor,
        };
      });
      expect(
        focusStyle.outlineStyle !== "none" ||
          focusStyle.outlineWidth !== "0px" ||
          focusStyle.backgroundColor !== "rgba(0, 0, 0, 0)",
      ).toBeTruthy();
    }

    await page.screenshot({ path: "tests/screenshots/topbar-controls-desktop.png" });
  });

  test("topbar controls remain aligned at narrow width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto("/dashboard/");
    await expect(page.getByTestId("topbar-actions")).toBeVisible({ timeout: 15000 });

    const actions = page.getByTestId("topbar-actions");
    const before = await box(actions);
    expect(before.width).toBeLessThanOrEqual(96);

    await page.getByRole("button", { name: "Settings" }).hover();
    await expectStableBox(actions, before);

    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByText("Notifications")).toBeVisible({ timeout: 5000 });
    await expectStableBox(actions, before);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBeFalsy();
    await page.screenshot({ path: "tests/screenshots/topbar-controls-mobile.png" });
  });
});
