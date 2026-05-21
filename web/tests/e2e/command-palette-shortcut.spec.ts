import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

async function stubShellData(page: Page) {
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
        alerts_unread: 0,
        wan_rx_bps: 0,
        wan_tx_bps: 0,
        critical_online: 1,
        critical_total: 1,
      },
    });
  });
  await page.route("**/api/v1/dashboard/alerts", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/alerts?limit=5", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/dashboard/traffic?*", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/dashboard/devices", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/dashboard/top-devices", async (route) => {
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

test.describe("Command palette keyboard shortcut (#805)", () => {
  test.beforeEach(async ({ page }) => {
    await stubShellData(page);
    await login(page);
  });

  test("Ctrl+K opens the palette and focuses search", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator("[cmdk-input]");
    await expect(input).toBeFocused();
    await page.keyboard.type("dash");
    await expect(input).toHaveValue("dash");

    await page.screenshot({
      path: "tests/screenshots/command-palette-ctrl-k-focused.png",
      fullPage: true,
    });
  });

  test("Meta+K opens the palette and Escape closes it", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-title")).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[cmdk-input]")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });

  test("shortcut is ignored inside text inputs", async ({ page }) => {
    await page.goto("/settings");
    const settingsSearch = page.getByTestId("settings-search");
    await expect(settingsSearch).toBeVisible({ timeout: 10000 });
    await settingsSearch.click();
    await expect(settingsSearch).toBeFocused();

    await page.keyboard.press("Control+k");

    await expect(page.locator("[cmdk-dialog]")).not.toBeVisible();
    await expect(settingsSearch).toBeFocused();
  });

  test("visible shortcut hint matches non-macOS control shortcut", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.locator("kbd").filter({ hasText: "Ctrl+K" }).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
