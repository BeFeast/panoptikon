import { test, expect, login } from "../../e2e/fixtures";

/**
 * Smoke test suite — runs after every deploy to verify key pages load
 * and no crashes occur. Lightweight and fast by design.
 *
 * Run with: bunx playwright test smoke
 */
test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads without errors", async ({ page }) => {
    await page.goto("/dashboard/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "tests/screenshots/smoke-dashboard.png" });
  });

  test("devices page loads without errors", async ({ page }) => {
    await page.goto("/devices/");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "tests/screenshots/smoke-devices.png" });
  });

  test("agents page loads without errors", async ({ page }) => {
    await page.goto("/agents/");
    await expect(
      page.getByRole("heading", { name: "Agents", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "tests/screenshots/smoke-agents.png" });
  });

  test("alerts page loads without errors", async ({ page }) => {
    await page.goto("/alerts/");
    await expect(
      page.getByRole("heading", { name: "Alerts", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "tests/screenshots/smoke-alerts.png" });
  });

  test("settings page loads without errors", async ({ page }) => {
    await page.goto("/settings/");
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "tests/screenshots/smoke-settings.png" });
  });

  test("settings router page loads without errors", async ({ page }) => {
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "tests/screenshots/smoke-settings-router.png",
    });
  });

  test("settings xiaomi-mesh page loads without errors", async ({ page }) => {
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "tests/screenshots/smoke-settings-xiaomi.png",
    });
  });

  test("no console errors on dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/dashboard/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Allow network errors (external services may be down) but no JS crashes
    const jsErrors = errors.filter(
      (e) => !e.includes("NetworkError") && !e.includes("fetch"),
    );
    expect(jsErrors).toHaveLength(0);
  });
});
