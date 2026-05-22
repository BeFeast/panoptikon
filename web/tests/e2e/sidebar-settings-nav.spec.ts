import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

async function stubShellData(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/api/v1/auth/status")) {
      await route.fulfill({
        json: { authenticated: false, needs_setup: false, sso_enabled: false, sso_login_url: null },
      });
      return;
    }

    if (url.includes("/api/v1/auth/login")) {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    if (url.includes("/api/v1/version")) {
      await route.fulfill({ json: { version: "0.6.103", uptime_seconds: 3661 } });
      return;
    }

    if (url.includes("/api/v1/dashboard/stats")) {
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
      return;
    }

    if (url.includes("/api/v1/topology/graph")) {
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
      return;
    }

    if (url.includes("/api/v1/dns-queries/stats")) {
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
      return;
    }

    await route.fulfill({ json: [] });
  });
}

test.describe("Sidebar Settings navigation (#808)", () => {
  test.beforeEach(async ({ page }) => {
    await stubShellData(page);
    await login(page);
  });

  test("desktop sidebar exposes one Settings entry in expanded and collapsed states", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/dashboard/");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const settingsLinks = sidebar.getByRole("link", { name: "Settings" });
    await expect(settingsLinks).toHaveCount(1);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar.getByRole("link", { name: "Settings" })).toBeVisible();

    await page.screenshot({ path: "tests/screenshots/sidebar-settings-desktop.png" });
  });

  test("mobile sidebar sheet exposes one Settings entry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto("/dashboard/");

    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByRole("link", { name: "Settings" })).toHaveCount(1);

    await page.screenshot({ path: "tests/screenshots/sidebar-settings-mobile.png" });
  });
});
