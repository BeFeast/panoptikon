import { test, expect, login } from "../../e2e/fixtures";

/**
 * Smoke tests — lightweight checks that key pages load without crashing.
 * Run after every deploy to verify the application is functional.
 *
 * Tag: @smoke (used by scripts/smoke-test.sh --grep "@smoke")
 */

test.describe("@smoke Post-deploy smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("@smoke login page loads", async ({ page }) => {
    // Already logged in via beforeEach — verify we reached a valid page
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("@smoke dashboard loads with stat cards", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Router Status")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Active Devices")).toBeVisible();
  });

  test("@smoke devices page loads", async ({ page }) => {
    await page.goto("/devices/");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("@smoke settings router page loads", async ({ page }) => {
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
  });

  test("@smoke settings xiaomi page loads", async ({ page }) => {
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
  });

  test("@smoke navigation sidebar renders", async ({ page }) => {
    await page.goto("/");
    // Sidebar should have key navigation items
    await expect(page.getByRole("link", { name: /Dashboard/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("link", { name: /Devices/i })).toBeVisible();
  });
});
