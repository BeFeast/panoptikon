import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock API responses so the MikroTik router page renders in CI
 * (where no real MikroTik instance is available).
 */
async function mockMikrotikApis(page: import("@playwright/test").Page) {
  // Settings: MikroTik enabled
  await page.route("**/api/v1/settings", async (route) => {
    const response = await route.fetch().catch(() => null);
    if (response && response.ok()) {
      const body = await response.json();
      body.mikrotik_enabled = true;
      await route.fulfill({ json: body });
    } else {
      await route.fulfill({
        json: { mikrotik_enabled: true },
      });
    }
  });

  // MikroTik status — reachable
  await page.route("**/api/v1/mikrotik/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: true,
        version: "7.14.3",
        uptime: "1d12h30m",
        cpu_load: "5",
        total_memory: "1073741824",
        free_memory: "536870912",
        board_name: "hAP ac³",
        architecture: "arm",
        platform: "MikroTik",
      },
    }),
  );

  // Advanced routing — mock data with mangle rules, routing rules, and netwatch
  await page.route("**/api/v1/mikrotik/advanced-routing", (route) =>
    route.fulfill({
      json: {
        mangle_rules: [
          {
            id: "*1",
            chain: "prerouting",
            action: "mark-routing",
            protocol: "tcp",
            src_address: "192.168.88.0/24",
            dst_address: null,
            src_port: null,
            dst_port: null,
            in_interface: "ether2",
            out_interface: null,
            new_routing_mark: "wan2-route",
            new_connection_mark: null,
            new_packet_mark: null,
            passthrough: true,
            comment: "PBR: subnet to WAN2",
            disabled: false,
            bytes: "1234567",
            packets: "9876",
          },
          {
            id: "*2",
            chain: "prerouting",
            action: "mark-connection",
            protocol: null,
            src_address: "10.0.0.0/8",
            dst_address: null,
            src_port: null,
            dst_port: null,
            in_interface: null,
            out_interface: null,
            new_routing_mark: null,
            new_connection_mark: "wan1-conn",
            new_packet_mark: null,
            passthrough: true,
            comment: "Mark WAN1 connections",
            disabled: true,
            bytes: "0",
            packets: "0",
          },
        ],
        routing_rules: [
          {
            id: "*1",
            src_address: "192.168.88.0/24",
            dst_address: null,
            routing_mark: "wan2-route",
            action: "lookup",
            table: "wan2",
            interface: null,
            comment: "PBR lookup for WAN2",
            disabled: false,
          },
        ],
        netwatch: [
          {
            id: "*1",
            host: "8.8.8.8",
            check_type: "icmp",
            interval: "00:00:10",
            timeout: "00:00:03",
            status: "up",
            since: "2026-03-24 10:00:00",
            comment: "Google DNS - WAN1",
            disabled: false,
          },
          {
            id: "*2",
            host: "1.1.1.1",
            check_type: "icmp",
            interval: "00:00:10",
            timeout: "00:00:03",
            status: "down",
            since: "2026-03-24 09:30:00",
            comment: "Cloudflare DNS - WAN2",
            disabled: false,
          },
        ],
      },
    }),
  );

  // Mock remaining MikroTik endpoints so the page doesn't hang
  await page.route("**/api/v1/mikrotik/**", (route) => {
    const url = route.request().url();
    // Don't re-mock status or advanced-routing
    if (url.includes("/status") || url.includes("/advanced-routing")) {
      return route.fallback();
    }
    return route.fulfill({ json: [] });
  });
}

test.describe("Advanced Routing — Policy Routes, Gateway Monitor (#668)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockMikrotikApis(page);
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");
  });

  test("Advanced tab is visible in MikroTik router page", async ({ page }) => {
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-tab-visible.png",
    });
  });

  test("Advanced tab shows Policy Routes sub-tab with mangle rules", async ({
    page,
  }) => {
    // Click the Advanced tab
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });
    await advancedTab.click();

    // Should see the sub-tabs
    const policyTab = page.getByRole("tab", { name: "Policy Routes" });
    await expect(policyTab).toBeVisible({ timeout: 10000 });
    await expect(policyTab).toHaveAttribute("data-state", "active");

    // Should see the mangle rule table with mock data
    await expect(page.getByText("PBR: subnet to WAN2")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("wan2-route")).toBeVisible();
    await expect(page.getByText("192.168.88.0/24")).toBeVisible();

    // Add Rule button should be present
    await expect(
      page.getByRole("button", { name: "Add Rule" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-policy-routes.png",
    });
  });

  test("Advanced tab shows Routing Rules sub-tab", async ({ page }) => {
    // Navigate to Advanced tab
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });
    await advancedTab.click();

    // Click Routing Rules sub-tab
    const rulesTab = page.getByRole("tab", { name: "Routing Rules" });
    await expect(rulesTab).toBeVisible({ timeout: 10000 });
    await rulesTab.click();

    // Should see routing rule data
    await expect(page.getByText("PBR lookup for WAN2")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("lookup")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-rules.png",
    });
  });

  test("Advanced tab shows Gateway Monitor sub-tab with netwatch data", async ({
    page,
  }) => {
    // Navigate to Advanced tab
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });
    await advancedTab.click();

    // Click Gateway Monitor sub-tab
    const gwTab = page.getByRole("tab", { name: "Gateway Monitor" });
    await expect(gwTab).toBeVisible({ timeout: 10000 });
    await gwTab.click();

    // Should see netwatch entries
    await expect(page.getByText("8.8.8.8")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("1.1.1.1")).toBeVisible();
    await expect(page.getByText("Google DNS - WAN1")).toBeVisible();
    await expect(page.getByText("Cloudflare DNS - WAN2")).toBeVisible();

    // Verify status badges — "up" and "down"
    const upBadge = page.locator("text=up").first();
    const downBadge = page.locator("text=down").first();
    await expect(upBadge).toBeVisible();
    await expect(downBadge).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-gateway-monitor.png",
    });
  });

  test("Add Mangle Rule dialog opens and has form fields", async ({
    page,
  }) => {
    // Navigate to Advanced tab
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });
    await advancedTab.click();

    // Click Add Rule button
    await page.getByRole("button", { name: "Add Rule" }).first().click();

    // Dialog should appear
    await expect(
      page.locator('[role="dialog"]'),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Add Mangle Rule")).toBeVisible();

    // Verify form fields exist
    await expect(page.locator('[placeholder="prerouting"]')).toBeVisible();
    await expect(page.locator('[placeholder="mark-routing"]')).toBeVisible();
    await expect(page.locator('[placeholder="192.168.1.0/24"]').first()).toBeVisible();
    await expect(page.locator('[placeholder="wan2-route"]')).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-mangle-dialog.png",
    });
  });

  test("switching between Advanced sub-tabs preserves tab state", async ({
    page,
  }) => {
    // Navigate to Advanced tab
    const advancedTab = page.getByRole("tab", { name: "Advanced" });
    await expect(advancedTab).toBeVisible({ timeout: 15000 });
    await advancedTab.click();

    const policyTab = page.getByRole("tab", { name: "Policy Routes" });
    const rulesTab = page.getByRole("tab", { name: "Routing Rules" });
    const gwTab = page.getByRole("tab", { name: "Gateway Monitor" });
    await expect(policyTab).toBeVisible({ timeout: 10000 });

    // Default: Policy Routes is active
    await expect(policyTab).toHaveAttribute("data-state", "active");

    // Switch to Routing Rules
    await rulesTab.click();
    await expect(rulesTab).toHaveAttribute("data-state", "active");
    await expect(policyTab).toHaveAttribute("data-state", "inactive");

    // Switch to Gateway Monitor
    await gwTab.click();
    await expect(gwTab).toHaveAttribute("data-state", "active");
    await expect(rulesTab).toHaveAttribute("data-state", "inactive");

    // Switch back to Policy Routes
    await policyTab.click();
    await expect(policyTab).toHaveAttribute("data-state", "active");
    await expect(gwTab).toHaveAttribute("data-state", "inactive");

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-tab-switching.png",
    });
  });
});
