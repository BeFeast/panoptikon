import { test, expect, login } from "../../e2e/fixtures";

test.describe("Command+K device deep-link (#741)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigating to /devices?selected=<id> opens device detail sheet", async ({
    page,
  }) => {
    // Go to /devices and wait for the page to load
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for device content to appear (cards or table rows)
    await page.waitForTimeout(2000);

    // Get a device ID from the API
    const deviceId = await page.evaluate(async () => {
      const res = await fetch("/api/v1/devices", { credentials: "include" });
      const devices = await res.json();
      return devices[0]?.id ?? null;
    });

    test.skip(!deviceId, "No devices available to test selected");

    // Navigate to /devices?selected=<id>
    await page.goto(`/devices?selected=${deviceId}`);
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Assert the Sheet panel is open — SheetContent renders as role="dialog"
    // with data-state="open"
    const sheet = page.locator('[role="dialog"][data-state="open"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/devices$/, { timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/cmdk-deeplink-selected-opens-sheet.png",
      fullPage: true,
    });
  });

  test("Command+K device search navigates to devices page with selected", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Get a device name from the API to search for
    const deviceInfo = await page.evaluate(async () => {
      const res = await fetch("/api/v1/devices", { credentials: "include" });
      const devices = await res.json();
      if (!devices.length) return null;
      const d = devices[0];
      return {
        searchTerm: d.name || d.hostname || d.ip_address || null,
        id: d.id,
      };
    });

    test.skip(!deviceInfo || !deviceInfo.searchTerm, "No devices available to test search");

    // Open command palette with Ctrl+K
    await page.keyboard.press("Control+k");
    const dialogContent = page.locator("[cmdk-dialog]");
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // Type the device name into the search input
    const searchInput = page.locator("[cmdk-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(deviceInfo!.searchTerm);

    // Click the first device result
    const firstDeviceItem = page.locator('[cmdk-item][data-value^="device "]').first();
    await expect(firstDeviceItem).toBeVisible({ timeout: 3000 });
    await firstDeviceItem.click();

    // Assert we navigated to /devices
    await expect(page).toHaveURL(/\/devices$/, { timeout: 10000 });

    // Assert the detail sheet is open
    const sheet = page.locator('[role="dialog"][data-state="open"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/cmdk-deeplink-search-opens-sheet.png",
      fullPage: true,
    });
  });
});
