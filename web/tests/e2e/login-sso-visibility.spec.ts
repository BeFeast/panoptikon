import { test, expect } from "../../e2e/fixtures";

/**
 * Regression coverage for PAN-53 / #768:
 * the `Continue with SSO` button and the `OR` divider must only render when
 * the backend reports SSO is configured.
 *
 * The login page reads `/api/v1/auth/status`; mocking that response gives a
 * deterministic test that doesn't depend on whatever the backend default DB
 * state happens to be on the test runner.
 */
test.describe("Login page — SSO visibility", () => {
  test("hides OR divider and SSO action when backend reports sso_enabled=false", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          needs_setup: false,
          sso_enabled: false,
          sso_login_url: null,
        }),
      });
    });

    await page.goto("/login/");

    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    await expect(page.getByText(/^OR$/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continue with SSO" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Continue with SSO" }),
    ).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/login-sso-hidden.png",
      fullPage: true,
    });
  });

  test("shows OR divider and SSO action when backend reports sso_enabled=true", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          needs_setup: false,
          sso_enabled: true,
          sso_login_url: "/api/v1/auth/sso/login",
        }),
      });
    });

    await page.goto("/login/");

    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    await expect(page.getByText(/^OR$/)).toBeVisible();
    const ssoAction = page.getByRole("link", { name: "Continue with SSO" });
    await expect(ssoAction).toBeVisible();
    await expect(ssoAction).toHaveAttribute("href", "/api/v1/auth/sso/login");

    await page.screenshot({
      path: "tests/screenshots/login-sso-visible.png",
      fullPage: true,
    });
  });
});
