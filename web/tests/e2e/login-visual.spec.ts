import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for the login page visual reference: network backdrop,
 * large bordered operations card, operator/password controls, and health footer.
 */
test.describe("Login page visual upgrade", () => {
  test("login page has network background and reference card", async ({
    page,
  }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    const bgContainer = page.locator(".login-bg");
    await expect(bgContainer).toBeVisible();
    const backgroundImage = await bgContainer.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(backgroundImage).toContain("linear-gradient");
    expect(backgroundImage).toContain("radial-gradient");

    await expect(page.locator(".login-orb")).toHaveCount(0);

    const card = page.locator("main.login-bg section").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    const hasVerticalOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    );
    expect(hasVerticalOverflow).toBe(false);

    const borderColor = await card.evaluate(
      (element) => getComputedStyle(element).borderColor,
    );
    expect(borderColor).toBe("rgb(44, 77, 128)");

    await expect(page.getByText(/core\.lan/)).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
    // Continue with SSO is rendered only when authStatus.sso_enabled is true (default: false).
    // The element is an <a> link; assert by both role and text so a future
    // change to element type cannot silently mask the assertion.
    await expect(
      page.getByRole("link", { name: "Continue with SSO" }),
    ).toHaveCount(0);
    await expect(page.getByText("Continue with SSO")).toHaveCount(0);
    await expect(page.getByText("all systems healthy")).toBeVisible();

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
    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    const card = page.locator("main.login-bg section").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(375);

    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
    // Continue with SSO is rendered only when authStatus.sso_enabled is true (default: false).
    await expect(
      page.getByRole("link", { name: "Continue with SSO" }),
    ).toHaveCount(0);
    await expect(page.getByText("Continue with SSO")).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/login-visual-mobile.png",
      fullPage: true,
    });
  });

  test("password eye toggle switches icon", async ({ page }) => {
    await page.goto("/login/");

    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    const showBtn = page.locator('button[aria-label="Show password"]');
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    const hideBtn = page.locator('button[aria-label="Hide password"]');
    await expect(hideBtn).toBeVisible();
    await expect(page.locator("#password")).toHaveAttribute("type", "text");

    await hideBtn.click();
    await expect(page.locator("#password")).toHaveAttribute("type", "password");

    await page.screenshot({
      path: "tests/screenshots/login-eye-toggle.png",
      fullPage: true,
    });
  });
});
