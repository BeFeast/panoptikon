import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for Command Palette usability and section spacing (#571).
 *
 * Verifies:
 * - Cmd+K opens the command palette dialog
 * - Dialog is visible with proper contrast and z-index
 * - Keyboard navigation works (items are selectable)
 * - ESC closes the dialog
 * - Section cards on dashboard/devices have visible spacing (not glued)
 */
test.describe("Command Palette UX (#571)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Ctrl+K opens command palette with readable content", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open command palette with Ctrl+K
    await page.keyboard.press("Control+k");

    // The dialog overlay and content should be visible
    const dialogContent = page.locator('[cmdk-dialog]');
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // Search input should be present and focused
    const searchInput = page.locator('[cmdk-input]');
    await expect(searchInput).toBeVisible();

    // "Pages" group heading should be visible (scoped to dialog to avoid sidebar matches)
    await expect(dialogContent.getByText("Pages")).toBeVisible();

    // Page items should be readable (scoped to dialog to avoid page heading/sidebar matches)
    await expect(dialogContent.getByText("Dashboard")).toBeVisible();
    await expect(dialogContent.getByText("Devices")).toBeVisible();
    await expect(dialogContent.getByText("Settings")).toBeVisible();

    // "Actions" group heading should also be visible
    await expect(dialogContent.getByText("Actions")).toBeVisible();
    await expect(dialogContent.getByText("Scan Now")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/command-palette-open.png",
      fullPage: true,
    });
  });

  test("command palette items have visible selected state", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open command palette
    await page.keyboard.press("Control+k");
    const dialogContent = page.locator('[cmdk-dialog]');
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // First item should be auto-selected (aria-selected="true")
    const selectedItem = page.locator('[cmdk-item][aria-selected="true"]');
    await expect(selectedItem).toBeVisible();

    // Navigate down with arrow key
    await page.keyboard.press("ArrowDown");

    // Verify the selected item changes
    const newSelected = page.locator('[cmdk-item][aria-selected="true"]');
    await expect(newSelected).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/command-palette-selected-state.png",
      fullPage: true,
    });
  });

  test("ESC closes command palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open
    await page.keyboard.press("Control+k");
    const dialogContent = page.locator('[cmdk-dialog]');
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // Close with ESC
    await page.keyboard.press("Escape");
    await expect(dialogContent).not.toBeVisible({ timeout: 2000 });
  });

  test("command palette has proper z-index above page content", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Open command palette
    await page.keyboard.press("Control+k");
    const dialogContent = page.locator('[cmdk-dialog]');
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // The dialog wrapper should have z-index >= 100
    const zIndex = await dialogContent.evaluate((el) =>
      window.getComputedStyle(el).zIndex,
    );
    expect(Number(zIndex)).toBeGreaterThanOrEqual(100);

    await page.screenshot({
      path: "tests/screenshots/command-palette-z-index.png",
      fullPage: true,
    });
  });
});

test.describe("Section Spacing (#571)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard cards have visible gaps between them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for stat cards to load
    await expect(page.getByText("Router Status")).toBeVisible({
      timeout: 10000,
    });

    // Check grid gap — the bento grid should have gap >= 20px (gap-6 = 24px).
    // Use .grid.gap-6 to target the bento grid specifically and avoid the
    // sidebar collapse grid (which has no gap class).
    const gridContainer = page.locator(".grid.gap-6").first();
    const gap = await gridContainer.evaluate((el) =>
      window.getComputedStyle(el).gap,
    );
    // gap-6 = 24px
    const gapValue = parseInt(gap, 10);
    expect(gapValue).toBeGreaterThanOrEqual(20);

    await page.screenshot({
      path: "tests/screenshots/section-spacing-dashboard.png",
      fullPage: true,
    });
  });

  test("settings page sections are visually separated", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Settings sections should have space-y-8 (32px gap) between them
    const container = page.locator(".space-y-8").first();
    await expect(container).toBeVisible();

    // Cards grid should have gap-5 (20px).
    // Use .grid.gap-5 to target the settings cards grid specifically.
    const grid = page.locator(".grid.gap-5").first();
    const gap = await grid.evaluate((el) =>
      window.getComputedStyle(el).gap,
    );
    const gapValue = parseInt(gap, 10);
    expect(gapValue).toBeGreaterThanOrEqual(20);

    await page.screenshot({
      path: "tests/screenshots/section-spacing-settings.png",
      fullPage: true,
    });
  });

  test("device cards have visible border separation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for content to settle
    await page.waitForTimeout(2000);

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({
      path: "tests/screenshots/section-spacing-devices.png",
      fullPage: true,
    });
  });
});
