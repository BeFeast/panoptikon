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
    await expect(page.getByRole("button", { name: "Continue with SSO" })).toBeVisible();
    await expect(page.getByText("all systems healthy")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/login-rebrand.png",
      fullPage: true,
    });
  });
});
