import { test, expect } from "../../e2e/fixtures";

/**
 * E2E test for Space Grotesk display font on branded surfaces.
 */
test.describe("Display font (Space Grotesk)", () => {
  test("login headline has font-mono class", async ({ page }) => {
    await page.goto("/login/");

    const heading = page.getByRole("heading", {
      name: "Panoptikon",
      level: 1,
    });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Assert the display font class is applied
    await expect(heading).toHaveClass(/font-mono/);

    await page.screenshot({
      path: "tests/screenshots/display-font-login.png",
      fullPage: true,
    });
  });

  test("sidebar logo text has font-mono class", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Ensure desktop viewport so sidebar is visible
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");

    // The sidebar "Panoptikon" wordmark. Scope to the brand link so we don't
    // match the user-pill mono text in the footer.
    const logoText = page.locator("aside a[aria-label='Panoptikon'] span.font-mono");
    await expect(logoText).toBeVisible({ timeout: 15000 });
    await expect(logoText).toHaveText("Panoptikon");

    await page.screenshot({
      path: "tests/screenshots/display-font-sidebar.png",
      fullPage: true,
    });
  });
});
