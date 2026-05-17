import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for the login page visual upgrade:
 * static mesh background, glow card, cyan brand accents, input focus effects.
 */
test.describe("Login page visual upgrade", () => {
  test("login page has mesh background and glow card", async ({
    page,
  }) => {
    await page.goto("/login/");

    // Wait for the page to hydrate
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText("Sign in to your network operations console"),
    ).toBeVisible({ timeout: 15000 });

    // Mesh background: the outer container owns the console grid treatment.
    const bgContainer = page.locator(".login-bg");
    await expect(bgContainer).toBeVisible();
    const backgroundImage = await bgContainer.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(backgroundImage).toContain("linear-gradient");
    expect(backgroundImage).toContain("radial-gradient");

    // Legacy floating orbs should not be present in the renewed mesh direction.
    await expect(page.locator(".login-orb")).toHaveCount(0);

    // Login card has glow effect class
    const glowCard = page.locator(".login-card-glow");
    await expect(glowCard).toBeVisible();
    await expect(glowCard).toHaveClass(/rounded-md/);
    await expect(glowCard).toHaveClass(/bg-slate-950/);

    // Brand name is solid console text, with the cyan monogram carrying the accent.
    const heading = page.getByRole("heading", {
      name: "Panoptikon",
      level: 1,
    });
    await expect(heading).toHaveClass(/text-white/);
    await expect(page.locator(".bg-cyan-500").first()).toBeVisible();

    // Password input and Sign In button are present
    await expect(page.locator("#password")).toBeVisible();
    const submitButton = page.getByRole("button", { name: "Sign In" });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveClass(/bg-cyan-500/);

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
      page.getByText("Sign in to your network operations console"),
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
      page.getByText("Sign in to your network operations console"),
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
