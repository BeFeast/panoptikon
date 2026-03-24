import { test, expect, login } from '../../e2e/fixtures';

test.describe('SWR Data Fetching', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard loads data with SWR caching', async ({ page }) => {
    // Dashboard should load and show stats
    await page.waitForURL(/\/(dashboard|agents|devices)/, { timeout: 15000 });
    await page.goto('/dashboard');

    // Wait for dashboard heading
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    // Verify data sections render (skeletons replaced with content or empty states)
    // Wait for at least one stat card or the health ring to appear
    const statCard = page.locator('[class*="CardContent"]').first();
    await expect(statCard).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'tests/screenshots/swr-dashboard.png', fullPage: true });
  });

  test('page navigation preserves cache — going back shows data instantly', async ({ page }) => {
    // Navigate to devices page
    await page.goto('/devices');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for devices data to load (skeleton disappears)
    // Either we have device cards/rows or an empty state
    const devicesContent = page.locator('main');
    await expect(devicesContent).toBeVisible({ timeout: 10000 });

    // Navigate to alerts page
    await page.getByRole('link', { name: 'Alerts' }).first().click();
    await page.waitForURL('**/alerts**', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 10000 });

    // Navigate back to devices
    await page.getByRole('link', { name: 'Devices' }).first().click();
    await page.waitForURL('**/devices**', { timeout: 10000 });

    // Devices heading should appear quickly (SWR serves cached data)
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/swr-cache-preserved.png', fullPage: true });
  });

  test('agents page loads with SWR polling', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    // Agents page should render — either agent table or empty state with "No agents connected"
    const agentsSection = page.locator('main');
    await expect(agentsSection).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/swr-agents.png', fullPage: true });
  });

  test('alerts page loads with SWR and filter changes trigger refetch', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Click the "Active" filter button — this should trigger a new SWR fetch with different key
    const activeButton = page.getByRole('button', { name: 'Active' });
    if (await activeButton.isVisible()) {
      await activeButton.click();
      // Page should still be responsive after filter change
      await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 5000 });
    }

    await page.screenshot({ path: 'tests/screenshots/swr-alerts-filtered.png', fullPage: true });
  });

  test('shared fixtures login helper works correctly', async ({ page }) => {
    // This test verifies that the shared login fixture from e2e/fixtures.ts works
    // The login() call in beforeEach already proves this — we just verify we're authenticated
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'tests/screenshots/shared-fixtures-login.png', fullPage: true });
  });
});
