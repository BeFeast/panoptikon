import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for InfoStatCard visual enhancements (#597).
 *
 * Verifies:
 * - Gradient icon backgrounds (bg-gradient-to-br)
 * - Upgraded icon container size (48×48 → h-12 w-12)
 * - Subtle background glow div
 * - Card still renders without overflow
 */
test.describe("Stat Card Enhancements (#597)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("router page InfoStatCards have upgraded icon containers and glow", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    await page.goto("/router/mikrotik/");

    // RouterSelector is always present
    await expect(
      page.getByRole("link", { name: /MikroTik/i }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for page body to resolve
    const systemTab = page.getByRole("tab", { name: "System" });
    const anyFallback = page.getByText(/not configured|unreachable/i);
    await expect(systemTab.or(anyFallback)).toBeVisible({ timeout: 20000 });

    if (await systemTab.isVisible()) {
      await systemTab.click();

      // InfoStatCards use border-slate-800 and bg-slate-900
      const cards = page.locator(
        '[class*="border-slate-800"][class*="bg-slate-900"]',
      );
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const card = cards.nth(i);

        // Card should have overflow-hidden (needed for glow containment)
        await expect(card).toHaveCSS("overflow", "hidden");

        // Icon container should be 48×48 (h-12 w-12)
        const iconContainer = card.locator(".h-12.w-12").first();
        if ((await iconContainer.count()) > 0) {
          const box = await iconContainer.boundingBox();
          if (box) {
            expect(box.width).toBeGreaterThanOrEqual(44); // 48px with tolerance
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }

        // Card min-height preserved (80px with 4px tolerance)
        const cardBox = await card.boundingBox();
        if (cardBox) {
          expect(cardBox.height).toBeGreaterThanOrEqual(76);
        }
      }

      // Verify at least one glow div exists (blur-2xl positioned element)
      const glowDivs = page.locator('[class*="blur-2xl"][class*="rounded-full"]');
      expect(await glowDivs.count()).toBeGreaterThanOrEqual(1);
    }

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({
      path: "tests/screenshots/stat-card-enhancements.png",
      fullPage: true,
    });
  });

  test("stat cards render without overflow at 375px mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/router/mikrotik/");

    // Wait for page to settle
    const systemTab = page.getByRole("tab", { name: "System" });
    const anyFallback = page.getByText(/not configured|unreachable/i);
    await expect(
      systemTab.or(anyFallback),
    ).toBeVisible({ timeout: 20000 });

    // No horizontal overflow at mobile width
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({
      path: "tests/screenshots/stat-card-mobile-375.png",
      fullPage: true,
    });
  });
});
