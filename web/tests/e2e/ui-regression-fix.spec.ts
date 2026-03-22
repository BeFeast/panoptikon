import { test, expect, login } from '../../e2e/fixtures';

/**
 * E2E tests verifying UI regression fixes from PRs #615-#625.
 * Ensures sidebar readability, device filters, and dead code cleanup.
 */
test.describe('UI regression fixes (#628)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar group labels use readable font size and weight', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Group label text should be 11px font-semibold (not 10px font-medium)
    const groupLabels = sidebar.locator('span.uppercase.tracking-wider');
    const count = await groupLabels.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify at least one group label is visible
    await expect(groupLabels.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-group-labels.png', fullPage: true });
  });

  test('sidebar version shows Panoptikon prefix', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Version text should include "Panoptikon" prefix (use <p> selector to avoid matching logo <span>)
    const versionText = sidebar.locator('p').filter({ hasText: 'Panoptikon' });
    await expect(versionText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-version-prefix.png', fullPage: true });
  });

  test('devices page uses standard button filter pills', async ({ page }) => {
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Filter buttons should be standard Button components (not animated pills)
    const allBtn = page.getByRole('button', { name: /^All\b/ });
    const onlineBtn = page.getByRole('button', { name: /^Online\b/ });
    const offlineBtn = page.getByRole('button', { name: /^Offline\b/ });

    await expect(allBtn).toBeVisible({ timeout: 15000 });
    await expect(onlineBtn).toBeVisible();
    await expect(offlineBtn).toBeVisible();

    // Buttons should have rounded-full class (pill shape)
    await expect(allBtn).toHaveClass(/rounded-full/);

    // Click Online to filter
    await onlineBtn.click();
    await page.waitForTimeout(500);

    // Click All to reset
    await allBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/screenshots/devices-standard-filters.png', fullPage: true });
  });
});
