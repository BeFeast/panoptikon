import { test, expect, login } from "../../e2e/fixtures";

/**
 * Mock API responses for NAT page so it renders in CI
 * (where no real MikroTik router is available).
 */
async function mockNatApis(page: import("@playwright/test").Page) {
  // NAT summary
  await page.route("**/api/v1/nat/summary", (route) =>
    route.fulfill({
      json: {
        mikrotik_available: true,
        mikrotik_rule_count: 4,
      },
    }),
  );

  // MikroTik NAT rules - mixed DNAT, SNAT, and 1:1 NAT rules
  await page.route("**/api/v1/nat/mikrotik/rules", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [
          {
            id: "*1",
            chain: "dstnat",
            action: "dst-nat",
            protocol: "tcp",
            src_address: null,
            dst_address: null,
            dst_port: "8080",
            to_addresses: "192.168.1.100",
            to_ports: "80",
            in_interface: "ether1",
            out_interface: null,
            comment: "Web server forward",
            disabled: false,
          },
          {
            id: "*2",
            chain: "srcnat",
            action: "masquerade",
            protocol: null,
            src_address: null,
            dst_address: null,
            dst_port: null,
            to_addresses: null,
            to_ports: null,
            in_interface: null,
            out_interface: "ether1",
            comment: "Default masquerade",
            disabled: false,
          },
          {
            id: "*3",
            chain: "dstnat",
            action: "dst-nat",
            protocol: null,
            src_address: null,
            dst_address: "203.0.113.10",
            dst_port: null,
            to_addresses: "192.168.1.50",
            to_ports: null,
            in_interface: null,
            out_interface: null,
            comment: "1:1 NAT mapping",
            disabled: false,
          },
          {
            id: "*4",
            chain: "srcnat",
            action: "src-nat",
            protocol: null,
            src_address: "10.0.0.0/24",
            dst_address: null,
            dst_port: null,
            to_addresses: "203.0.113.5",
            to_ports: null,
            in_interface: null,
            out_interface: "ether1",
            comment: "Outbound SNAT",
            disabled: true,
          },
        ],
      });
    }
    // POST — create
    return route.fulfill({ status: 201 });
  });

  // PUT — update
  await page.route("**/api/v1/nat/mikrotik/rules/*", (route) => {
    if (route.request().method() === "PUT") {
      return route.fulfill({ status: 204 });
    }
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });
}

test.describe("NAT / Port Forwarding page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockNatApis(page);
  });

  test("page loads with heading and summary cards", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Verify page heading
    const heading = page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Verify summary cards exist
    await expect(page.getByText("Total NAT Rules")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Port Forwarding")).toBeVisible();
    await expect(page.getByText("1:1 NAT")).toBeVisible();
    await expect(page.getByText("Outbound NAT")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-page-loaded.png",
    });
  });

  test("NAT rules table displays rules with correct data", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Wait for table to load
    await expect(page.getByText("Web server forward")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Default masquerade")).toBeVisible();
    await expect(page.getByText("1:1 NAT mapping")).toBeVisible();
    await expect(page.getByText("Outbound SNAT")).toBeVisible();

    // Verify action badges
    await expect(page.getByText("dst-nat").first()).toBeVisible();
    await expect(page.getByText("masquerade")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-rules-table.png",
    });
  });

  test("tabs filter rules by NAT type", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Wait for rules to load
    await expect(page.getByText("Web server forward")).toBeVisible({ timeout: 15000 });

    // Click Port Forwarding tab
    const portFwdTab = page.getByRole("tab", { name: "Port Forwarding" });
    await expect(portFwdTab).toBeVisible({ timeout: 10000 });
    await portFwdTab.click();

    // Should show port forwarding rule but not SNAT/masquerade rules
    await expect(page.getByText("Web server forward")).toBeVisible();
    // The masquerade and outbound SNAT rules should be filtered out
    await expect(page.getByText("Default masquerade")).not.toBeVisible();
    await expect(page.getByText("Outbound SNAT")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-port-forwarding-tab.png",
    });

    // Click Outbound NAT tab
    const outboundTab = page.getByRole("tab", { name: "Outbound NAT" });
    await outboundTab.click();

    // Should show SNAT/masquerade rules
    await expect(page.getByText("Default masquerade")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Outbound SNAT")).toBeVisible();
    // DNAT rules should be filtered out
    await expect(page.getByText("Web server forward")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-outbound-tab.png",
    });

    // Click 1:1 NAT tab
    const oneToOneTab = page.getByRole("tab", { name: "1:1 NAT" });
    await oneToOneTab.click();

    // Should show only 1:1 NAT rule
    await expect(page.getByText("1:1 NAT mapping")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Web server forward")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-1to1-tab.png",
    });

    // Click All Rules tab to go back
    const allTab = page.getByRole("tab", { name: "All Rules" });
    await allTab.click();

    // All rules should be visible again
    await expect(page.getByText("Web server forward")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Default masquerade")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-all-rules-tab.png",
    });
  });

  test("add rule dialog opens with correct fields", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Rule button
    const addBtn = page.getByRole("button", { name: "Add Rule" });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // Dialog should appear
    await expect(page.getByText("Add MikroTik NAT Rule")).toBeVisible({ timeout: 10000 });

    // Verify all form fields are present
    await expect(page.getByLabel("Chain")).toBeVisible();
    await expect(page.getByLabel("Action")).toBeVisible();
    await expect(page.getByLabel("Protocol")).toBeVisible();
    await expect(page.getByLabel("Dst Port")).toBeVisible();
    await expect(page.getByLabel("Src Address")).toBeVisible();
    await expect(page.getByLabel("Dst Address")).toBeVisible();
    await expect(page.getByLabel("To Addresses")).toBeVisible();
    await expect(page.getByLabel("To Ports")).toBeVisible();
    await expect(page.getByLabel("In Interface")).toBeVisible();
    await expect(page.getByLabel("Out Interface")).toBeVisible();
    await expect(page.getByLabel("Comment")).toBeVisible();

    // Verify Create button is present
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-add-rule-dialog.png",
    });
  });

  test("search filters rules", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Wait for rules to load
    await expect(page.getByText("Web server forward")).toBeVisible({ timeout: 15000 });

    // Search for "masquerade"
    const searchInput = page.getByPlaceholder("Filter rules...");
    await searchInput.fill("masquerade");

    // Only masquerade rule should be visible
    await expect(page.getByText("Default masquerade")).toBeVisible();
    await expect(page.getByText("Web server forward")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-search-filter.png",
    });
  });

  test("disabled rule shows correct status badge", async ({ page }) => {
    await page.goto("/nat");
    await page.waitForLoadState("networkidle");

    // Wait for rules to load
    await expect(page.getByText("Outbound SNAT")).toBeVisible({ timeout: 15000 });

    // Verify the disabled badge is visible for the SNAT rule
    const disabledBadges = page.locator("text=disabled");
    const count = await disabledBadges.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await page.screenshot({
      path: "tests/screenshots/nat-disabled-badge.png",
    });
  });
});
