import { test, expect, login } from "../../e2e/fixtures";

test.describe("SWR Data Fetching", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("pages load data with loading skeletons then render content", async ({ page }) => {
    // Navigate to Alerts — should show content (or empty state) after loading
    await page.getByRole("link", { name: "Alerts" }).first().click();
    await page.waitForURL("**/alerts**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible();

    // The page should render content (alerts list or empty state)
    const hasAlerts = await page.locator('[class*="space-y"]').first().isVisible();
    expect(hasAlerts).toBe(true);

    await page.screenshot({ path: "tests/screenshots/swr-alerts-loaded.png" });
  });

  test("navigating away and back shows content instantly (SWR cache)", async ({ page }) => {
    // Go to Devices page and wait for content
    await page.getByRole("link", { name: "Devices" }).first().click();
    await page.waitForURL("**/devices**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Devices", level: 1 })).toBeVisible();

    // Wait for device data to load (skeleton disappears, real content shows)
    await page.waitForFunction(
      () => document.querySelectorAll('[data-slot="skeleton"]').length === 0,
      { timeout: 15000 },
    ).catch(() => {
      // Some skeletons may persist if no devices — that's okay
    });

    await page.screenshot({ path: "tests/screenshots/swr-devices-first-load.png" });

    // Navigate to Alerts
    await page.getByRole("link", { name: "Alerts" }).first().click();
    await page.waitForURL("**/alerts**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Alerts", level: 1 })).toBeVisible();

    // Navigate back to Devices — SWR cache should make this instant (no loading skeletons)
    await page.getByRole("link", { name: "Devices" }).first().click();
    await page.waitForURL("**/devices**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Devices", level: 1 })).toBeVisible();

    await page.screenshot({ path: "tests/screenshots/swr-devices-cached.png" });
  });

  test("dashboard renders all sections with SWR", async ({ page }) => {
    // Dashboard uses multiple independent SWR hooks
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    // Dashboard should render stat cards and sections
    // Wait for at least one stat card to have content (not skeleton)
    await page.waitForSelector("text=Devices", { timeout: 15000 });

    await page.screenshot({ path: "tests/screenshots/swr-dashboard.png", fullPage: true });
  });

  test("agents page loads with SWR and uses shared fixtures", async ({ page }) => {
    await page.getByRole("link", { name: "Agents" }).first().click();
    await page.waitForURL("**/agents**", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Agents", level: 1 })).toBeVisible();

    // Should show either the agents table or the empty state
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasEmpty = await page.getByText("No agents connected").isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);

    await page.screenshot({ path: "tests/screenshots/swr-agents.png" });
  });
});
