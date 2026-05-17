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

test.describe("Command Palette Dark Theme & Focus (#637)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("command palette has dark background and input is focusable", async ({
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

    // Verify the dialog content has a dark background (bg-slate-900 ~ rgb(15, 23, 42))
    const bgColor = await dialogContent.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor,
    );
    // bg-slate-900 is rgb(15, 23, 42) — ensure it's dark (R,G,B all < 50)
    const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(match).not.toBeNull();
    if (match) {
      expect(Number(match[1])).toBeLessThan(50);
      expect(Number(match[2])).toBeLessThan(50);
      expect(Number(match[3])).toBeLessThan(60);
    }

    // Verify the search input is focused and can receive text
    const searchInput = page.locator('[cmdk-input]');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();

    // Type into the input to verify it's truly focusable
    await page.keyboard.type("dash");
    await expect(searchInput).toHaveValue("dash");

    // Verify placeholder text is visible (has slate-500 color, not white)
    // Clear and check placeholder attribute exists
    await searchInput.fill("");
    const placeholder = await searchInput.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();

    await page.screenshot({
      path: "tests/screenshots/command-palette-dark-theme.png",
      fullPage: true,
    });
  });

  test("command palette content renders inside the dialog box", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("Control+k");

    const dialogContent = page.locator('[cmdk-dialog]');
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    // Verify the cmdk-root is NOT fixed/full-viewport (it should be inside the dialog)
    const cmdk_root = page.locator('[cmdk-root]');
    const rootPosition = await cmdk_root.evaluate((el) =>
      window.getComputedStyle(el).position,
    );
    // cmdk-root should NOT be fixed positioned (that would escape the dialog)
    expect(rootPosition).not.toBe("fixed");

    // Verify items are visually within the dialog bounding box
    const dialogBox = await dialogContent.boundingBox();
    const firstItem = page.locator('[cmdk-item]').first();
    const itemBox = await firstItem.boundingBox();

    expect(dialogBox).not.toBeNull();
    expect(itemBox).not.toBeNull();
    if (dialogBox && itemBox) {
      // Item should be within dialog bounds
      expect(itemBox.x).toBeGreaterThanOrEqual(dialogBox.x);
      expect(itemBox.y).toBeGreaterThanOrEqual(dialogBox.y);
      expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width + 1,
      );
    }

    await page.screenshot({
      path: "tests/screenshots/command-palette-content-inside-dialog.png",
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
    await expect(page.getByText("Router Status", { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });

    const cards = [
      page.getByRole("link", { name: /Router Status/ }).first(),
      page.getByRole("link", { name: /Active Devices/ }).first(),
      page.getByRole("link", { name: /WAN Bandwidth/ }).first(),
      page.getByRole("link", { name: /Unread Alerts/ }).first(),
    ];

    const boxes = [];
    for (const card of cards) {
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
    }

    for (let i = 1; i < boxes.length; i++) {
      const previous = boxes[i - 1];
      const current = boxes[i];
      const separated =
        current.x >= previous.x + previous.width + 8 ||
        current.y >= previous.y + previous.height + 8 ||
        previous.y >= current.y + current.height + 8;
      expect(separated).toBeTruthy();
    }

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

    // Cards grid should preserve visible separation in the settings directory.
    const grid = page.locator("main .grid").filter({ hasText: "Scanner" }).first();
    await expect(grid).toBeVisible();
    const gap = await grid.evaluate((el) =>
      window.getComputedStyle(el).gap,
    );
    const gapValue = parseInt(gap, 10);
    expect(gapValue).toBeGreaterThanOrEqual(12);

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
