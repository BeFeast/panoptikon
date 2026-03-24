import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the Advanced Routing page.
 *
 * Tests page load, tab navigation, table rendering, and dialog interactions.
 * In test/CI environments where no real MikroTik router is connected, the API
 * returns 503, so the page may show empty tables or error states — both are valid.
 */
test.describe("Advanced Routing Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads with heading and tabs", async ({ page }) => {
    await page.goto("/advanced-routing/");

    // Main heading should be visible
    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Description text
    await expect(
      page.getByText("Policy-based routing"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-page.png",
    });
  });

  test("all four tabs are present", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Check all tabs exist
    await expect(page.getByRole("tab", { name: "Policy Routing" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Multi-WAN / Routes" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Gateway Monitor" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "BGP / OSPF" })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-tabs.png",
    });
  });

  test("Policy Routing tab shows routing rules and mangle tables", async ({
    page,
  }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Policy Routing should be the default active tab
    await expect(page.getByRole("tab", { name: "Policy Routing" })).toBeVisible();

    // Routing Rules card should be visible
    await expect(page.getByText("Routing Rules")).toBeVisible();
    // Mangle Rules card should be visible
    await expect(page.getByText("Mangle Rules (PBR Marking)")).toBeVisible();
    // Routing Tables card should be visible
    await expect(page.getByText("Routing Tables")).toBeVisible();

    // Add Rule button should be visible
    await expect(
      page.getByRole("button", { name: "Add Rule" }),
    ).toBeVisible();

    // Add Mangle button should be visible
    await expect(
      page.getByRole("button", { name: "Add Mangle" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-pbr-tab.png",
    });
  });

  test("Multi-WAN tab shows IP routes table", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Multi-WAN tab
    await page.getByRole("tab", { name: "Multi-WAN / Routes" }).click();

    // IP Routes card should be visible
    await expect(page.getByText("IP Routes")).toBeVisible();

    // Add Route button should be visible
    await expect(
      page.getByRole("button", { name: "Add Route" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-multiwan-tab.png",
    });
  });

  test("Gateway Monitor tab renders", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Gateway Monitor tab
    await page.getByRole("tab", { name: "Gateway Monitor" }).click();

    // Should see Gateway Status card
    await expect(page.getByText("Gateway Status")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-gateway-tab.png",
    });
  });

  test("BGP/OSPF tab shows protocol tables", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Click BGP/OSPF tab
    await page.getByRole("tab", { name: "BGP / OSPF" }).click();

    // Should see OSPF and BGP sections
    await expect(page.getByText("OSPF Instances")).toBeVisible();
    await expect(page.getByText("BGP Connections")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-bgp-ospf-tab.png",
    });
  });

  test("Add Routing Rule dialog opens and closes", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Rule button
    await page.getByRole("button", { name: "Add Rule" }).click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Add Routing Rule")).toBeVisible();

    // Form fields should be visible
    await expect(dialog.getByText("Source Address")).toBeVisible();
    await expect(dialog.getByText("Routing Table")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-rule-dialog.png",
    });

    // Cancel should close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("Add Mangle Rule dialog opens and closes", async ({ page }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Mangle button
    await page.getByRole("button", { name: "Add Mangle" }).click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Add Mangle Rule")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-mangle-dialog.png",
    });

    // Cancel should close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("Add Route dialog opens and closes on Multi-WAN tab", async ({
    page,
  }) => {
    await page.goto("/advanced-routing/");

    await expect(
      page.getByRole("heading", { name: "Advanced Routing" }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Multi-WAN tab
    await page.getByRole("tab", { name: "Multi-WAN / Routes" }).click();

    // Click Add Route button
    await page.getByRole("button", { name: "Add Route" }).click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Add Route")).toBeVisible();

    // Form fields
    await expect(dialog.getByText("Destination")).toBeVisible();
    await expect(dialog.getByText("Gateway")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-add-route-dialog.png",
    });

    // Cancel should close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("sidebar shows Advanced Routing link", async ({ page }) => {
    await page.goto("/dashboard/");

    await expect(
      page.getByRole("link", { name: "Dashboard" }).first(),
    ).toBeVisible({ timeout: 15000 });

    // The sidebar should contain the Adv. Routing link
    const sidebar = page.locator("aside");
    await expect(
      sidebar.getByRole("link", { name: "Adv. Routing" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-sidebar-link.png",
    });
  });
});
