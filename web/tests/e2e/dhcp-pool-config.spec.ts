import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock MikroTik API responses for DHCP pool configuration testing.
 */
async function mockMikrotikDhcpApis(
  page: import("@playwright/test").Page,
) {
  // Settings: MikroTik enabled
  await page.route("**/api/v1/settings", async (route) => {
    const response = await route.fetch().catch(() => null);
    if (response && response.ok()) {
      const body = await response.json();
      body.mikrotik_enabled = true;
      body.mikrotik_url = "https://10.10.0.125";
      await route.fulfill({ json: body });
    } else {
      await route.fulfill({
        json: {
          mikrotik_enabled: true,
          mikrotik_url: "https://10.10.0.125",
        },
      });
    }
  });

  // MikroTik status
  await page.route("**/api/v1/mikrotik/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: true,
        version: "7.14.3",
        uptime: "3d12h",
        cpu_load: "12",
        total_memory: "268435456",
        free_memory: "134217728",
        board_name: "RB4011iGS+",
        architecture: "arm",
        platform: "MikroTik",
      },
    }),
  );

  // DHCP leases
  await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
    route.fulfill({
      json: [
        {
          address: "192.168.88.100",
          mac_address: "AA:BB:CC:DD:EE:01",
          host_name: "workstation-1",
          status: "bound",
          expires_after: "00:09:30",
          server: "dhcp1",
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
          server: "dhcp1",
          dynamic: false,
          disabled: false,
          comment: "Reserved for server",
        },
      ],
    }),
  );

  // DHCP servers
  await page.route("**/api/v1/mikrotik/dhcp-servers", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            name: "dhcp1",
            interface: "bridge",
            address_pool: "dhcp-pool",
            lease_time: "00:10:00",
            disabled: false,
            dynamic: false,
            invalid: false,
          },
          {
            id: "*2",
            name: "dhcp-vlan20",
            interface: "vlan20",
            address_pool: "vlan20-pool",
            lease_time: "01:00:00",
            disabled: false,
            dynamic: false,
            invalid: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // DHCP pools
  await page.route("**/api/v1/mikrotik/dhcp-pools", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            name: "dhcp-pool",
            ranges: "192.168.88.100-192.168.88.200",
            comment: "Main LAN pool",
            dynamic: false,
          },
          {
            id: "*2",
            name: "vlan20-pool",
            ranges: "10.20.0.100-10.20.0.200",
            comment: "VLAN 20 pool",
            dynamic: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // DHCP networks
  await page.route("**/api/v1/mikrotik/dhcp-networks", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            address: "192.168.88.0/24",
            gateway: "192.168.88.1",
            dns_server: "8.8.8.8,8.8.4.4",
            domain: "home.local",
            ntp_server: "pool.ntp.org",
            comment: "Main LAN",
            dynamic: false,
          },
        ],
      });
    }
    return route.fulfill({ status: 204 });
  });

  // DHCP logs
  await page.route("**/api/v1/mikrotik/logs/dhcp", (route) =>
    route.fulfill({
      json: [
        {
          id: "*1",
          time: "Mar/24/2026 10:30:00",
          topics: "dhcp,info",
          message:
            "dhcp1 assigned 192.168.88.100 to AA:BB:CC:DD:EE:01",
        },
        {
          id: "*2",
          time: "Mar/24/2026 10:25:00",
          topics: "dhcp,info",
          message: "dhcp1 deassigned 192.168.88.101 from AA:BB:CC:DD:EE:03",
        },
      ],
    }),
  );

  // Mock remaining MikroTik endpoints
  await page.route("**/api/v1/mikrotik/**", (route) =>
    route.fulfill({ json: [] }),
  );
}

test.describe("MikroTik DHCP Pool Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockMikrotikDhcpApis(page);
    await page.goto("/router/mikrotik");
    await page.waitForLoadState("networkidle");
  });

  test("DHCP tab shows sub-tabs for Leases, Servers, Pools, Options, Logs", async ({
    page,
  }) => {
    // Click top-level DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Verify all sub-tabs are visible
    await expect(page.getByRole("tab", { name: "Leases" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("tab", { name: "Servers" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pools" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Options" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Logs" })).toBeVisible();

    // Leases should be default active
    await expect(page.getByRole("tab", { name: "Leases" })).toHaveAttribute(
      "data-state",
      "active",
    );

    await page.screenshot({
      path: "tests/screenshots/dhcp-pool-config-tabs.png",
    });
  });

  test("Servers sub-tab shows DHCP server list with Add button", async ({
    page,
  }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Navigate to Servers sub-tab
    const serversTab = page.getByRole("tab", { name: "Servers" });
    await expect(serversTab).toBeVisible({ timeout: 10000 });
    await serversTab.click();
    await expect(serversTab).toHaveAttribute("data-state", "active");

    // Verify server data renders
    await expect(page.getByText("dhcp1")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("dhcp-vlan20")).toBeVisible();
    await expect(page.getByText("bridge")).toBeVisible();

    // Add Server button should be visible
    await expect(
      page.getByRole("button", { name: "Add Server" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-servers-tab.png",
    });
  });

  test("Pools sub-tab shows IP pool list with ranges", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Navigate to Pools sub-tab
    const poolsTab = page.getByRole("tab", { name: "Pools" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Verify pool data renders
    await expect(page.getByText("dhcp-pool")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("192.168.88.100-192.168.88.200"),
    ).toBeVisible();
    await expect(page.getByText("Main LAN pool")).toBeVisible();

    // Add Pool button should be visible
    await expect(
      page.getByRole("button", { name: "Add Pool" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-pools-tab.png",
    });
  });

  test("Options sub-tab shows DHCP network options (gateway, DNS, domain, NTP)", async ({
    page,
  }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Navigate to Options sub-tab
    const optionsTab = page.getByRole("tab", { name: "Options" });
    await expect(optionsTab).toBeVisible({ timeout: 10000 });
    await optionsTab.click();

    // Verify network options render
    await expect(page.getByText("192.168.88.0/24")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("192.168.88.1")).toBeVisible();
    await expect(page.getByText("8.8.8.8,8.8.4.4")).toBeVisible();
    await expect(page.getByText("home.local")).toBeVisible();
    await expect(page.getByText("pool.ntp.org")).toBeVisible();

    // Add Network button should be visible
    await expect(
      page.getByRole("button", { name: "Add Network" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-network-options-tab.png",
    });
  });

  test("Logs sub-tab shows DHCP log entries", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Navigate to Logs sub-tab
    const logsTab = page.getByRole("tab", { name: "Logs" });
    await expect(logsTab).toBeVisible({ timeout: 10000 });
    await logsTab.click();

    // Verify log entries render
    await expect(
      page.getByText("dhcp1 assigned 192.168.88.100"),
    ).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/dhcp-logs-tab.png",
    });
  });

  test("Add Server dialog opens and has required fields", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const serversTab = page.getByRole("tab", { name: "Servers" });
    await expect(serversTab).toBeVisible({ timeout: 10000 });
    await serversTab.click();

    // Click Add Server
    await page.getByRole("button", { name: "Add Server" }).click();

    // Dialog should open
    await expect(
      page.getByRole("heading", { name: "Add DHCP Server" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify form fields exist
    await expect(page.getByPlaceholder("dhcp1")).toBeVisible();
    await expect(page.getByPlaceholder("bridge")).toBeVisible();
    await expect(page.getByPlaceholder("dhcp-pool")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-add-server-dialog.png",
    });
  });

  test("Add Pool dialog opens and has required fields", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const poolsTab = page.getByRole("tab", { name: "Pools" });
    await expect(poolsTab).toBeVisible({ timeout: 10000 });
    await poolsTab.click();

    // Click Add Pool
    await page.getByRole("button", { name: "Add Pool" }).click();

    // Dialog should open
    await expect(
      page.getByRole("heading", { name: "Add IP Pool" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify form fields exist
    await expect(
      page.getByPlaceholder("192.168.1.100-192.168.1.200"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-add-pool-dialog.png",
    });
  });

  test("Add Network dialog opens with DHCP option fields", async ({
    page,
  }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const optionsTab = page.getByRole("tab", { name: "Options" });
    await expect(optionsTab).toBeVisible({ timeout: 10000 });
    await optionsTab.click();

    // Click Add Network
    await page.getByRole("button", { name: "Add Network" }).click();

    // Dialog should open
    await expect(
      page.getByRole("heading", { name: "Add DHCP Network" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify DHCP option fields exist
    await expect(page.getByPlaceholder("192.168.1.0/24")).toBeVisible();
    await expect(page.getByPlaceholder("192.168.1.1")).toBeVisible();
    await expect(page.getByPlaceholder("8.8.8.8,8.8.4.4")).toBeVisible();
    await expect(page.getByPlaceholder("example.local")).toBeVisible();
    await expect(page.getByPlaceholder("pool.ntp.org")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dhcp-add-network-dialog.png",
    });
  });

  test("switching between DHCP sub-tabs preserves state", async ({ page }) => {
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const leasesTab = page.getByRole("tab", { name: "Leases" });
    const serversTab = page.getByRole("tab", { name: "Servers" });
    const poolsTab = page.getByRole("tab", { name: "Pools" });

    await expect(leasesTab).toBeVisible({ timeout: 10000 });

    // Switch to Servers
    await serversTab.click();
    await expect(serversTab).toHaveAttribute("data-state", "active");
    await expect(leasesTab).toHaveAttribute("data-state", "inactive");

    // Switch to Pools
    await poolsTab.click();
    await expect(poolsTab).toHaveAttribute("data-state", "active");
    await expect(serversTab).toHaveAttribute("data-state", "inactive");

    // Switch back to Leases
    await leasesTab.click();
    await expect(leasesTab).toHaveAttribute("data-state", "active");
    await expect(poolsTab).toHaveAttribute("data-state", "inactive");

    await page.screenshot({
      path: "tests/screenshots/dhcp-sub-tab-switching.png",
    });
  });
});
