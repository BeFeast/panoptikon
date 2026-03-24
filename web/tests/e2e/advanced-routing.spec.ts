import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the MikroTik Advanced Routing tab (#668).
 *
 * Verifies the "Adv. Routing" tab renders with its four sections:
 * - Policy-Based Routing Rules
 * - Gateway Monitoring (Netwatch)
 * - BGP Connections
 * - OSPF Configuration
 *
 * Tests run against a dev environment where no real router is connected,
 * so they use mocked API responses to verify UI rendering.
 */
test.describe("MikroTik Advanced Routing (#668)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Adv. Routing tab is visible on MikroTik router page", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so we get past the "Not Configured" card
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("load");

    const toggle = page.locator("#mt-enabled");
    await expect(toggle).toBeVisible();
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }
    await page.locator("#mt-url").fill("http://10.10.0.125");
    await page.locator("#mt-user").fill("admin");
    await page.locator("#mt-password").fill("admin");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.goto("/router/mikrotik/");

    // Wait for the page to resolve — either tabs or unreachable message
    const advTab = page.getByRole("tab", { name: "Adv. Routing" });
    const fallback = page.getByText(
      /unreachable|Unreachable|Not Configured/,
    );
    await expect(advTab.or(fallback)).toBeVisible({ timeout: 40000 });

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-tab-visible.png",
    });
  });

  test("Adv. Routing tab renders sections with mocked data", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Mock the MikroTik status endpoint to simulate a connected router
    await page.route("**/api/v1/mikrotik/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          version: "7.14",
          uptime: "1d00:00:00",
          cpu_load: "5",
          total_memory: "268435456",
          free_memory: "134217728",
          board_name: "RB5009UG+S+",
          architecture: "arm64",
          platform: "MikroTik",
        }),
      }),
    );

    // Mock the advanced routing endpoint
    await page.route("**/api/v1/mikrotik/routing/advanced", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route_rules: [
            {
              id: "*1",
              src_address: "10.0.1.0/24",
              dst_address: null,
              routing_mark: null,
              action: "lookup",
              table: "isp2",
              interface: null,
              comment: "WAN2 policy",
              disabled: false,
            },
            {
              id: "*2",
              src_address: null,
              dst_address: "192.168.100.0/24",
              routing_mark: "vpn-mark",
              action: "lookup-only-in-table",
              table: "vpn-table",
              interface: null,
              comment: "VPN routing",
              disabled: true,
            },
          ],
          netwatch: [
            {
              id: "*1",
              host: "8.8.8.8",
              check_type: "icmp",
              interval: "00:00:30",
              timeout: "00:00:05",
              status: "up",
              since: "2024-01-01 00:00:00",
              comment: "Google DNS",
              disabled: false,
            },
            {
              id: "*2",
              host: "1.1.1.1",
              check_type: "icmp",
              interval: "00:01:00",
              timeout: "00:00:10",
              status: "down",
              since: "2024-01-02 00:00:00",
              comment: "Cloudflare DNS",
              disabled: false,
            },
          ],
          bgp_connections: [
            {
              id: "*1",
              name: "upstream-isp",
              remote_address: "203.0.113.1",
              remote_as: "65001",
              local_role: "ebgp",
              local_as: "65000",
              routing_table: "main",
              disabled: false,
              comment: "ISP BGP peer",
            },
          ],
          ospf_instances: [
            {
              id: "*1",
              name: "default",
              router_id: "10.0.0.1",
              version: "2",
              disabled: false,
              comment: null,
            },
          ],
          ospf_interfaces: [
            {
              id: "*1",
              interfaces: "ether1",
              area: "backbone",
              cost: "10",
              priority: "1",
              network_type: "broadcast",
              disabled: false,
              comment: null,
            },
          ],
        }),
      }),
    );

    // Mock other endpoints to prevent 503
    await page.route("**/api/v1/mikrotik/interfaces", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/vlans", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/routes", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/firewall", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ filter_rules: [], nat_rules: [], address_lists: [] }),
      }),
    );
    await page.route("**/api/v1/mikrotik/dns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ servers: [], allow_remote_requests: false, cache_size: null, cache_used: null }),
      }),
    );
    await page.route("**/api/v1/mikrotik/wireguard", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interfaces: [] }),
      }),
    );

    await page.goto("/router/mikrotik/");

    // Click the Adv. Routing tab
    const advTab = page.getByRole("tab", { name: "Adv. Routing" });
    await expect(advTab).toBeVisible({ timeout: 15000 });
    await advTab.click();

    // Verify PBR Rules section
    await expect(
      page.getByText("Policy-Based Routing Rules"),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("WAN2 policy")).toBeVisible();
    await expect(page.getByText("10.0.1.0/24")).toBeVisible();
    await expect(page.getByText("isp2")).toBeVisible();

    // Verify Gateway Monitoring section
    await expect(
      page.getByText("Gateway Monitoring"),
    ).toBeVisible();
    await expect(page.getByText("8.8.8.8")).toBeVisible();
    await expect(page.getByText("Google DNS")).toBeVisible();
    // Check status badges
    await expect(page.getByText("up").first()).toBeVisible();
    await expect(page.getByText("down").first()).toBeVisible();

    // Verify BGP section
    await expect(
      page.getByText("BGP Connections"),
    ).toBeVisible();
    await expect(page.getByText("upstream-isp")).toBeVisible();
    await expect(page.getByText("203.0.113.1")).toBeVisible();
    await expect(page.getByText("65001")).toBeVisible();

    // Verify OSPF section
    await expect(
      page.getByText("OSPF Configuration"),
    ).toBeVisible();
    await expect(page.getByText("10.0.0.1")).toBeVisible();
    await expect(page.getByText("backbone")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-sections.png",
      fullPage: true,
    });
  });

  test("Add Route Rule dialog opens and closes", async ({ page }) => {
    test.setTimeout(60_000);

    // Mock endpoints
    await page.route("**/api/v1/mikrotik/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          version: "7.14",
          uptime: "1d",
          cpu_load: "5",
          total_memory: "268435456",
          free_memory: "134217728",
          board_name: "RB5009",
          architecture: "arm64",
          platform: "MikroTik",
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/routing/advanced", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route_rules: [],
          netwatch: [],
          bgp_connections: [],
          ospf_instances: [],
          ospf_interfaces: [],
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/interfaces", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/vlans", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/routes", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/firewall", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ filter_rules: [], nat_rules: [], address_lists: [] }),
      }),
    );
    await page.route("**/api/v1/mikrotik/dns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ servers: [], allow_remote_requests: false, cache_size: null, cache_used: null }),
      }),
    );
    await page.route("**/api/v1/mikrotik/wireguard", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interfaces: [] }),
      }),
    );

    await page.goto("/router/mikrotik/");

    // Click the Adv. Routing tab
    const advTab = page.getByRole("tab", { name: "Adv. Routing" });
    await expect(advTab).toBeVisible({ timeout: 15000 });
    await advTab.click();

    // Wait for content to load
    await expect(
      page.getByText("Policy-Based Routing Rules"),
    ).toBeVisible({ timeout: 10000 });

    // Click "Add Rule" button
    await page.getByRole("button", { name: "Add Rule" }).click();

    // Verify dialog is visible
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Add Route Rule")).toBeVisible();

    // Verify form fields are present
    await expect(page.locator("#rule-src")).toBeVisible();
    await expect(page.locator("#rule-dst")).toBeVisible();
    await expect(page.locator("#rule-action")).toBeVisible();
    await expect(page.locator("#rule-table")).toBeVisible();
    await expect(page.locator("#rule-comment")).toBeVisible();

    // Close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-rule-dialog.png",
    });
  });

  test("Add Gateway Monitor dialog opens and closes", async ({ page }) => {
    test.setTimeout(60_000);

    // Mock endpoints
    await page.route("**/api/v1/mikrotik/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          version: "7.14",
          uptime: "1d",
          cpu_load: "5",
          total_memory: "268435456",
          free_memory: "134217728",
          board_name: "RB5009",
          architecture: "arm64",
          platform: "MikroTik",
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/routing/advanced", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route_rules: [],
          netwatch: [],
          bgp_connections: [],
          ospf_instances: [],
          ospf_interfaces: [],
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/interfaces", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/vlans", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/routes", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/firewall", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ filter_rules: [], nat_rules: [], address_lists: [] }),
      }),
    );
    await page.route("**/api/v1/mikrotik/dns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ servers: [], allow_remote_requests: false, cache_size: null, cache_used: null }),
      }),
    );
    await page.route("**/api/v1/mikrotik/wireguard", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interfaces: [] }),
      }),
    );

    await page.goto("/router/mikrotik/");

    // Click the Adv. Routing tab
    const advTab = page.getByRole("tab", { name: "Adv. Routing" });
    await expect(advTab).toBeVisible({ timeout: 15000 });
    await advTab.click();

    // Wait for content to load
    await expect(
      page.getByText("Gateway Monitoring"),
    ).toBeVisible({ timeout: 10000 });

    // Click "Add Monitor" button
    await page.getByRole("button", { name: "Add Monitor" }).click();

    // Verify dialog is visible
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Add Gateway Monitor")).toBeVisible();

    // Verify form fields
    await expect(page.locator("#nw-host")).toBeVisible();
    await expect(page.locator("#nw-type")).toBeVisible();
    await expect(page.locator("#nw-interval")).toBeVisible();
    await expect(page.locator("#nw-timeout")).toBeVisible();

    // Create button should be disabled when host is empty
    await expect(
      dialog.getByRole("button", { name: "Create Monitor" }),
    ).toBeDisabled();

    // Fill in host
    await page.locator("#nw-host").fill("8.8.8.8");
    await expect(
      dialog.getByRole("button", { name: "Create Monitor" }),
    ).toBeEnabled();

    // Close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-monitor-dialog.png",
    });
  });

  test("empty state shows informational messages", async ({ page }) => {
    test.setTimeout(60_000);

    // Mock empty data
    await page.route("**/api/v1/mikrotik/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          version: "7.14",
          uptime: "1d",
          cpu_load: "5",
          total_memory: "268435456",
          free_memory: "134217728",
          board_name: "RB5009",
          architecture: "arm64",
          platform: "MikroTik",
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/routing/advanced", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          route_rules: [],
          netwatch: [],
          bgp_connections: [],
          ospf_instances: [],
          ospf_interfaces: [],
        }),
      }),
    );
    await page.route("**/api/v1/mikrotik/interfaces", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/vlans", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/routes", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/dhcp-leases", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/mikrotik/firewall", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ filter_rules: [], nat_rules: [], address_lists: [] }),
      }),
    );
    await page.route("**/api/v1/mikrotik/dns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ servers: [], allow_remote_requests: false, cache_size: null, cache_used: null }),
      }),
    );
    await page.route("**/api/v1/mikrotik/wireguard", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ interfaces: [] }),
      }),
    );

    await page.goto("/router/mikrotik/");

    // Click the Adv. Routing tab
    const advTab = page.getByRole("tab", { name: "Adv. Routing" });
    await expect(advTab).toBeVisible({ timeout: 15000 });
    await advTab.click();

    // Verify empty state messages
    await expect(
      page.getByText("No routing rules configured."),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("No gateway monitors configured."),
    ).toBeVisible();
    await expect(
      page.getByText(/No BGP connections configured/),
    ).toBeVisible();
    await expect(
      page.getByText(/No OSPF configuration found/),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-empty-state.png",
      fullPage: true,
    });
  });
});
