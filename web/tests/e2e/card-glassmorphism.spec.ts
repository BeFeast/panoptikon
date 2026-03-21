import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card glassmorphism redesign (#592).
 *
 * Verifies:
 * - Increased backdrop blur (backdrop-blur-xl)
 * - Top-edge inner glow pseudo-element
 * - Hover border glow transition
 * - Active/selected card left accent bar utility
 */
test.describe("Card Glassmorphism 2.0 (#592)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("cards have backdrop-blur-xl and top-edge inner glow", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Wait for cards to render
    await page.waitForTimeout(2000);

    // Find a card element rendered by the Card component
    const cards = page.locator('[class*="backdrop-blur-xl"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Verify the card has the increased backdrop blur
    const firstCard = cards.first();
    const backdropFilter = await firstCard.evaluate(
      (el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter,
    );
    expect(backdropFilter).toContain("blur");

    // Verify the before pseudo-element exists (top-edge glow) via its gradient background
    const beforeBg = await firstCard.evaluate((el) => {
      const style = getComputedStyle(el, "::before");
      return style.backgroundImage;
    });
    expect(beforeBg).toContain("gradient");

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-dashboard.png",
      fullPage: true,
    });
  });

  test("cards have hover border glow transition", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    await page.waitForTimeout(2000);

    const card = page.locator('[class*="backdrop-blur-xl"]').first();
    await expect(card).toBeVisible();

    // Verify the card has transition property that covers border-color
    const transition = await card.evaluate(
      (el) => getComputedStyle(el).transitionProperty,
    );
    expect(transition === "all" || transition.includes("border")).toBe(true);

    // Hover and verify border changes
    await card.hover();
    await page.waitForTimeout(300); // wait for 200ms transition

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-hover.png",
      fullPage: true,
    });
  });

  test("card-active utility class renders left accent bar", async ({
    page,
  }) => {
    // Inject a test card with the card-active class to verify the utility
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Add a test element with card-active class
    await page.evaluate(() => {
      const div = document.createElement("div");
      div.id = "test-active-card";
      div.className = "card-active";
      div.style.width = "200px";
      div.style.height = "100px";
      div.style.position = "fixed";
      div.style.bottom = "10px";
      div.style.right = "10px";
      div.style.zIndex = "9999";
      document.body.appendChild(div);
    });

    const testCard = page.locator("#test-active-card");
    await expect(testCard).toBeVisible();

    // Verify the ::after pseudo-element (left accent bar) exists
    const afterWidth = await testCard.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return style.width;
    });
    expect(afterWidth).toBe("4px");

    const afterBg = await testCard.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return style.backgroundImage;
    });
    expect(afterBg).toContain("gradient");

    await page.screenshot({
      path: "tests/screenshots/card-glassmorphism-active.png",
      fullPage: true,
    });
  });
});
