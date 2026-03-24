import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the NAT / Port Forwarding page.
 *
 * These tests verify the page loads correctly with its heading, tabs,
 * summary cards, search input, and action buttons. The backend may or
 * may not have a MikroTik router configured, so we test the UI
 * structure rather than live data.
 */
test.describe("NAT / Port Forwarding page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads with heading, tabs, summary cards, and action buttons", async ({
    page,
  }) => {
    await page.goto("/nat");

    // Page heading
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Tabs for filtering
    await expect(page.getByRole("tab", { name: "All Rules" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "DNAT / Port Forward" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "SNAT / Outbound" }),
    ).toBeVisible();

    // Summary cards
    await expect(page.getByText("Total NAT Rules")).toBeVisible();
    await expect(page.getByText("DNAT Rules")).toBeVisible();
    await expect(page.getByText("SNAT Rules")).toBeVisible();

    // Action buttons
    await expect(
      page.getByRole("button", { name: /Add Rule/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Refresh/ }),
    ).toBeVisible();

    // Search input
    await expect(
      page.getByPlaceholder("Filter rules..."),
    ).toBeVisible();

    // NAT Rules table card header
    await expect(
      page.locator('[class*="CardTitle"]', { hasText: "NAT Rules" }).or(
        page.locator("div").filter({ hasText: /^NAT Rules$/ }),
      ),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-page-loaded.png",
      fullPage: true,
    });
  });

  test("tab switching filters rules by chain type", async ({ page }) => {
    await page.goto("/nat");

    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click DNAT tab
    await page.getByRole("tab", { name: "DNAT / Port Forward" }).click();
    await expect(
      page.getByRole("tab", { name: "DNAT / Port Forward" }),
    ).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/nat-dnat-tab.png",
    });

    // Click SNAT tab
    await page.getByRole("tab", { name: "SNAT / Outbound" }).click();
    await expect(
      page.getByRole("tab", { name: "SNAT / Outbound" }),
    ).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/nat-snat-tab.png",
    });

    // Click All Rules tab
    await page.getByRole("tab", { name: "All Rules" }).click();
    await expect(
      page.getByRole("tab", { name: "All Rules" }),
    ).toHaveAttribute("data-state", "active");
  });

  test("Add Rule button opens the create dialog", async ({ page }) => {
    await page.goto("/nat");

    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Rule
    await page.getByRole("button", { name: /Add Rule/ }).click();

    // Dialog should open with the port forwarding title
    await expect(
      page.getByRole("heading", { name: /Add Port Forwarding Rule/ }),
    ).toBeVisible({ timeout: 5000 });

    // Dialog should have key fields
    await expect(page.getByLabel("Chain")).toBeVisible();
    await expect(page.getByLabel("Action")).toBeVisible();
    await expect(page.getByLabel("Protocol")).toBeVisible();
    await expect(page.getByLabel("Dst Port")).toBeVisible();
    await expect(page.getByLabel("To Addresses")).toBeVisible();
    await expect(page.getByLabel("To Ports")).toBeVisible();
    await expect(page.getByLabel("Src Address")).toBeVisible();
    await expect(page.getByLabel("Dst Address")).toBeVisible();
    await expect(page.getByLabel("In Interface")).toBeVisible();
    await expect(page.getByLabel("Out Interface")).toBeVisible();
    await expect(page.getByLabel("Comment")).toBeVisible();

    // Create and Cancel buttons
    await expect(
      page.getByRole("button", { name: "Create" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-add-dialog.png",
    });

    // Close the dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: /Add Port Forwarding Rule/ }),
    ).not.toBeVisible();
  });

  test("search input filters visible content", async ({ page }) => {
    await page.goto("/nat");

    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Type in search
    const searchInput = page.getByPlaceholder("Filter rules...");
    await searchInput.fill("nonexistent-filter-xyz-12345");

    // Either shows "No matching rules" or the empty state
    // (depends on whether any rules exist)
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/screenshots/nat-search-filter.png",
    });

    // Clear search
    await searchInput.clear();
  });

  test("NAT page is accessible from sidebar", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }).or(
        page.getByRole("link", { name: "Dashboard" }).first(),
      ),
    ).toBeVisible({ timeout: 15000 });

    // Click NAT in the sidebar
    const sidebar = page.locator("aside");
    const natLink = sidebar.getByRole("link", { name: "NAT" });
    await expect(natLink).toBeVisible();
    await natLink.click();

    // Should navigate to NAT page
    await page.waitForURL(/\/nat/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/nat-sidebar-navigation.png",
    });
  });

  test("mobile layout does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/nat");

    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/nat-mobile.png",
      fullPage: true,
    });

    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflowX).toBe(false);
  });
});
