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

  // DHCP servers (pool configuration)
  await page.route("**/api/v1/pfsense/dhcp/servers", (route) =>
    route.fulfill({
      json: [
        {
          interface: "lan",
          enabled: true,
          range_start: "192.168.1.100",
          range_end: "192.168.1.200",
          gateway: "192.168.1.1",
          dns_servers: ["8.8.8.8", "8.8.4.4"],
          domain_name: "home.local",
          ntp_servers: ["pool.ntp.org"],
          default_lease_time: 86400,
          max_lease_time: 172800,
        },
      ],
    }),
  );

  // DHCP logs
  await page.route("**/api/v1/pfsense/dhcp/logs", (route) =>
    route.fulfill({
      json: [
        {
          timestamp: "2026-03-22T12:00:00Z",
          message: "DHCPACK on 192.168.1.100 to aa:bb:cc:dd:ee:01 via lan",
        },
        {
          timestamp: "2026-03-22T11:59:00Z",
          message: "DHCPDISCOVER from aa:bb:cc:dd:ee:01 via lan",
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

  test("Pool Configuration tab shows per-interface DHCP server settings", async ({
    page,
  }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Pool Configuration sub-tab
    const poolsTab = page.getByRole("tab", { name: "Pool Configuration" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    await expect(poolsTab).toHaveAttribute("data-state", "active");

    // Verify the LAN pool card is visible with key fields
    await expect(page.getByText("LAN")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Enabled")).toBeVisible();

    // Verify pool range fields are populated
    const startInput = page.locator('input[placeholder="192.168.1.100"]');
    await expect(startInput).toBeVisible();

    // Verify the Save button is present
    await expect(
      page.getByRole("button", { name: /Save/ }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-configuration-tab.png",
    });
  });

  test("Pool Configuration shows DHCP options (gateway, DNS, domain, NTP)", async ({
    page,
  }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const poolsTab = page.getByRole("tab", { name: "Pool Configuration" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Verify DHCP Options section headings
    await expect(page.getByText("IP Pool Range")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("DHCP Options")).toBeVisible();
    await expect(page.getByText("Lease Times (seconds)")).toBeVisible();

    // Verify gateway input has the mocked value
    const gatewayInput = page.locator('input[placeholder="192.168.1.1"]');
    await expect(gatewayInput).toHaveValue("192.168.1.1");

    // Verify DNS servers input
    const dnsInput = page.locator('input[placeholder="8.8.8.8, 8.8.4.4"]');
    await expect(dnsInput).toHaveValue("8.8.8.8, 8.8.4.4");

    // Verify domain name
    const domainInput = page.locator('input[placeholder="example.local"]');
    await expect(domainInput).toHaveValue("home.local");

    // Verify NTP servers
    const ntpInput = page.locator('input[placeholder="pool.ntp.org"]');
    await expect(ntpInput).toHaveValue("pool.ntp.org");

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-options.png",
    });
  });

  test("Pool Configuration shows lease time settings", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const poolsTab = page.getByRole("tab", { name: "Pool Configuration" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Verify lease time inputs are populated
    const defaultLeaseInput = page.locator('input[placeholder="86400"]');
    await expect(defaultLeaseInput).toBeVisible({ timeout: 10000 });
    await expect(defaultLeaseInput).toHaveValue("86400");

    const maxLeaseInput = page.locator('input[placeholder="172800"]');
    await expect(maxLeaseInput).toBeVisible();
    await expect(maxLeaseInput).toHaveValue("172800");

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-lease-times.png",
    });
  });

  test("DHCP Logs tab shows log entries", async ({ page }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click DHCP Logs sub-tab
    const logsTab = page.getByRole("tab", { name: "DHCP Logs" });
    await expect(logsTab).toBeVisible({ timeout: 10000 });
    await logsTab.click();

    await expect(logsTab).toHaveAttribute("data-state", "active");

    // Verify log entries are displayed
    await expect(
      page.getByText("DHCPACK on 192.168.1.100 to aa:bb:cc:dd:ee:01 via lan"),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("DHCPDISCOVER from aa:bb:cc:dd:ee:01 via lan"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-logs-tab.png",
    });
  });
});
