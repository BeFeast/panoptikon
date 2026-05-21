import { test, expect } from "../../e2e/fixtures";

/**
 * Focused coverage for the `Continue with SSO` action and `OR` divider on
 * `/login`. The block must stay hidden unless the backend `/api/v1/auth/status`
 * response advertises `sso_enabled: true`. Refs #768.
 */
test.describe("Login SSO visibility (#768)", () => {
  test("default backend state hides OR divider and SSO action", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/status", async (route) => {
      await route.fulfill({
        json: {
          authenticated: false,
          needs_setup: false,
          sso_enabled: false,
          sso_login_url: null,
        },
      });
    });

    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Operator")).toHaveValue("operator");

    const form = page.locator("main.login-bg form");
    await expect(form).toBeVisible();
    await expect(form.getByText(/^OR$/)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Continue with SSO" }),
    ).toHaveCount(0);

    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-sso-hidden.png",
      fullPage: true,
    });
  });

  test("sso_enabled response renders OR divider and SSO link", async ({
    page,
  }) => {
    const ssoUrl = "/api/v1/auth/sso/login";
    await page.route("**/api/v1/auth/status", async (route) => {
      await route.fulfill({
        json: {
          authenticated: false,
          needs_setup: false,
          sso_enabled: true,
          sso_login_url: ssoUrl,
        },
      });
    });

    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const form = page.locator("main.login-bg form");
    await expect(form).toBeVisible();
    await expect(form.getByText(/^OR$/)).toBeVisible();

    const ssoLink = page.getByRole("link", { name: "Continue with SSO" });
    await expect(ssoLink).toBeVisible();
    await expect(ssoLink).toHaveAttribute("href", ssoUrl);

    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-sso-visible.png",
      fullPage: true,
    });
  });
});
