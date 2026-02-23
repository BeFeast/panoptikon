import { test, expect, login } from '../../e2e/fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard page loads with stat cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    
    // Should have stat cards (4 of them)
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Active Devices')).toBeVisible();
    await expect(page.getByText('WAN Bandwidth')).toBeVisible();
    await expect(page.getByText('Unread Alerts')).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/dashboard-stats.png', fullPage: true });
  });

  test('dashboard has Recent Alerts section', async ({ page }) => {
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-alerts.png', fullPage: true });
  });

  test('dashboard displays loading state or content', async ({ page }) => {
    // Dashboard should either show content or be in loading state
    // Check that we're on the dashboard and it's responsive
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });
  });
});
