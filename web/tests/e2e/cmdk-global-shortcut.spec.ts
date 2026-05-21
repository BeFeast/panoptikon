import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E coverage for issue #805 — Cmd+K / Ctrl+K must focus/open the global
 * command + search palette consistently from any authenticated route, even
 * when focus is inside a text input. Escape must close the palette and
 * restore focus to the page.
 */
test.describe("Global Cmd+K / Ctrl+K shortcut (#805)", () => {
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

    // Sanity — the palette is not visible at rest.
    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeHidden();

    await page.keyboard.press("Control+k");

    await expect(dialog).toBeVisible({ timeout: 3000 });
    const input = page.locator("[cmdk-input]");
    await expect(input).toBeFocused();

    // The placeholder hints at the palette's purpose.
    const placeholder = await input.getAttribute("placeholder");
    expect(placeholder).toMatch(/search/i);

    // Typing reaches the palette input (not the page underneath).
    await page.keyboard.type("dash");
    await expect(input).toHaveValue("dash");

    await page.screenshot({
      path: "tests/screenshots/cmdk-global-open.png",
      fullPage: true,
    });
  });

  test("Escape closes the palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const dialog = page.locator("[cmdk-dialog]");

    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });

  test("Ctrl+K toggles the palette closed when pressed again", async ({
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
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });

  test("Ctrl+K opens the palette even when a page input has focus", async ({
    page,
  }) => {
    // Settings has an inline search input that advertises ⌘K. Pressing the
    // shortcut while typing there must still open the global palette.
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const settingsSearch = page.locator('[data-testid="settings-search"]');
    await expect(settingsSearch).toBeVisible();
    await settingsSearch.click();
    await expect(settingsSearch).toBeFocused();

    await page.keyboard.press("Control+k");

    const dialog = page.locator("[cmdk-dialog]");
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[cmdk-input]")).toBeFocused();

    // The settings input should not have received the "k" keystroke because
    // the global handler preventDefault'd it.
    await expect(settingsSearch).toHaveValue("");

    await page.screenshot({
      path: "tests/screenshots/cmdk-global-open-from-input.png",
      fullPage: true,
    });
  });

  test("Ctrl+K works from a route other than dashboard", async ({ page }) => {
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
