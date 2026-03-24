import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for login rate limiting (#659):
 * After 5 failed login attempts within 60 seconds, the server returns 429
 * and the UI shows a rate-limit message instead of "Invalid password".
 */
test.describe("Login rate limiting", () => {
  test("shows rate-limit message after too many failed attempts", async ({
    page,
  }) => {
    await page.goto("/login/");

    // Wait for the login form to be ready
    await expect(
      page.getByRole("button", { name: "Sign In" }),
    ).toBeVisible({ timeout: 15000 });

    // Submit 6 wrong passwords rapidly (limit is 5 per 60s)
    for (let i = 0; i < 6; i++) {
      await page.locator("#password").fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Sign In" }).click();

      // Wait for the error message to appear before next attempt
      const errorMsg = page.locator(".bg-rose-500\\/10");
      await expect(errorMsg).toBeVisible({ timeout: 5000 });
    }

    // After 6 attempts, the rate-limit message should be shown
    await expect(
      page.getByText("Too many login attempts"),
    ).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: "tests/screenshots/login-rate-limit.png",
      fullPage: true,
    });
  });

  test("still shows 'Invalid password' for first few failed attempts", async ({
    page,
  }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("button", { name: "Sign In" }),
    ).toBeVisible({ timeout: 15000 });

    // A single wrong password should show "Invalid password", not rate limit
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Invalid password")).toBeVisible({
      timeout: 5000,
    });

    // Rate limit message should NOT be visible
    await expect(
      page.getByText("Too many login attempts"),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-invalid-password.png",
      fullPage: true,
    });
  });
});
