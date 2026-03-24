import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for login page rebrand (#674):
 * Shield icon removed, "P" monogram visible, cyan accents, no blue classes.
 */
test.describe("Login page rebrand", () => {
  test("displays branded P monogram instead of shield icon", async ({
    page,
  }) => {
    await page.goto("/login/");

    // Wait for the page to hydrate
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

    // Headline "Panoptikon" must be visible
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible();

    // Subtitle uses updated text
    await expect(
      page.getByText("Sign in to your network operations console"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-rebrand.png",
      fullPage: true,
    });
  });
});
