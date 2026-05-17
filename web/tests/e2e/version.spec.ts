import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E test for the version display in the sidebar.
 * Verifies the UI fetches the version from the backend API
 * instead of showing a hardcoded value from package.json.
 */
test.describe.skip("Version display", () => {
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

    // Wait for sidebar to be visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // The sidebar version text shows the server version (e.g. "v0.11.3")
    const versionText = sidebar.locator(`text=${expectedVersion}`);
    await expect(versionText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: "tests/screenshots/version-sidebar.png" });
  });
});
