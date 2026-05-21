import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E coverage for the Cmd+K / Ctrl+K global shortcut (#805).
 *
 * Verifies the acceptance criteria on the issue:
 *  - Pressing Cmd+K (mac) or Ctrl+K (non-mac) opens the global command/search
 *    palette consistently from authenticated routes.
 *  - The palette input is focused and ready for typing after the shortcut fires.
 *  - The shortcut works even when focus is inside a text input — i.e. it does
 *    not get swallowed by native browser shortcuts.
 *  - Escape closes the palette (existing UX pattern).
 *  - There is only ever one palette dialog (no duplicate listener fight with
 *    the sidebar search input).
 */
test.describe("Cmd+K global search shortcut (#805)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Ctrl+K opens the palette and focuses the search input", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator("[cmdk-input]");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    await page.keyboard.type("dash");
    await expect(input).toHaveValue("dash");

    await page.screenshot({
      path: "tests/screenshots/cmdk-global-opens-and-focuses.png",
      fullPage: true,
    });
  });

  test("Meta+K (mac shortcut) opens the palette and focuses the search input", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Meta+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator("[cmdk-input]");
    await expect(input).toBeFocused();
  });

  test("Ctrl+K works while focus is inside a text input", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The sidebar search input is a plain text input on the authenticated
    // shell. Focus it first, then fire the shortcut — the palette must still
    // open regardless of where focus currently lives.
    const sidebarInput = page
      .locator('input[placeholder="Search"]')
      .first();
    await expect(sidebarInput).toBeVisible();
    await sidebarInput.click();
    await expect(sidebarInput).toBeFocused();

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeFocused();
  });

  test("Escape closes the palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test("Ctrl+K toggles the palette (second press closes it)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const dialog = page.locator("[cmdk-dialog]");

    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Control+k");
    await expect(dialog).toBeHidden({ timeout: 2000 });
  });

  test("only one palette dialog opens (no duplicate listeners)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");
    const dialogs = page.locator("[cmdk-dialog]");
    await expect(dialogs).toHaveCount(1, { timeout: 3000 });
  });

  test("shortcut works on other authenticated routes (devices)", async ({
    page,
  }) => {
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    const input = page.locator("[cmdk-input]");
    await expect(input).toBeFocused();
  });
});
