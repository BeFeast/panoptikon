import { test, expect, login } from "../../e2e/fixtures";

/**
 * Smoke tests — tagged @smoke.
 * Run after every deploy to verify key pages load without crashes.
 *
 * Usage: bunx playwright test --grep @smoke
 */

test.describe("Smoke Tests @smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("health endpoint returns ok @smoke", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("dashboard loads without errors @smoke", async ({ page }) => {
    await page.goto("/dashboard/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("devices page loads without errors @smoke", async ({ page }) => {
    await page.goto("/devices/");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("agents page loads without errors @smoke", async ({ page }) => {
    await page.goto("/agents/");
    await expect(
      page.getByRole("heading", { name: "Agents", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("settings page loads without errors @smoke", async ({ page }) => {
    await page.goto("/settings/");
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("router settings loads without errors @smoke", async ({ page }) => {
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
  });

  test("xiaomi settings loads without errors @smoke", async ({ page }) => {
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
  });
});
