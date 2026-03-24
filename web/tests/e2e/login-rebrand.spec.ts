import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for the login page rebrand:
 * cyan accents replace blue, "P" monogram replaces Shield icon.
 */
test.describe("Login page rebrand", () => {
  test("shows branded P monogram instead of Shield icon", async ({ page }) => {
    await page.goto("/login/");

    // Wait for hydration
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Shield icon must NOT be present
    const shieldIcon = page.locator('[data-lucide="shield"]');
    await expect(shieldIcon).toHaveCount(0);

    // Branded "P" monogram must be visible
    const monogram = page.locator("text=P").first();
    await expect(monogram).toBeVisible();

    // The monogram container should use cyan accent
    const monogramContainer = page.locator(".bg-cyan-500").first();
    await expect(monogramContainer).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-rebrand-monogram.png",
      fullPage: true,
    });
  });

  test("headline uses cyan gradient, not blue", async ({ page }) => {
    await page.goto("/login/");

    const heading = page.getByRole("heading", {
      name: "Panoptikon",
      level: 1,
    });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Gradient should use cyan/teal tones
    await expect(heading).toHaveClass(/from-cyan-400/);
    await expect(heading).toHaveClass(/via-cyan-300/);
    await expect(heading).toHaveClass(/to-teal-400/);

    // Should NOT have blue gradient classes
    const headingClass = await heading.getAttribute("class");
    expect(headingClass).not.toContain("from-blue");
    expect(headingClass).not.toContain("via-blue");
  });

  test("subtitle says network operations console", async ({ page }) => {
    await page.goto("/login/");

    await expect(
      page.getByText("Sign in to your network operations console"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("no blue-500 or blue-400 classes on the login page", async ({
    page,
  }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Check that no element on the page has blue-500 or blue-400 classes
    const blueElements = page.locator(
      '[class*="blue-500"], [class*="blue-400"]',
    );
    await expect(blueElements).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/login-rebrand-no-blue.png",
      fullPage: true,
    });
  });
});
