/**
 * Smoke tests — run after every deploy to verify the app is healthy.
 *
 * These are fast, lightweight checks that confirm key pages load and
 * the server is responsive. If any of these fail, the deploy should
 * be considered broken.
 *
 * Run manually: cd web && bunx playwright test tests/e2e/smoke.spec.ts
 * Run via script: scripts/smoke-test.sh
 */
import { test, expect, login } from "../../e2e/fixtures";

test.describe("Smoke tests @smoke", () => {
  test("health endpoint responds", async ({ page }) => {
    const response = await page.request.get("/api/v1/auth/status");
    expect(response.status()).toBeLessThan(500);
  });

  test("login page loads without errors", async ({ page }) => {
    await page.goto("/login");

    // Page should render the login form
    await expect(
      page.getByText("Sign in to your network dashboard"),
    ).toBeVisible({ timeout: 15000 });

    // No uncaught JS errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test("dashboard loads after authentication", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Stat cards should be present
    await expect(page.locator('[class*="card"]').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("devices page loads", async ({ page }) => {
    await login(page);
    await page.goto("/devices/");

    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("settings page loads", async ({ page }) => {
    await login(page);
    await page.goto("/settings/");

    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("agents page loads", async ({ page }) => {
    await login(page);
    await page.goto("/agents/");

    await expect(
      page.getByRole("heading", { name: "Agents", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("no JavaScript errors on key pages", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await login(page);

    // Visit key pages
    for (const path of ["/dashboard/", "/devices/", "/agents/", "/settings/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }

    expect(errors).toHaveLength(0);
  });
});
