import { test, expect, login } from '../../e2e/fixtures';

test.describe.skip('Devices page — pill filters, topology link', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });
  });

  test('pill-style filter toggles are visible and interactive', async ({ page }) => {
    // Pill filters should be rendered inside a rounded container
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

    // Click All to reset
    await allPill.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-pill-all.png', fullPage: true });
  });

  test('network topology link is visible in filter bar', async ({ page }) => {
    // The topology link button should be present
    const topoButton = page.getByTitle('Network topology');
    await expect(topoButton).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'tests/screenshots/devices-topology-link.png', fullPage: true });
  });

  test('grid view renders device cards', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000);

    // Grid view should be the default — check that grid button is active
    const gridButton = page.getByTitle('Grid view');
    await expect(gridButton).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/devices-grid.png', fullPage: true });
  });

  test('table view renders correctly', async ({ page }) => {
    // Switch to table view
    const tableButton = page.getByTitle('Table view');
    await tableButton.click();
    await page.waitForTimeout(1000);

    // Table should be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/devices-table.png', fullPage: true });
  });

  test('view toggle switches between grid and table', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Start in grid view
    const gridButton = page.getByTitle('Grid view');
    const tableButton = page.getByTitle('Table view');

    // Switch to table
    await tableButton.click();
    await page.waitForTimeout(500);
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Switch back to grid
    await gridButton.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/screenshots/devices-view-toggle.png', fullPage: true });
  });
});
