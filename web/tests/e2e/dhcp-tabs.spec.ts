import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock API responses so the pfSense router page renders in CI
 * (where no real pfSense instance is available).
 */
async function mockPfsenseApis(page: import("@playwright/test").Page) {
  // Settings: pfSense enabled
  await page.route("**/api/v1/settings", async (route) => {
    const response = await route.fetch().catch(() => null);
    if (response && response.ok()) {
      const body = await response.json();
      body.pfsense_enabled = true;
      await route.fulfill({ json: body });
    } else {
      await route.fulfill({
        json: { pfsense_enabled: true },
      });
    }
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

  // DHCP static mappings (hyphen variant)
  await page.route("**/api/v1/pfsense/dhcp/static-mappings", (route) =>
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

  // DHCP pools
  await page.route("**/api/v1/pfsense/dhcp/pools", (route) =>
    route.fulfill({
      json: [
        {
          id: "pool-lan-001",
          interface: "lan",
          range_start: "192.168.1.100",
          range_end: "192.168.1.200",
          gateway: "192.168.1.1",
          dns_servers: ["8.8.8.8", "8.8.4.4"],
          domain: "home.local",
          ntp_servers: ["pool.ntp.org"],
          default_lease_time: "86400",
          max_lease_time: "172800",
          enabled: true,
        },
      ],
    }),
  );

  // DHCP logs
  await page.route("**/api/v1/pfsense/dhcp/logs", (route) =>
    route.fulfill({
      json: [
        {
          timestamp: "Mar 22 10:00:01",
          message: "DHCPACK on 192.168.1.100 to aa:bb:cc:dd:ee:01 via lan",
          interface: "lan",
        },
        {
          timestamp: "Mar 22 09:55:30",
          message: "DHCPDISCOVER from aa:bb:cc:dd:ee:01 via lan",
          interface: "lan",
        },
      ],
    }),
  );

  // Mock remaining pfSense endpoints so the page doesn't hang
  await page.route("**/api/v1/pfsense/**", (route) =>
    route.fulfill({ json: [] }),
  );
}

test.describe("DHCP page — sub-tabs for Active Leases / Static Mappings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
    await page.goto("/router/pfsense");
    await page.waitForLoadState("networkidle");
  });

  test("DHCP tab shows all four sub-tabs", async ({
    page,
  }) => {
    // Click the top-level DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Verify all four sub-tabs are visible
    const leasesTab = page.getByRole("tab", { name: "Active Leases" });
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    const poolsTab = page.getByRole("tab", { name: "Pool Config" });
    const logsTab = page.getByRole("tab", { name: "DHCP Logs" });
    await expect(leasesTab).toBeVisible({ timeout: 10000 });
    await expect(mappingsTab).toBeVisible();
    await expect(poolsTab).toBeVisible();
    await expect(logsTab).toBeVisible();

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

test.describe("DHCP Pool Configuration tab", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
    await page.goto("/router/pfsense");
    await page.waitForLoadState("networkidle");
  });

  test("Pool Config tab displays pool data with range, gateway, DNS, lease times", async ({
    page,
  }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Pool Config sub-tab
    const poolsTab = page.getByRole("tab", { name: "Pool Config" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Verify pool configuration card is visible
    await expect(page.getByTestId("dhcp-pool-config")).toBeVisible({
      timeout: 10000,
    });

    // Verify pool data renders — check for LAN interface label
    await expect(page.getByTestId("dhcp-pool-lan")).toBeVisible();

    // Verify pool details are displayed
    await expect(page.getByText("192.168.1.100 - 192.168.1.200")).toBeVisible();
    await expect(page.getByText("192.168.1.1")).toBeVisible();
    await expect(page.getByText("home.local")).toBeVisible();
    await expect(page.getByText("8.8.8.8, 8.8.4.4")).toBeVisible();

    // Verify Configure button is present
    await expect(page.getByTestId("edit-pool-lan")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-config-tab.png",
    });
  });

  test("clicking Configure opens edit dialog with pool values", async ({
    page,
  }) => {
    // Navigate to DHCP > Pool Config
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const poolsTab = page.getByRole("tab", { name: "Pool Config" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Click Configure
    await expect(page.getByTestId("edit-pool-lan")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("edit-pool-lan").click();

    // Verify the edit dialog appears
    await expect(
      page.getByRole("heading", { name: /Configure DHCP Pool/ }),
    ).toBeVisible({ timeout: 5000 });

    // Verify form fields are pre-populated
    await expect(page.getByTestId("pool-range-start")).toHaveValue("192.168.1.100");
    await expect(page.getByTestId("pool-range-end")).toHaveValue("192.168.1.200");
    await expect(page.getByTestId("pool-gateway")).toHaveValue("192.168.1.1");
    await expect(page.getByTestId("pool-dns-servers")).toHaveValue("8.8.8.8, 8.8.4.4");
    await expect(page.getByTestId("pool-domain")).toHaveValue("home.local");
    await expect(page.getByTestId("pool-ntp-servers")).toHaveValue("pool.ntp.org");
    await expect(page.getByTestId("pool-default-lease")).toHaveValue("86400");
    await expect(page.getByTestId("pool-max-lease")).toHaveValue("172800");

    // Verify Save button is present
    await expect(page.getByTestId("pool-save-btn")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-edit-dialog.png",
    });
  });
});

test.describe("DHCP Logs tab", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
    await page.goto("/router/pfsense");
    await page.waitForLoadState("networkidle");
  });

  test("DHCP Logs tab displays log entries", async ({ page }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click DHCP Logs sub-tab
    const logsTab = page.getByRole("tab", { name: "DHCP Logs" });
    await expect(logsTab).toBeVisible({ timeout: 10000 });
    await logsTab.click();

    // Verify logs card is visible
    await expect(page.getByTestId("dhcp-logs")).toBeVisible({ timeout: 10000 });

    // Verify log entries are displayed
    await expect(page.getByText("DHCPACK on 192.168.1.100")).toBeVisible();
    await expect(page.getByText("DHCPDISCOVER from aa:bb:cc:dd:ee:01")).toBeVisible();

    // Verify Refresh button is present
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-logs-tab.png",
    });
  });
});
