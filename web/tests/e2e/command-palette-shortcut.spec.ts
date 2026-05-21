import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E coverage for the global Cmd+K / Ctrl+K shortcut (#805).
 *
 * Verifies that pressing the platform-appropriate shortcut from any
 * authenticated route opens the command palette and lands focus on the
 * search input ready for typing, and that Escape closes the palette.
 */
test.describe("Cmd+K / Ctrl+K global search shortcut (#805)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Control+K opens the palette and focuses the search input", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeHidden();

    await page.keyboard.press("Control+k");

    await expect(dialog).toBeVisible({ timeout: 3000 });

    const searchInput = page.locator("[cmdk-input]");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();

    // Typing immediately should land in the palette input, not the sidebar.
    await page.keyboard.type("dash");
    await expect(searchInput).toHaveValue("dash");

    await page.screenshot({
      path: "tests/screenshots/cmdk-shortcut-opens-palette.png",
      fullPage: true,
    });
  });

  test("Meta+K (macOS shortcut) also opens the palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[cmdk-input]")).toBeFocused();
  });

  test("Escape closes the palette after opening with Ctrl+K", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });

  test("shortcut works while focus is in a text input", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Sidebar inline search input advertises ⌘K next to it; focus it first
    // to simulate a user already typing in a text field when they invoke the
    // global shortcut.
    const sidebarSearch = page
      .locator('input[placeholder="Search"]')
      .first();
    if (await sidebarSearch.count()) {
      await sidebarSearch.focus();
      await expect(sidebarSearch).toBeFocused();
    }

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[cmdk-input]")).toBeFocused();
  });

  test("Ctrl+K from a non-dashboard route also opens the palette", async ({
    page,
  }) => {
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[cmdk-input]")).toBeFocused();
  });
});
