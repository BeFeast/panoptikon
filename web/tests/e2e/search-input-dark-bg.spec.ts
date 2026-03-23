import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E test for search input dark background fix (#637).
 *
 * Verifies:
 * - TopBar search input has a dark background (not white)
 * - Search input fits within the header height
 * - Search input is focusable and accepts text
 */
test.describe("Search Input Dark Background (#637)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("search input has dark background, not white", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
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
      path: "tests/screenshots/search-input-dark-bg.png",
    });
  });

  test("search input is focusable and accepts text", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const searchInput = page.getByPlaceholder(/search devices/i);
    await searchInput.click();
    await expect(searchInput).toBeFocused();

    // Type into the input to verify it accepts text
    await searchInput.fill("test-query");
    await expect(searchInput).toHaveValue("test-query");

    await page.screenshot({
      path: "tests/screenshots/search-input-focused.png",
    });
  });

  test("search input fits within header row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    const header = page.locator("header").first();
    const searchInput = page.getByPlaceholder(/search devices/i);

    const headerBox = await header.boundingBox();
    const inputBox = await searchInput.boundingBox();

    expect(headerBox).not.toBeNull();
    expect(inputBox).not.toBeNull();

    if (headerBox && inputBox) {
      // Input should be vertically contained within the header
      expect(inputBox.y).toBeGreaterThanOrEqual(headerBox.y);
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(
        headerBox.y + headerBox.height,
      );
    }

    await page.screenshot({
      path: "tests/screenshots/search-input-header-alignment.png",
    });
  });
});
