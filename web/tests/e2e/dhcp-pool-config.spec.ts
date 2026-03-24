import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock MikroTik APIs so the DHCP pool configuration UI renders in CI
 * (where no real MikroTik router is available).
 *
 * IMPORTANT: In Playwright, routes added LAST take priority. So we register
 * the catch-all first, then add specific routes that should override it.
 */
async function mockMikrotikDhcpApis(page: import("@playwright/test").Page) {
  // 1) Catch-all for any unhandled MikroTik endpoints (registered FIRST = lowest priority)
  await page.route("**/api/v1/mikrotik/**", (route) =>
    route.fulfill({ json: [] }),
  );

  // 2) Settings: MikroTik enabled (overrides catch-all for this path)
  await page.route("**/api/v1/settings", async (route) => {
    const response = await route.fetch().catch(() => null);
    if (response && response.ok()) {
      const body = await response.json();
      body.mikrotik_enabled = true;
      body.mikrotik_url = "https://10.0.0.1";
      await route.fulfill({ json: body });
    } else {
      await route.fulfill({
        json: {
          mikrotik_enabled: true,
          mikrotik_url: "https://10.0.0.1",
        },
      });
    }
  });

  // 3) MikroTik status
  await page.route("**/api/v1/mikrotik/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: true,
        version: "7.14.3",
        uptime: "3d12h30m",
        cpu_load: "5",
        total_memory: "268435456",
        free_memory: "134217728",
        board_name: "hAP ac3",
        architecture: "arm",
        platform: "MikroTik",
      },
    }),
  );

  // 4) DHCP leases
  await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
    route.fulfill({
      json: [
        {
          address: "192.168.88.100",
          mac_address: "AA:BB:CC:DD:EE:01",
          host_name: "workstation-1",
          status: "bound",
          expires_after: "23h55m",
          server: "defconf",
          dynamic: true,
          disabled: false,
          comment: null,
        },
        {
          address: "192.168.88.200",
          mac_address: "AA:BB:CC:DD:EE:02",
          host_name: "server-1",
          status: "bound",
          expires_after: null,
          server: "defconf",
          dynamic: false,
          disabled: false,
          comment: "Reserved for server",
        },
      ],
    }),
  );

  // 5) DHCP servers
  await page.route("**/api/v1/mikrotik/dhcp/servers**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            name: "defconf",
            interface: "bridge",
            address_pool: "dhcp-pool1",
            lease_time: "1d",
            disabled: false,
            authoritative: "yes",
            dynamic: false,
            invalid: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // 6) DHCP networks
  await page.route("**/api/v1/mikrotik/dhcp/networks**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            address: "192.168.88.0/24",
            gateway: "192.168.88.1",
            dns_server: "8.8.8.8,8.8.4.4",
            domain: "local",
            ntp_server: "pool.ntp.org",
            comment: "Default network",
            dynamic: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // 7) IP pools
  await page.route("**/api/v1/mikrotik/dhcp/pools**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            name: "dhcp-pool1",
            ranges: "192.168.88.100-192.168.88.200",
            comment: "Default DHCP pool",
            dynamic: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // 8) DHCP logs
  await page.route("**/api/v1/mikrotik/dhcp/logs", (route) =>
    route.fulfill({
      json: [
        {
          id: "*1",
          time: "mar/24 09:15:00",
          topics: "dhcp",
          message: "defconf assigned 192.168.88.100 to AA:BB:CC:DD:EE:01",
        },
        {
          id: "*2",
          time: "mar/24 09:10:00",
          topics: "dhcp",
          message: "defconf deassigned 192.168.88.101 from AA:BB:CC:DD:EE:03",
        },
      ],
    }),
  );
}

test.describe("DHCP Server Pool Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockMikrotikDhcpApis(page);
  });

  test("DHCP tab shows sub-tabs for Leases, Servers, Pools, Networks, Logs", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    // Click the top-level DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Verify sub-tabs are visible
    await expect(page.getByRole("tab", { name: "Leases" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("tab", { name: "Servers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "IP Pools" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Networks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Logs" })).toBeVisible();

    // Page title should show DHCP Server Management
    await expect(page.getByText("DHCP Server Management")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-config-tabs.png",
    });
  });

  test("Servers sub-tab shows DHCP server with lease time", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Servers sub-tab
    const serversTab = page.getByRole("tab", { name: "Servers" });
    await expect(serversTab).toBeVisible({ timeout: 10000 });
    await serversTab.click();

    // Verify server data is displayed
    await expect(page.getByText("defconf")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("bridge")).toBeVisible();
    await expect(page.getByText("dhcp-pool1")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-servers-tab.png",
    });
  });

  test("IP Pools sub-tab shows pool ranges and Add Pool button", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click IP Pools sub-tab
    const poolsTab = page.getByRole("tab", { name: "IP Pools" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Verify pool data
    await expect(page.getByText("dhcp-pool1")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("192.168.88.100-192.168.88.200"),
    ).toBeVisible();

    // Add Pool button should be visible
    await expect(
      page.getByRole("button", { name: "Add Pool" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pools-tab.png",
    });
  });

  test("Add Pool dialog opens with correct form fields", async ({ page }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const poolsTab = page.getByRole("tab", { name: "IP Pools" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Click Add Pool
    await page.getByRole("button", { name: "Add Pool" }).click();

    // Dialog should open with form fields
    await expect(page.getByText("Add IP Pool")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("dhcp-pool1")).toBeVisible();
    await expect(
      page.getByPlaceholder("192.168.1.100-192.168.1.200"),
    ).toBeVisible();

    // Create button should be visible
    await expect(
      page.getByRole("button", { name: "Create" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-add-pool-dialog.png",
    });
  });

  test("Networks sub-tab shows DHCP options and Add Network button", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Networks sub-tab
    const networksTab = page.getByRole("tab", { name: "Networks" });
    await expect(networksTab).toBeVisible({ timeout: 10000 });
    await networksTab.click();

    // Verify network data (gateway, DNS, domain, NTP)
    await expect(page.getByText("192.168.88.0/24")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("192.168.88.1")).toBeVisible();
    await expect(page.getByText("8.8.8.8,8.8.4.4")).toBeVisible();
    await expect(page.getByText("pool.ntp.org")).toBeVisible();

    // Add Network button
    await expect(
      page.getByRole("button", { name: "Add Network" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-networks-tab.png",
    });
  });

  test("Add Network dialog has gateway, DNS, domain, NTP fields", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const networksTab = page.getByRole("tab", { name: "Networks" });
    await expect(networksTab).toBeVisible({ timeout: 10000 });
    await networksTab.click();

    // Click Add Network
    await page.getByRole("button", { name: "Add Network" }).click();

    // Dialog should have all DHCP option fields
    await expect(page.getByText("Add DHCP Network")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByPlaceholder("192.168.1.0/24")).toBeVisible();
    await expect(page.getByPlaceholder("192.168.1.1")).toBeVisible();
    await expect(page.getByPlaceholder("8.8.8.8,8.8.4.4")).toBeVisible();
    await expect(page.getByPlaceholder("local")).toBeVisible();
    await expect(page.getByPlaceholder("pool.ntp.org")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-add-network-dialog.png",
    });
  });

  test("Logs sub-tab shows DHCP log entries", async ({ page }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Logs sub-tab
    const logsTab = page.getByRole("tab", { name: "Logs" });
    await expect(logsTab).toBeVisible({ timeout: 10000 });
    await logsTab.click();

    // Verify log entries are shown
    await expect(
      page.getByText("assigned 192.168.88.100"),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("deassigned 192.168.88.101")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-logs-tab.png",
    });
  });

  test("switching between DHCP sub-tabs preserves state", async ({ page }) => {
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");

    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Navigate to Pools
    const poolsTab = page.getByRole("tab", { name: "IP Pools" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();
    await expect(poolsTab).toHaveAttribute("data-state", "active");

    // Navigate to Networks
    const networksTab = page.getByRole("tab", { name: "Networks" });
    await networksTab.click();
    await expect(networksTab).toHaveAttribute("data-state", "active");
    await expect(poolsTab).toHaveAttribute("data-state", "inactive");

    // Navigate back to Leases
    const leasesTab = page.getByRole("tab", { name: "Leases" });
    await leasesTab.click();
    await expect(leasesTab).toHaveAttribute("data-state", "active");
    await expect(networksTab).toHaveAttribute("data-state", "inactive");

    await page.screenshot({
      path: "tests/screenshots/dhcp-tab-switching.png",
    });
  });
});
