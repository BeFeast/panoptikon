import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E test for the version display in the sidebar.
 * Verifies the UI fetches the version from the backend API
 * instead of showing a hardcoded value from package.json.
 */
test.describe("Version display", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("sidebar shows server version from /api/v1/version", async ({ page }) => {
    // First, fetch the version from the API directly to know what to expect
    const response = await page.request.get("/api/v1/version");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.version).toBeTruthy();

    const expectedVersion = `v${data.version}`;

    // Navigate to dashboard where sidebar is visible
    await page.goto("/dashboard/");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The sidebar version text should contain the server version
    const versionText = page.locator("text=Panoptikon v");
    await expect(versionText).toBeVisible({ timeout: 10000 });
    await expect(versionText).toContainText(`Panoptikon ${expectedVersion}`);

    // Ensure the old hardcoded "v0.5.0" is NOT displayed
    await expect(page.locator("text=v0.5.0")).not.toBeVisible();

    await page.screenshot({ path: "tests/screenshots/version-sidebar.png" });
  });
});
