import { test, expect } from "../../e2e/fixtures";

/**
 * Regression coverage for Refs #768: the OR divider and "Continue with SSO"
 * action on /login must only render when the backend reports
 * `sso_enabled: true`. A fresh install (the default) returns `sso_enabled: false`
 * from /api/v1/auth/status, so the password form is the only auth affordance.
 */
test.describe("Login SSO gating (Refs #768)", () => {
  test("default backend state hides OR divider and SSO action", async ({
    page,
  }) => {
    await page.goto("/login/");

    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    // Password affordances must remain present.
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    // No SSO affordances when sso_enabled is false (the default).
    await expect(
      page.getByRole("link", { name: "Continue with SSO" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continue with SSO" }),
    ).toHaveCount(0);
    // The OR divider only renders inside the SSO block, so it must be gone too.
    const orDivider = page.locator("form").getByText("OR", { exact: true });
    await expect(orDivider).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/login-sso-disabled.png",
      fullPage: true,
    });
  });

  test("backend-reported sso_enabled reveals divider and SSO link", async ({
    page,
  }) => {
    const ssoUrl = "https://idp.example.test/sso/start";

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

    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    const ssoLink = page.getByRole("link", { name: "Continue with SSO" });
    await expect(ssoLink).toBeVisible();
    await expect(ssoLink).toHaveAttribute("href", ssoUrl);

    const orDivider = page.locator("form").getByText("OR", { exact: true });
    await expect(orDivider).toBeVisible();

    // Password login affordances must still be present alongside SSO.
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-sso-enabled.png",
      fullPage: true,
    });
  });
});
