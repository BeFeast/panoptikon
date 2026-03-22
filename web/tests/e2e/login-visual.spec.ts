import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for the login page visual upgrade:
 * animated background, glow card, gradient text, input focus effects.
 */
test.describe("Login page visual upgrade", () => {
  test("login page has animated background and glow card", async ({
    page,
  }) => {
    await page.goto("/login/");

    // Wait for the page to hydrate
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText("Sign in to your network dashboard"),
    ).toBeVisible({ timeout: 15000 });

    // Animated background: the outer container has login-bg class
    const bgContainer = page.locator(".login-bg");
    await expect(bgContainer).toBeVisible();

    // Gradient orbs exist (animated floating blurred elements)
    const orbs = page.locator(".login-orb");
    expect(await orbs.count()).toBeGreaterThanOrEqual(1);

    // Login card has glow effect class
    const glowCard = page.locator(".login-card-glow");
    await expect(glowCard).toBeVisible();

    // Brand name has gradient text (transparent text color with bg-clip-text)
    const heading = page.getByRole("heading", {
      name: "Panoptikon",
      level: 1,
    });
    await expect(heading).toHaveClass(/bg-gradient-to-r/);
    await expect(heading).toHaveClass(/bg-clip-text/);

    // Password input and Sign In button are present
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign In" }),
    ).toBeVisible();

    // Input focus glow wrapper exists
    const focusGlow = page.locator(".input-focus-glow");
    expect(await focusGlow.count()).toBeGreaterThanOrEqual(1);

    // Eye toggle button has aria-label
    const eyeToggle = page.locator('button[aria-label="Show password"]');
    await expect(eyeToggle).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-visual-upgrade.png",
      fullPage: true,
    });
  });

  test("login page works on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText("Sign in to your network dashboard"),
    ).toBeVisible({ timeout: 15000 });

    // Card should be visible and not overflow
    const card = page.locator(".login-card-glow");
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(375);

    await page.screenshot({
      path: "tests/screenshots/login-visual-mobile.png",
      fullPage: true,
    });
  });

  test("password eye toggle switches icon", async ({ page }) => {
    await page.goto("/login/");

    await expect(
      page.getByText("Sign in to your network dashboard"),
    ).toBeVisible({ timeout: 15000 });

    // Initially "Show password" button is visible
    const showBtn = page.locator('button[aria-label="Show password"]');
    await expect(showBtn).toBeVisible();

    // Click to show password
    await showBtn.click();

    // Now "Hide password" button should be visible
    const hideBtn = page.locator('button[aria-label="Hide password"]');
    await expect(hideBtn).toBeVisible();

    // Password input should now be type="text"
    await expect(page.locator("#password")).toHaveAttribute("type", "text");

    // Click to hide again
    await hideBtn.click();
    await expect(page.locator("#password")).toHaveAttribute(
      "type",
      "password",
    );

    await page.screenshot({
      path: "tests/screenshots/login-eye-toggle.png",
      fullPage: true,
    });
  });
});
