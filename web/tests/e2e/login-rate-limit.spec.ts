import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for login rate limiting (#659):
 * Verify the frontend correctly displays rate-limit feedback when the server
 * returns 429 Too Many Requests.
 *
 * Uses page.route() to simulate the 429 response so we don't exhaust the
 * real rate limiter (which would block other tests sharing the same server).
 * Backend rate-limiting logic is covered by Rust unit tests in auth.rs.
 */
test.describe("Login rate limiting", () => {
  test("shows rate-limit message when server returns 429", async ({
    page,
  }) => {
    await page.goto("/login/");

    // Wait for the login form to be ready (auth status check completed)
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Intercept login API calls to simulate rate-limit response
    await page.route("**/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 429,
        headers: {
          "Retry-After": "60",
          "Content-Type": "text/plain",
        },
        body: "Too Many Requests",
      });
    });

    // Submit the login form — the intercepted 429 should trigger the rate-limit message
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Rate-limit message must be visible
    await expect(
      page.getByText("Too many login attempts"),
    ).toBeVisible({ timeout: 5000 });

    // The standard "Invalid password" message must NOT appear
    await expect(page.getByText("Invalid password")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-rate-limit.png",
      fullPage: true,
    });
  });

  test("shows invalid-password message for normal auth failure", async ({
    page,
  }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Intercept login API to return a standard 401
    await page.route("**/api/v1/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Unauthorized" }),
      });
    });

    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Standard error must appear
    await expect(page.getByText("Invalid password")).toBeVisible({
      timeout: 5000,
    });

    // Rate-limit message must NOT appear
    await expect(
      page.getByText("Too many login attempts"),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-invalid-password.png",
      fullPage: true,
    });
  });
});
