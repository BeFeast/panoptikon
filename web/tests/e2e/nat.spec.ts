import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the NAT / Port Forwarding page.
 *
 * Uses API mocking since no real MikroTik router is available in CI.
 * Verifies page load, rule listing, add/edit dialog, and delete confirmation.
 */

const MOCK_SUMMARY = {
  mikrotik_available: true,
  mikrotik_rule_count: 3,
};

const MOCK_RULES = [
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
    out_interface: null,
    comment: "Web Server",
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
    out_interface: "ether1",
    comment: "Default masquerade",
    disabled: false,
  },
  {
    id: "*3",
    chain: "dstnat",
    action: "dst-nat",
    protocol: "tcp",
    src_address: null,
    dst_address: null,
    dst_port: "443",
    to_addresses: "192.168.1.50",
    to_ports: "443",
    out_interface: null,
    comment: "HTTPS forward",
    disabled: true,
  },
];

function setupMocks(page: import("@playwright/test").Page) {
  return Promise.all([
    page.route("**/api/v1/nat/summary", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SUMMARY),
      }),
    ),
    page.route("**/api/v1/nat/mikrotik/rules", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_RULES),
        });
      }
      // POST — create rule
      return route.fulfill({ status: 201 });
    }),
    page.route("**/api/v1/nat/mikrotik/rules/*", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 204 });
      }
      if (route.request().method() === "DELETE") {
        return route.fulfill({ status: 204 });
      }
      return route.continue();
    }),
  ]);
}

test.describe("NAT / Port Forwarding page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads with heading and summary card", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    // Heading
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary card — "MikroTik NAT Rules" title and count
    await expect(page.getByText("MikroTik NAT Rules")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("3")).toBeVisible({ timeout: 5000 });

    // Refresh and Add Rule buttons
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Rule" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-page-loaded.png",
      fullPage: true,
    });
  });

  test("NAT rules table displays mocked rules", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    // Wait for table to render
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15000 });

    // Column headers
    await expect(
      page.getByRole("columnheader", { name: "Chain" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Action" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Protocol" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Dst Port" }),
    ).toBeVisible();

    // First rule — Web Server (dst-nat, tcp, port 8080 → 192.168.1.100:80)
    await expect(page.getByRole("cell", { name: "Web Server" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "8080" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "192.168.1.100" }),
    ).toBeVisible();

    // Second rule — masquerade
    await expect(
      page.getByText("masquerade", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Default masquerade" }),
    ).toBeVisible();

    // Status badges — active and disabled
    await expect(page.getByText("active").first()).toBeVisible();
    await expect(page.getByText("disabled")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-rules-table.png",
      fullPage: true,
    });
  });

  test("search filters rules by comment", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    // Wait for table
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });

    // All rules visible initially
    await expect(page.getByRole("cell", { name: "Web Server" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Default masquerade" }),
    ).toBeVisible();

    // Type in search
    await page
      .getByPlaceholder("Filter by comment, action, destination port...")
      .fill("Web");

    // Only Web Server rule should remain
    await expect(page.getByRole("cell", { name: "Web Server" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Default masquerade" }),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-search-filter.png",
    });
  });

  test("Add Rule dialog opens with correct form fields", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    // Click Add Rule
    await page.getByRole("button", { name: "Add Rule" }).click();

    // Dialog should appear
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Dialog title
    await expect(
      dialog.getByText("Add MikroTik NAT Rule"),
    ).toBeVisible();

    // Form fields — labels are rendered as text, not htmlFor-connected
    await expect(dialog.getByText("Chain")).toBeVisible();
    await expect(dialog.getByText("Action")).toBeVisible();
    await expect(dialog.getByText("Protocol")).toBeVisible();
    await expect(dialog.getByText("Dst Port")).toBeVisible();
    await expect(dialog.getByText("To Addresses")).toBeVisible();
    await expect(dialog.getByText("To Ports")).toBeVisible();
    await expect(dialog.getByText("Comment")).toBeVisible();
    await expect(dialog.getByText("Disabled")).toBeVisible();

    // Default values populated in inputs
    await expect(dialog.getByPlaceholder("dstnat")).toHaveValue("dstnat");
    await expect(dialog.getByPlaceholder("dst-nat")).toHaveValue("dst-nat");
    await expect(dialog.getByPlaceholder("tcp")).toHaveValue("tcp");

    // Create and Cancel buttons
    await expect(
      dialog.getByRole("button", { name: "Create" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Cancel" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-add-dialog.png",
    });
  });

  test("create rule via Add Rule dialog triggers API", async ({ page }) => {
    await setupMocks(page);

    let createCalled = false;
    await page.route("**/api/v1/nat/mikrotik/rules", (route) => {
      if (route.request().method() === "POST") {
        createCalled = true;
        return route.fulfill({ status: 201 });
      }
      // GET — return rules
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RULES),
      });
    });

    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Add Rule" }).click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in form fields
    await dialog.getByPlaceholder("8080").fill("9090");
    await dialog.getByPlaceholder("192.168.1.100").fill("10.0.0.5");
    await dialog.getByPlaceholder("80").fill("8080");
    await dialog.getByPlaceholder("Web server").fill("Test NAT rule");

    // Click Create
    await dialog.getByRole("button", { name: "Create" }).click();

    // Toast confirmation
    await expect(
      page.getByText("MikroTik NAT rule created"),
    ).toBeVisible({ timeout: 10000 });

    expect(createCalled).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/nat-rule-created.png",
    });
  });

  test("delete confirmation dialog shows and triggers API", async ({
    page,
  }) => {
    await setupMocks(page);

    let deleteCalled = false;
    await page.route("**/api/v1/nat/mikrotik/rules/*", (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        return route.fulfill({ status: 204 });
      }
      return route.continue();
    });

    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    // Wait for table to render with rules
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("cell", { name: "Web Server" })).toBeVisible();

    // Click delete button on first rule (trash icon)
    const firstRow = page.getByRole("row").filter({ hasText: "Web Server" });
    await firstRow.getByRole("button").nth(1).click(); // second button is delete

    // Alert dialog should appear
    await expect(
      page.getByText("Delete MikroTik NAT Rule"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("Are you sure you want to delete this NAT rule"),
    ).toBeVisible();

    // Confirm delete
    await page.getByRole("button", { name: "Delete" }).click();

    // Toast
    await expect(
      page.getByText("Deleted MikroTik NAT rule"),
    ).toBeVisible({ timeout: 10000 });

    expect(deleteCalled).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/nat-rule-deleted.png",
    });
  });

  test("NAT link is visible in sidebar navigation", async ({ page }) => {
    await page.goto("/nat/");

    // NAT link in sidebar
    await expect(
      page.getByRole("link", { name: "NAT" }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/nat-sidebar-link.png",
    });
  });

  test("empty state shows when no NAT rules configured", async ({ page }) => {
    // Mock empty rules
    await page.route("**/api/v1/nat/summary", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mikrotik_available: true,
          mikrotik_rule_count: 0,
        }),
      }),
    );
    await page.route("**/api/v1/nat/mikrotik/rules", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );

    await page.goto("/nat/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("No NAT rules configured.")).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: "tests/screenshots/nat-empty-state.png",
    });
  });
});
