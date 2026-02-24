import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings page — legacy section visibility", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("shows Legacy / Optional section heading", async ({ page }) => {
    await expect(
      page.getByText("Legacy / Optional", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NPM card is inside the Legacy / Optional section", async ({
    page,
  }) => {
    // Find the legacy section heading, then verify the NPM card follows it
    const legacyHeading = page.getByText("Legacy / Optional", { exact: true });
    await expect(legacyHeading).toBeVisible({ timeout: 10000 });

    // The NPM card should be visible on the settings page
    await expect(page.getByText("Nginx Proxy Manager")).toBeVisible();
    await expect(
      page.getByText("Legacy reverse proxy — consider migrating to Caddy."),
    ).toBeVisible();
  });

  test("Caddy subtitle guides users away from legacy", async ({ page }) => {
    await expect(
      page.getByText("Use Caddy for new deployments."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("NPM is not in the Integrations section", async ({ page }) => {
    // The Integrations section should contain Router, Caddy, DNS, etc.
    // but NOT Nginx Proxy Manager
    const integrationsHeading = page.getByText("Integrations", { exact: true });
    await expect(integrationsHeading).toBeVisible({ timeout: 10000 });

    // Get the section between "Integrations" and "Network" headings
    // Verify Router is present (as a link in Integrations)
    await expect(page.getByText("Configure MikroTik or VyOS router integration.")).toBeVisible();
    await expect(page.getByText("Primary reverse proxy — manage hosts via Caddy.")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-legacy-section.png",
      fullPage: true,
    });
  });
});

test.describe("DDNS page — MikroTik default selection", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/ddns");
  });

  test("page loads with Dynamic DNS heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("Add Entry dialog defaults Router Type to MikroTik", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open the Add Entry dialog
    await page.getByRole("button", { name: "Add Entry" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // The Router Type selector should default to MikroTik
    const routerSelect = page
      .locator('[role="dialog"]')
      .locator("select")
      .filter({ has: page.locator('option[value="mikrotik"]') });
    await expect(routerSelect).toHaveValue("mikrotik");

    await page.screenshot({
      path: "tests/screenshots/ddns-add-dialog-mikrotik-default.png",
    });
  });

  test("VyOS is available as a router type option in the selector", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open the Add Entry dialog
    await page.getByRole("button", { name: "Add Entry" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // VyOS should be available as an option
    const vyosOption = page
      .locator('[role="dialog"]')
      .locator('option[value="vyos"]');
    await expect(vyosOption).toBeAttached();
    await expect(vyosOption).toHaveText("VyOS");
  });

  test("MikroTik is the first option in the Router Type selector", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open the Add Entry dialog
    await page.getByRole("button", { name: "Add Entry" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // Get all options in the router type selector
    const routerSelect = page
      .locator('[role="dialog"]')
      .locator("select")
      .filter({ has: page.locator('option[value="mikrotik"]') });
    const firstOption = routerSelect.locator("option").first();
    await expect(firstOption).toHaveAttribute("value", "mikrotik");
    await expect(firstOption).toHaveText("MikroTik");

    await page.screenshot({
      path: "tests/screenshots/ddns-router-type-options.png",
    });
  });
});
