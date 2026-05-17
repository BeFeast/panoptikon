import { test, expect } from "../../e2e/fixtures";

/**
 * E2E tests for the renewed login reference screen.
 */
test.describe("Login page rebrand", () => {
  test("displays network mark and operations login affordances", async ({ page }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.locator('[data-lucide="shield"]')).toHaveCount(0);
    await expect(page.locator("main.login-bg svg").first()).toBeVisible();
    await expect(page.getByLabel("Operator")).toHaveValue("operator");
    await expect(page.getByRole("button", { name: "reset key" })).toBeVisible();
    await expect(page.getByText(/^OR$/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue with SSO" })).toHaveCount(0);
    await expect(page.getByText("all systems healthy")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-rebrand.png",
      fullPage: true,
    });
  });

  test("shows configured SSO action from auth status", async ({ page }) => {
    await page.route("**/api/v1/auth/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          needs_setup: false,
          sso_enabled: true,
          sso_login_url: "/api/v1/auth/sso",
        }),
      });
    });

    await page.goto("/login/");

    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });
    await expect(page.getByText(/^OR$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with SSO" })).toBeVisible();

    await page.getByRole("button", { name: "Continue with SSO" }).click();
    await page.waitForURL("**/api/v1/auth/sso", { timeout: 5000 });
  });
});
