import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock API responses so the pfSense router page renders in CI
 * (where no real pfSense instance is available).
 */
async function mockPfsenseApis(page: import("@playwright/test").Page) {
  // Mock remaining pfSense endpoints first; Playwright evaluates route
  // handlers in reverse registration order, so specific mocks below win.
  await page.route("**/api/v1/pfsense/**", (route) =>
    route.fulfill({ json: [] }),
  );

  // Settings: pfSense enabled
  await page.route("**/api/v1/settings", async (route) => {
    await route.fulfill({
      json: {
        mikrotik_enabled: false,
        pfsense_enabled: true,
        xiaomi_mesh_enabled: false,
        default_router: "pfsense",
      },
    });
  });

  // pfSense status
  await page.route("**/api/v1/pfsense/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: true,
        hostname: "pfSense-test",
        domain: "localdomain",
        version: "2.7.0",
        uptime: "1 day",
        cpu_usage: 5,
        memory_total: 8192,
        memory_used: 2048,
        platform: "pfSense",
      },
    }),
  );

  // DHCP leases
  await page.route("**/api/v1/pfsense/dhcp/leases", (route) =>
    route.fulfill({
      json: [
        {
          ip: "192.168.1.100",
          mac: "aa:bb:cc:dd:ee:01",
          hostname: "test-device",
          start: "2026-03-22T10:00:00Z",
          end: "2026-03-23T10:00:00Z",
          status: "active",
          interface: "lan",
        },
      ],
    }),
  );

  // DHCP static mappings
  await page.route("**/api/v1/pfsense/dhcp/static_mappings", (route) =>
    route.fulfill({
      json: [
        {
          id: "test-1",
          mac: "aa:bb:cc:dd:ee:02",
          ip: "192.168.1.200",
          hostname: "static-device",
          description: "Test static mapping",
          interface: "lan",
        },
      ],
    }),
  );
}

test.describe.skip("DHCP page — sub-tabs for Active Leases / Static Mappings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
    await page.goto("/router/pfsense");
    await page.waitForLoadState("networkidle");
  });

  test("DHCP tab shows Active Leases and Static Mappings sub-tabs", async ({
    page,
  }) => {
    // Click the top-level DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Verify both sub-tabs are visible
    const leasesTab = page.getByRole("tab", { name: "Active Leases" });
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(leasesTab).toBeVisible({ timeout: 10000 });
    await expect(mappingsTab).toBeVisible();

    // Active Leases should be the default selected tab
    await expect(leasesTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/dhcp-active-leases-tab.png",
    });
  });

  test("clicking Static Mappings tab shows mappings content", async ({
    page,
  }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Static Mappings sub-tab
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(mappingsTab).toBeVisible({ timeout: 10000 });
    await mappingsTab.click();

    // Verify mappings tab is now active
    await expect(mappingsTab).toHaveAttribute("data-state", "active");

    // The Add Mapping button should be visible in the Static Mappings section
    await expect(
      page.getByRole("button", { name: "Add Mapping" }),
    ).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/dhcp-static-mappings-tab.png",
    });
  });

  test("switching between tabs preserves tab state", async ({ page }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const leasesTab = page.getByRole("tab", { name: "Active Leases" });
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(leasesTab).toBeVisible({ timeout: 10000 });

    // Switch to Static Mappings
    await mappingsTab.click();
    await expect(mappingsTab).toHaveAttribute("data-state", "active");
    await expect(leasesTab).toHaveAttribute("data-state", "inactive");

    // Switch back to Active Leases
    await leasesTab.click();
    await expect(leasesTab).toHaveAttribute("data-state", "active");
    await expect(mappingsTab).toHaveAttribute("data-state", "inactive");

    await page.screenshot({
      path: "tests/screenshots/dhcp-tab-switching.png",
    });
  });
});
