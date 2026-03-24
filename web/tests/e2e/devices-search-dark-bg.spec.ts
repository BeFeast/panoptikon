import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E test for devices page search input dark background fix (#654).
 *
 * Verifies:
 * - The search/filter input on /devices has a dark background (not white)
 * - Search input is focusable and accepts text
 */
test.describe("Devices Page Search Input Dark Background (#654)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("devices search input has dark background, not white", async ({
    page,
  }) => {
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search name, ip, mac/i);
    await expect(searchInput).toBeVisible();

    // Verify the input has a dark background (bg-slate-900 = rgb(15, 23, 42))
    const bgColor = await searchInput.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor,
    );

    // Parse the RGB values — must be dark (all channels < 50)
    const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    expect(match).not.toBeNull();
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      // White would be rgb(255, 255, 255) — dark slate-900 is rgb(15, 23, 42)
      expect(r).toBeLessThan(50);
      expect(g).toBeLessThan(50);
      expect(b).toBeLessThan(60);
    }

    await page.screenshot({
      path: "tests/screenshots/devices-search-dark-bg.png",
    });
  });

  test("devices search input is focusable and accepts text", async ({
    page,
  }) => {
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search name, ip, mac/i);
    await searchInput.click();
    await expect(searchInput).toBeFocused();

    await searchInput.fill("test-query");
    await expect(searchInput).toHaveValue("test-query");

    await page.screenshot({
      path: "tests/screenshots/devices-search-focused.png",
    });
  });
});
