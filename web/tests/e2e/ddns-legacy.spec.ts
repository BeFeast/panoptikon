import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings page — legacy section visibility", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("shows Advanced / Legacy section heading", async ({ page }) => {
    await expect(
      page.getByText("Advanced / Legacy", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Advanced settings card is inside the Advanced / Legacy section", async ({
    page,
  }) => {
    const legacyHeading = page.getByText("Advanced / Legacy", { exact: true });
    await expect(legacyHeading).toBeVisible({ timeout: 10000 });

    // NPM was removed from settings nav (#492); only "Advanced" remains in this section
    await expect(page.getByText("Advanced", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Toggle legacy router visibility and other advanced options."),
    ).toBeVisible();
  });

  test("Advanced section subtitle is visible", async ({ page }) => {
    await expect(
      page.getByText("Power-user settings and legacy integrations."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Router description shows MikroTik integration", async ({
    page,
  }) => {
    const integrationsHeading = page.getByText("Integrations", { exact: true });
    await expect(integrationsHeading).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText("Configure MikroTik router integration."),
    ).toBeVisible();

    // Caddy Reverse Proxy is now a top-level page (/caddy), not listed in Settings Integrations.
    await expect(
      page.getByText("Primary reverse proxy — manage hosts via Caddy."),
    ).toHaveCount(0);

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

  test("Add Entry dialog does not show Router Type selector", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Entry" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    await expect(
      page.locator('[role="dialog"]').getByText("Router Type", { exact: true }),
    ).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/ddns-router-type-options.png",
    });
  });
});
