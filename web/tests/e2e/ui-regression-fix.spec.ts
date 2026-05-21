import { test, expect, login } from '../../e2e/fixtures';

/**
 * E2E tests verifying UI regression fixes from PRs #615-#625.
 * Ensures sidebar readability, device filters, and dead code cleanup.
 */
test.describe.skip('UI regression fixes (#628)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar group labels use readable font size and weight', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Group label text should be readable and semibold in the refreshed sidebar.
    const groupLabels = sidebar.locator('span.uppercase.font-semibold');
    const count = await groupLabels.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify at least one group label is visible
    await expect(groupLabels.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-group-labels.png', fullPage: true });
  });

  test('sidebar version shows Panoptikon prefix', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Version text should include "Panoptikon" prefix (use <p> selector to avoid matching logo <span>)
    const versionText = sidebar.locator('p').filter({ hasText: 'Panoptikon' });
    await expect(versionText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-version-prefix.png', fullPage: true });
  });

  test('devices page uses standard button filter pills', async ({ page }) => {
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Filter buttons should be standard Button components (not animated pills)
    const allBtn = page.getByRole('button', { name: /^All\b/ });
    const onlineBtn = page.getByRole('button', { name: /^Online\b/ });
    const offlineBtn = page.getByRole('button', { name: /^Offline\b/ });

    await expect(allBtn).toBeVisible({ timeout: 15000 });
    await expect(onlineBtn).toBeVisible();
    await expect(offlineBtn).toBeVisible();

    // Buttons should have rounded-full class (pill shape)
    await expect(allBtn).toHaveClass(/rounded-full/);

    // Click Online to filter
    await onlineBtn.click();
    await page.waitForTimeout(500);

    // Click All to reset
    await allBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/screenshots/devices-standard-filters.png', fullPage: true });
  });
});

test.describe("Topbar notification badge regression (#803)", () => {
  test.beforeEach(async ({ page }) => {
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
          alerts_unread: 2,
          wan_rx_bps: 0,
          wan_tx_bps: 0,
          critical_online: 1,
          critical_total: 1,
        },
      });
    });
    await page.route("**/api/v1/alerts?limit=5", async (route) => {
      await route.fulfill({
        json: [
          {
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
          },
        ],
      });
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

    await login(page);
    await page.goto("/dashboard/");
    await expect(page.getByTestId("topbar-actions")).toBeVisible({ timeout: 15000 });
  });

  test("notification badge stays anchored inside the 28px icon button", async ({ page }) => {
    const bellButton = page.getByRole("button", { name: "Notifications" });
    const badge = bellButton.locator("span[aria-hidden='true']");

    await expect(badge).toBeVisible({ timeout: 10000 });

    const buttonBox = await bellButton.boundingBox();
    const badgeBox = await badge.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(badgeBox).not.toBeNull();

    expect(buttonBox!.width).toBe(28);
    expect(buttonBox!.height).toBe(28);
    expect(badgeBox!.x).toBeGreaterThan(buttonBox!.x + 14);
    expect(badgeBox!.y).toBeLessThan(buttonBox!.y + 10);
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(buttonBox!.x + buttonBox!.width);
    expect(badgeBox!.y).toBeGreaterThanOrEqual(buttonBox!.y);

    await bellButton.hover();
    const afterHover = await badge.boundingBox();
    expect(afterHover!.x).toBeCloseTo(badgeBox!.x, 0);
    expect(afterHover!.y).toBeCloseTo(badgeBox!.y, 0);

    await page.screenshot({ path: "tests/screenshots/topbar-notification-badge.png" });
  });
});
