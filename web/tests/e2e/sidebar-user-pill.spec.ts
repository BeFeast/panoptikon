import { expect, test } from "../../e2e/fixtures";

/**
 * E2E coverage for the relocated user menu (P0 from structural audit).
 *
 * Per shell.jsx (122-144) the user pill belongs in the sidebar footer —
 * avatar "op" + "operator" + StatusDot + "core · {uptime}". The TopBar
 * loses its avatar dropdown and keeps only breadcrumb + live pill +
 * icon-only refresh/bell/settings.
 *
 * The pill is dropdown-wrapped (small deviation from shell.jsx) so Logout
 * stays discoverable after removing the TopBar user menu.
 */
test.describe("Sidebar user pill (P0 relocation)", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto("/dashboard/");
  });

  test("sidebar footer shows operator + core · {uptime} (per shell.jsx)", async ({
    authenticatedPage: page,
  }) => {
    const pill = page.getByRole("button", { name: /operator/i });
    await expect(pill).toBeVisible({ timeout: 10000 });

    // "operator" + "op" avatar + status text in mono font with "core · …" uptime.
    await expect(pill).toContainText("operator");
    await expect(pill).toContainText(/core · /);

    await page.screenshot({
      path: "tests/screenshots/sidebar-user-pill.png",
      fullPage: false,
    });
  });

  test("TopBar no longer has a user avatar dropdown", async ({
    authenticatedPage: page,
  }) => {
    // Old contract: TopBar contained a 'A' avatar trigger opening Settings/
    // Change password/Logout. New contract: no such trigger exists.
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    // The old dropdown trigger was the only button with single-letter "A" label.
    const oldAvatar = header.getByRole("button", { name: "A" });
    await expect(oldAvatar).toHaveCount(0);
  });

  test("clicking the sidebar pill opens dropdown with Logout", async ({
    authenticatedPage: page,
  }) => {
    const pill = page.getByRole("button", { name: /operator/i });
    await pill.click();
    const logoutItem = page.getByRole("menuitem", { name: /logout/i });
    await expect(logoutItem).toBeVisible({ timeout: 5000 });
  });
});
