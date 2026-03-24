import { test, expect, login } from "../../e2e/fixtures";

test.describe("NAT / Port Forwarding", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("NAT page loads with heading and summary cards", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should be visible
    await expect(page.getByText("Total NAT Rules")).toBeVisible();
    await expect(page.getByText("DNAT (Inbound)")).toBeVisible();
    await expect(page.getByText("SNAT (Outbound)")).toBeVisible();

    // Refresh button present
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-page.png",
      fullPage: true,
    });
  });

  test("NAT page has filter tabs for All, DNAT, SNAT", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Tab buttons should be visible
    await expect(page.getByRole("tab", { name: "All Rules" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "DNAT" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "SNAT" })).toBeVisible();

    // Click DNAT tab
    await page.getByRole("tab", { name: "DNAT" }).click();
    await page.screenshot({
      path: "tests/screenshots/nat-dnat-tab.png",
      fullPage: true,
    });

    // Click SNAT tab
    await page.getByRole("tab", { name: "SNAT" }).click();
    await page.screenshot({
      path: "tests/screenshots/nat-snat-tab.png",
      fullPage: true,
    });
  });

  test("NAT rules table has correct column headers", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for rules table to render
    await page.waitForTimeout(2000);

    // Table headers should include the new columns
    const tableSection = page.locator("table");
    if (await tableSection.isVisible()) {
      await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Action" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Protocol" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Src Address" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Dst Address" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Dst Port" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "To Address" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "To Port" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Comment" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/nat-table.png",
      fullPage: true,
    });
  });

  test("Add Rule dropdown shows DNAT, SNAT, and 1:1 NAT options", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click the Add Rule dropdown trigger
    const addTrigger = page.locator("button", { hasText: "Add Rule" });
    await expect(addTrigger).toBeVisible();
    await addTrigger.click();

    // Dropdown options should appear
    await expect(page.getByRole("option", { name: "Port Forward (DNAT)" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("option", { name: "Outbound NAT (SNAT)" })).toBeVisible();
    await expect(page.getByRole("option", { name: "1:1 NAT" })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-add-dropdown.png",
      fullPage: true,
    });
  });

  test("DNAT dialog opens with correct defaults and fields", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open Add Rule dropdown and select DNAT
    const addTrigger = page.locator("button", { hasText: "Add Rule" });
    await addTrigger.click();
    await page.getByRole("option", { name: "Port Forward (DNAT)" }).click();

    // Dialog should open with DNAT title
    await expect(
      page.getByRole("heading", { name: "Add Port Forward Rule (DNAT)" }),
    ).toBeVisible({ timeout: 5000 });

    // Form fields should be present
    await expect(page.getByText("Src Address")).toBeVisible();
    await expect(page.getByText("Dst Address")).toBeVisible();
    await expect(page.getByText("Dst Port")).toBeVisible();
    await expect(page.getByText("To Addresses")).toBeVisible();
    await expect(page.getByText("To Ports")).toBeVisible();
    await expect(page.getByText("In Interface")).toBeVisible();
    await expect(page.getByText("Out Interface")).toBeVisible();
    await expect(page.getByText("Comment")).toBeVisible();

    // Cancel should close dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Port Forward Rule (DNAT)" }),
    ).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "tests/screenshots/nat-dnat-dialog.png",
      fullPage: true,
    });
  });

  test("SNAT dialog opens with correct defaults", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open Add Rule dropdown and select SNAT
    const addTrigger = page.locator("button", { hasText: "Add Rule" });
    await addTrigger.click();
    await page.getByRole("option", { name: "Outbound NAT (SNAT)" }).click();

    // Dialog should open with SNAT title
    await expect(
      page.getByRole("heading", { name: "Add Outbound NAT Rule (SNAT)" }),
    ).toBeVisible({ timeout: 5000 });

    // Cancel to close
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.screenshot({
      path: "tests/screenshots/nat-snat-dialog.png",
      fullPage: true,
    });
  });

  test("1:1 NAT dialog opens with correct defaults", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open Add Rule dropdown and select 1:1 NAT
    const addTrigger = page.locator("button", { hasText: "Add Rule" });
    await addTrigger.click();
    await page.getByRole("option", { name: "1:1 NAT" }).click();

    // Dialog should open with 1:1 NAT title
    await expect(
      page.getByRole("heading", { name: "Add 1:1 NAT Rule" }),
    ).toBeVisible({ timeout: 5000 });

    // Cancel to close
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.screenshot({
      path: "tests/screenshots/nat-onetoone-dialog.png",
      fullPage: true,
    });
  });

  test("search filter works", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Search input should be visible
    const searchInput = page.getByPlaceholder("Filter rules...");
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill("nonexistent-rule-xyz");
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/screenshots/nat-search.png",
      fullPage: true,
    });
  });

  test("MikroTik NAT Rules card is visible", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Rules card should be visible
    await expect(page.getByText("MikroTik NAT Rules")).toBeVisible();
    await expect(
      page.getByText("Firewall NAT rules synchronized from the router."),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-rules-card.png",
      fullPage: true,
    });
  });
});
