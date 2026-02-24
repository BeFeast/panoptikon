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

  test("NPM card is inside the Advanced / Legacy section", async ({ page }) => {
    const legacyHeading = page.getByText("Advanced / Legacy", { exact: true });
    await expect(legacyHeading).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Nginx Proxy Manager")).toBeVisible();
    await expect(
      page.getByText("Legacy reverse proxy — consider migrating to Caddy."),
    ).toBeVisible();
  });

  test("Advanced section subtitle is visible", async ({ page }) => {
    await expect(
      page.getByText("Advanced options and legacy integrations."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Router description adapts when VyOS is not configured", async ({
    page,
  }) => {
    const integrationsHeading = page.getByText("Integrations", { exact: true });
    await expect(integrationsHeading).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText("Configure MikroTik router integration."),
    ).toBeVisible();
    await expect(
      page.getByText("Primary reverse proxy — manage hosts via Caddy."),
    ).toBeVisible();

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

  test("Add Entry dialog hides Router Type selector when VyOS is unavailable", async ({
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
  });

  test("VyOS option is not shown in Add Entry dialog when not configured", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Dynamic DNS", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Entry" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    const vyosOption = page
      .locator('[role="dialog"]')
      .locator('option[value="vyos"]');
    await expect(vyosOption).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/ddns-router-type-options.png",
    });
  });
});
