import { test, expect, login } from "../../e2e/fixtures";

/**
 * Brand palette migration smoke test — verifies login and dashboard pages
 * load correctly after the graphite + signal cyan palette update.
 */
test.describe("Brand palette migration", () => {
  test("login page loads with brand palette", async ({ page }) => {
    await page.goto("/login/");

    // Wait for the login page to render
    await expect(
      page.getByRole("heading", { name: "Panoptikon", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The renewed login surface should expose the reference-screen affordances.
    await expect(page.locator(".login-bg")).toBeVisible();
    await expect(page.getByLabel("Operator")).toHaveValue("operator", {
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: "Continue with SSO" })).toBeVisible();
    await expect(page.getByText("all systems healthy")).toBeVisible();
    await expect(page.getByTestId("brand-mark")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/brand-palette-login.png",
      fullPage: true,
    });
  });

  test("dashboard loads with brand palette", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("main").getByText("core.lan > Overview")).toBeVisible();
    await expect(page.getByTestId("brand-mark").first()).toBeVisible();
    await expect(page.getByTestId("ws-latency-pill")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/brand-palette-dashboard.png",
      fullPage: true,
    });
  });
});
