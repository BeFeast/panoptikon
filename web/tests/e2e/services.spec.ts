import { test, expect, login } from "../../e2e/fixtures";

test.describe("Services page (Caddy + MikroTik)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/services/");
    await expect(
      page.getByRole("heading", { name: "Services", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("page loads with heading, status indicators, and action buttons", async ({
    page,
  }) => {
    // Heading
    await expect(
      page.getByRole("heading", { name: "Services", level: 1 }),
    ).toBeVisible();

    // Status indicators — scope to main to avoid strict mode conflict with sidebar links
    await expect(page.getByRole("main").getByText("Caddy")).toBeVisible();
    await expect(page.getByRole("main").getByText("MikroTik")).toBeVisible();

    // Action buttons
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Service" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/services-page.png",
      fullPage: true,
    });
  });

  test("empty state shows when no services exist", async ({ page }) => {
    // The page may have no services — check for empty state or table
    const emptyState = page.getByText("No services configured");
    const table = page.getByRole("table");

    // One of these should be visible
    await Promise.race([
      emptyState.waitFor({ state: "visible", timeout: 10000 }),
      table.waitFor({ state: "visible", timeout: 10000 }),
    ]);

    await page.screenshot({
      path: "tests/screenshots/services-empty-or-list.png",
      fullPage: true,
    });
  });

  test("Add Service dialog opens and shows form fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Service" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    // Form fields should be visible — scope to dialog to avoid strict mode conflict
    // with table headers (e.g. "Domain" column header is also in the DOM)
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByText("Service Name")).toBeVisible();
    await expect(dialog.getByText("Internal IP")).toBeVisible();
    await expect(dialog.getByText("Internal Port")).toBeVisible();
    await expect(dialog.getByText("Domain")).toBeVisible();
    await expect(dialog.getByText("Forward Scheme")).toBeVisible();
    await expect(dialog.getByText("Auto TLS")).toBeVisible();
    await expect(dialog.getByText("MikroTik Port-Forward")).toBeVisible();

    // Deploy button should be present but may be disabled
    await expect(
      page.getByRole("button", { name: "Deploy" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/services-add-dialog.png",
    });
  });

  test("Add Service dialog validates required fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Service" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    // Deploy button should be disabled when form is empty
    const deployBtn = page.getByRole("button", { name: "Deploy" });
    await expect(deployBtn).toBeDisabled();

    // Fill name only — still disabled
    await page.getByPlaceholder("My App").fill("Test Service");
    await expect(deployBtn).toBeDisabled();

    // Fill IP — still disabled
    await page.getByPlaceholder("10.10.0.50").fill("192.168.1.100");
    await expect(deployBtn).toBeDisabled();

    // Fill port — still disabled (no domain)
    await page.getByPlaceholder("8080").first().fill("3000");
    await expect(deployBtn).toBeDisabled();

    // Fill domain — now enabled
    await page.getByPlaceholder("myapp.oklabs.uk").fill("test.example.com");
    await expect(deployBtn).toBeEnabled();

    await page.screenshot({
      path: "tests/screenshots/services-add-validation.png",
    });
  });

  test("MikroTik port-forward section toggles", async ({ page }) => {
    await page.getByRole("button", { name: "Add Service" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    // Port-forward fields should not be visible initially
    await expect(page.getByText("External Port")).not.toBeVisible();

    // Toggle the MikroTik Port-Forward switch.
    // DOM structure: <label> is inside <div.flex.items-center.gap-2> (labelGroup),
    // which is inside <div.flex.items-center.justify-between> (row) alongside the switch.
    // We need to go up TWO levels from the label to reach the row that contains the switch.
    const pfSection = page
      .locator('[role="dialog"]')
      .getByText("MikroTik Port-Forward")
      .locator("../.."); // label → labelGroup → row (which contains the switch as sibling)
    const pfSwitch = pfSection.locator('button[role="switch"]');
    await pfSwitch.click();

    // Port-forward fields should now be visible
    await expect(page.getByText("External Port")).toBeVisible();
    await expect(page.getByText("Protocol")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/services-port-forward-toggle.png",
    });
  });

  test("table shows correct column headers when services exist", async ({
    page,
  }) => {
    // If there are services, check the table headers
    const table = page.getByRole("table");
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await expect(
        page.getByRole("columnheader", { name: "Domain" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Upstream" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "TLS" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Status" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Actions" }),
      ).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/services-table-headers.png",
      });
    }
  });

  test("NPM and VyOS references are NOT present", async ({ page }) => {
    const pageContent = await page.textContent("body");
    expect(pageContent).not.toContain("Nginx Proxy Manager");
    expect(pageContent).not.toContain("VyOS");
    expect(pageContent).not.toContain("NPM proxy");

    await page.screenshot({
      path: "tests/screenshots/services-no-npm-vyos.png",
    });
  });
});
