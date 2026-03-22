import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card glassmorphism 2.0 redesign (#592).
 *
 * Verifies upgraded glassmorphic card surfaces:
 * - Increased backdrop blur (backdrop-blur-xl)
 * - Top-edge inner glow via pseudo-element
 * - Hover border glow (blue-500/20)
 * - Selected state left accent bar
 */
test.describe("Card Glassmorphism 2.0 (#592)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard cards use backdrop-blur-xl", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Wait for cards to render
    await page.waitForTimeout(2000);

    // Find a card element with the updated backdrop-blur-xl class
    const card = page.locator('[class*="backdrop-blur-xl"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify the computed backdrop-filter includes a large blur value
    const backdropFilter = await card.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue("backdrop-filter"),
    );
    // backdrop-blur-xl = 24px blur
    expect(backdropFilter).toContain("blur");

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-blur.png",
      fullPage: true,
    });
  });

  test("cards have top-edge inner glow pseudo-element", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    await page.waitForTimeout(2000);

    // The card should have a ::before pseudo-element with the gradient glow
    const card = page.locator('[class*="backdrop-blur-xl"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Check the ::before pseudo-element exists and has a gradient background
    const beforeBg = await card.evaluate((el) => {
      const style = window.getComputedStyle(el, "::before");
      return style.backgroundImage;
    });
    // Should contain a linear-gradient (the top-edge glow)
    expect(beforeBg).toContain("gradient");

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-glow.png",
      fullPage: true,
    });
  });

  test("cards show hover border glow transition", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    await page.waitForTimeout(2000);

    const card = page.locator('[class*="backdrop-blur-xl"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Card should have transition property for border-color
    const transition = await card.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue("transition"),
    );
    expect(transition).toContain("border");

    // Verify the hover class is present in the className
    const hasHoverBorder = await card.evaluate((el) =>
      el.className.includes("hover:border-blue-500/20"),
    );
    expect(hasHoverBorder).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-hover.png",
      fullPage: true,
    });
  });

  test("card-selected class renders left accent bar", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Inject a card-selected element to verify the CSS class works
    await page.evaluate(() => {
      const card = document.querySelector('[class*="backdrop-blur-xl"]');
      if (card) {
        card.classList.add("card-selected");
      }
    });

    const selectedCard = page.locator(".card-selected").first();
    await expect(selectedCard).toBeVisible({ timeout: 5000 });

    // Verify the ::after pseudo-element (accent bar) has a gradient background
    const afterBg = await selectedCard.evaluate((el) => {
      const style = window.getComputedStyle(el, "::after");
      return {
        background: style.backgroundImage,
        width: style.width,
        position: style.position,
      };
    });
    expect(afterBg.background).toContain("gradient");
    expect(afterBg.width).toBe("4px");
    expect(afterBg.position).toBe("absolute");

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-selected.png",
      fullPage: true,
    });
  });

  test("no layout regression — no horizontal overflow on dashboard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await page.waitForTimeout(2000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-no-overflow.png",
      fullPage: true,
    });
  });
});
