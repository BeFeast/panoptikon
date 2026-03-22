import { test, expect } from "../../e2e/fixtures";

test.describe("Design system overhaul", () => {
  test("page headings use display font and updated sizing", async ({
    authenticatedPage: page,
  }) => {
    // Dashboard heading should be visible with updated classes
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15000 });
    await expect(heading).toHaveClass(/font-display/);
    await expect(heading).toHaveClass(/text-3xl/);
    await expect(heading).toHaveClass(/font-bold/);
    await expect(heading).toHaveClass(/tracking-tight/);
    await page.screenshot({ path: "test-results/design-system-heading.png" });
  });

  test("gradient CSS variables are defined", async ({
    authenticatedPage: page,
  }) => {
    // Verify gradient CSS variables exist on :root
    const gradientPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--gradient-primary")
        .trim()
    );
    expect(gradientPrimary).toContain("linear-gradient");

    const gradientWarm = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--gradient-warm")
        .trim()
    );
    expect(gradientWarm).toContain("linear-gradient");

    const gradientText = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--gradient-text")
        .trim()
    );
    expect(gradientText).toContain("linear-gradient");
  });

  test("body background includes colored radials for depth", async ({
    authenticatedPage: page,
  }) => {
    const bgImage = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundImage
    );
    // Should have indigo and emerald radial gradients
    expect(bgImage).toContain("radial-gradient");
    // At least 4 gradient layers (2 new colored radials + 2 original + 1 linear)
    const gradientCount = (bgImage.match(/gradient/g) || []).length;
    expect(gradientCount).toBeGreaterThanOrEqual(4);
    await page.screenshot({ path: "test-results/design-system-background.png" });
  });

  test("gradient-text utility class renders correctly", async ({
    authenticatedPage: page,
  }) => {
    // Inject a test element with gradient-text class to verify the utility
    await page.evaluate(() => {
      const el = document.createElement("span");
      el.className = "gradient-text";
      el.textContent = "Test";
      el.id = "gradient-test";
      document.body.appendChild(el);
    });
    const el = page.locator("#gradient-test");
    const bgClip = await el.evaluate((node) =>
      getComputedStyle(node).webkitBackgroundClip
    );
    expect(bgClip).toBe("text");
  });

  test("card grid uses updated gap spacing", async ({
    authenticatedPage: page,
  }) => {
    // Dashboard card grid should use gap-5
    const grid = page.locator(".grid.gap-5").first();
    await expect(grid).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "test-results/design-system-spacing.png" });
  });

  test("display font (Plus Jakarta Sans) is loaded", async ({
    authenticatedPage: page,
  }) => {
    // The --font-display CSS variable should be set on body
    const fontDisplayVar = await page.evaluate(() => {
      const body = document.body;
      const classes = body.className;
      // Plus Jakarta Sans font variable should be present as a class
      return classes;
    });
    // The Next.js font variable class should be present
    expect(fontDisplayVar).toContain("__variable");

    // Verify the heading actually uses the display font family
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15000 });
    const fontFamily = await heading.evaluate((node) =>
      getComputedStyle(node).fontFamily
    );
    // Next.js font optimization may hash the name, but "Jakarta" should be present
    expect(fontFamily.toLowerCase()).toMatch(/jakarta/i);
  });
});
