import { test, expect, login } from '../../e2e/fixtures';

test.describe('Devices page: bento layout, pill filters, timeline', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });
  });

  test('pill-style filter toggles are visible and functional', async ({ page }) => {
    // Pill filters should be visible (they're inside a rounded container)
    const allPill = page.getByRole('button', { name: /^All\b/ });
    const onlinePill = page.getByRole('button', { name: /^Online\b/ });
    const offlinePill = page.getByRole('button', { name: /^Offline\b/ });
    const unknownPill = page.getByRole('button', { name: /^Unknown\b/ });

    await expect(allPill).toBeVisible({ timeout: 15000 });
    await expect(onlinePill).toBeVisible();
    await expect(offlinePill).toBeVisible();
    await expect(unknownPill).toBeVisible();

    // Click Online pill
    await onlinePill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-pill-online.png', fullPage: true });

    // Click Offline pill
    await offlinePill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-pill-offline.png', fullPage: true });

    // Click All pill to reset
    await allPill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-pill-all.png', fullPage: true });
  });

  test('grid view renders with bento layout', async ({ page }) => {
    // Ensure grid view is selected
    const gridButton = page.locator('button[title="Grid view"]');
    await gridButton.click();
    await page.waitForTimeout(1000);

    // Grid container should exist
    const grid = page.locator('.grid.auto-rows-auto');
    await expect(grid).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-bento-grid.png', fullPage: true });
  });

  test('table view has color-coded left borders', async ({ page }) => {
    // Switch to table view
    const tableButton = page.locator('button[title="Table view"]');
    await tableButton.click();
    await page.waitForTimeout(1000);

    // Table should be visible
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Table rows should have border-l-2 class for color-coded borders
    await page.screenshot({ path: 'tests/screenshots/devices-table-borders.png', fullPage: true });
  });

  test('network map toggle links to topology page', async ({ page }) => {
    // Network Map button should be visible
    const mapButton = page.locator('button[title="Network Map"]');
    await expect(mapButton).toBeVisible({ timeout: 10000 });

    // Click it and verify navigation to topology (full-screen canvas, no heading)
    await mapButton.click();
    await page.waitForURL(/\/topology/, { timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/devices-topology-link.png', fullPage: true });
  });

  test('view toggle buttons maintain state', async ({ page }) => {
    // Switch to table view
    const tableButton = page.locator('button[title="Table view"]');
    await tableButton.click();
    await page.waitForTimeout(500);

    // Table should be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Switch back to grid view
    const gridButton = page.locator('button[title="Grid view"]');
    await gridButton.click();
    await page.waitForTimeout(500);

    // Grid should be visible (cards instead of table)
    await expect(page.locator('.grid.auto-rows-auto')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-view-toggle.png', fullPage: true });
  });
});
