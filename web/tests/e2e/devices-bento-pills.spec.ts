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

    // Click Online pill and wait for it to become active
    await onlinePill.click();
    await expect(onlinePill).toHaveClass(/text-white/, { timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/devices-pill-online.png', fullPage: true });

    // Click Offline pill and wait for it to become active
    await offlinePill.click();
    await expect(offlinePill).toHaveClass(/text-white/, { timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/devices-pill-offline.png', fullPage: true });

    // Click All pill to reset
    await allPill.click();
    await expect(allPill).toHaveClass(/text-white/, { timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/devices-pill-all.png', fullPage: true });
  });

  test('grid view renders with bento layout', async ({ page }) => {
    // Ensure grid view is selected
    const gridButton = page.locator('button[title="Grid view"]');
    await gridButton.click();

    // Grid container should exist
    const grid = page.locator('.grid.auto-rows-auto');
    await expect(grid).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-bento-grid.png', fullPage: true });
  });

  test('table view has color-coded left borders', async ({ page }) => {
    // Switch to table view
    const tableButton = page.locator('button[title="Table view"]');
    await tableButton.click();

    // Table should be visible
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // At least one row should carry border-l-2 (color-coded left border)
    const coloredRow = page.locator('tr.border-l-2');
    await expect(coloredRow.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-table-borders.png', fullPage: true });
  });

  test('network map toggle links to topology page', async ({ page }) => {
    // Network Map link should be visible (it's an <a>, not a <button>)
    const mapLink = page.locator('a[title="Network Map"]');
    await expect(mapLink).toBeVisible({ timeout: 10000 });

    // Click it and verify navigation to topology
    await mapLink.click();
    await page.waitForURL(/\/topology/, { timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/devices-topology-link.png', fullPage: true });
  });

  test('view toggle buttons maintain state', async ({ page }) => {
    // Switch to table view
    const tableButton = page.locator('button[title="Table view"]');
    await tableButton.click();

    // Table should be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Switch back to grid view
    const gridButton = page.locator('button[title="Grid view"]');
    await gridButton.click();

    // Grid should be visible (cards instead of table)
    await expect(page.locator('.grid.auto-rows-auto')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-view-toggle.png', fullPage: true });
  });
});
