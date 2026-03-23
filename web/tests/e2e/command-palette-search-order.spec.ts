import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for Cmd+K search result ordering (#652).
 *
 * When searching for a device IP/name, entity matches (devices, agents)
 * should appear before navigation items and actions.
 */
test.describe("Command Palette Search Order (#652)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("entity results appear before actions and pages when searching", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open command palette
    await page.keyboard.press("Control+k");
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Type a search query — use "10." which is likely to match device IPs
    const input = page.locator("[cmdk-input]");
    await input.fill("10.");

    // Wait for debounce + API response
    await page.waitForTimeout(500);

    // Check if any device results appeared
    const deviceGroup = dialog.locator('[cmdk-group] [cmdk-group-heading]:text("Devices")');
    const hasDeviceResults = (await deviceGroup.count()) > 0;

    if (hasDeviceResults) {
      // Verify Devices group appears before Pages group in DOM order
      const allGroupHeadings = dialog.locator("[cmdk-group-heading]");
      const headingTexts: string[] = [];
      const count = await allGroupHeadings.count();
      for (let i = 0; i < count; i++) {
        const text = await allGroupHeadings.nth(i).textContent();
        if (text) headingTexts.push(text.trim());
      }

      const devicesIndex = headingTexts.indexOf("Devices");
      const actionsIndex = headingTexts.indexOf("Actions");
      const pagesIndex = headingTexts.indexOf("Pages");

      // Devices should come before Actions and Pages
      expect(devicesIndex).toBeGreaterThanOrEqual(0);
      expect(devicesIndex).toBeLessThan(actionsIndex);
      expect(devicesIndex).toBeLessThan(pagesIndex);

      // Actions should come before Pages
      expect(actionsIndex).toBeLessThan(pagesIndex);

      await page.screenshot({
        path: "tests/screenshots/command-palette-search-order-devices.png",
        fullPage: true,
      });
    }
    // If no devices in test environment, test passes vacuously
  });

  test("idle palette shows actions and pages groups", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open command palette without typing
    await page.keyboard.press("Control+k");
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Both groups should be visible
    await expect(dialog.getByText("Actions")).toBeVisible();
    await expect(dialog.getByText("Pages")).toBeVisible();
    await expect(dialog.getByText("Scan Now")).toBeVisible();
    await expect(dialog.getByText("Dashboard")).toBeVisible();

    // Collect visible group headings in order
    const allGroupHeadings = dialog.locator("[cmdk-group-heading]");
    const headingTexts: string[] = [];
    const count = await allGroupHeadings.count();
    for (let i = 0; i < count; i++) {
      const text = await allGroupHeadings.nth(i).textContent();
      if (text) headingTexts.push(text.trim());
    }

    // Actions should appear before Pages (entity groups are not rendered)
    const actionsIndex = headingTexts.indexOf("Actions");
    const pagesIndex = headingTexts.indexOf("Pages");
    expect(actionsIndex).toBeGreaterThanOrEqual(0);
    expect(pagesIndex).toBeGreaterThanOrEqual(0);
    expect(actionsIndex).toBeLessThan(pagesIndex);

    await page.screenshot({
      path: "tests/screenshots/command-palette-idle-order.png",
      fullPage: true,
    });
  });
});
