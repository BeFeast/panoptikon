import { test, expect } from "../../e2e/fixtures";

/**
 * Verifies the /login SSO action is gated on real backend state.
 *
 * Default backend response has `sso_enabled: false`, so the OR divider and
 * "Continue with SSO" action MUST be absent. When `sso_enabled: true` and a
 * `sso_login_url` is returned, both MUST be visible and the link MUST point
 * at the configured URL.
 */

const STATUS_ENDPOINT = "**/api/v1/auth/status";

test.describe("Login SSO action gating (#768)", () => {
  test("hides OR divider and SSO action when sso_enabled is false", async ({
    page,
  }) => {
    await page.route(STATUS_ENDPOINT, async (route) => {
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

    // Password sign-in must remain available.
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    // SSO is rendered as <a>; assert by accessible role AND by visible text
    // so we do not silently miss the element if it ever changes element type.
    await expect(
      page.getByRole("link", { name: /Continue with SSO/i }),
    ).toHaveCount(0);
    await expect(page.getByText("Continue with SSO")).toHaveCount(0);
    await expect(page.getByText(/^\s*OR\s*$/)).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/login-sso-hidden.png",
      fullPage: true,
    });
  });

  test("shows OR divider and SSO link when sso_enabled is true", async ({
    page,
  }) => {
    const ssoUrl = "https://sso.example.com/start";

    await page.route(STATUS_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          needs_setup: false,
          sso_enabled: true,
          sso_login_url: ssoUrl,
        }),
      });
    });

    await page.goto("/login/");
    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });

    // Password sign-in still rendered alongside SSO.
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();

    const ssoLink = page.getByRole("link", { name: /Continue with SSO/i });
    await expect(ssoLink).toBeVisible();
    await expect(ssoLink).toHaveAttribute("href", ssoUrl);
    await expect(page.getByText(/^\s*OR\s*$/)).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-sso-visible.png",
      fullPage: true,
    });
  });
});
