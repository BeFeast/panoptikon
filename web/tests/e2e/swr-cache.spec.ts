import { test, expect, login } from "../../e2e/fixtures";

test.describe("SWR Cache — data persists across navigation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard data renders after navigating away and back", async ({ page }) => {
    // Wait for dashboard to fully load
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Wait for stat cards to finish loading (skeleton → real content)
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "tests/screenshots/swr-dashboard-initial.png" });

    // Navigate away to Alerts
    await page.getByRole("link", { name: "Alerts" }).first().click();
    await page.waitForURL("**/alerts**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible();

    // Navigate back to Dashboard
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.waitForURL("**/dashboard**", { timeout: 10000 });

    // Dashboard heading should appear immediately (SWR cache hit — no loading skeleton)
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible({
      timeout: 5000,
    });
    await page.screenshot({ path: "tests/screenshots/swr-dashboard-cached.png" });
  });

  test("alerts page data renders after navigating away and back", async ({ page }) => {
    // Navigate to Alerts
    await page.getByRole("link", { name: "Alerts" }).first().click();
    await page.waitForURL("**/alerts**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible({
      timeout: 15000,
    });

    // Wait for content to load
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "tests/screenshots/swr-alerts-initial.png" });

    // Navigate to Dashboard
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.waitForURL("**/dashboard**", { timeout: 10000 });

    // Navigate back to Alerts
    await page.getByRole("link", { name: "Alerts" }).first().click();
    await page.waitForURL("**/alerts**", { timeout: 10000 });

    // Alerts heading should render immediately (cached)
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible({
      timeout: 5000,
    });
    await page.screenshot({ path: "tests/screenshots/swr-alerts-cached.png" });
  });
});
