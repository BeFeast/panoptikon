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

  test('stat cards resolve from skeleton to real values', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // The stat cards should resolve within 10s — the /api/v1/dashboard/stats
    // endpoint must return valid JSON. If the skeleton never resolves, these
    // assertions will time out (the bug this test catches).
    //
    // "Router Status" card shows one of: Online, Offline, Unconfigured
    const routerCard = page.getByText('Router Status');
    await expect(routerCard).toBeVisible({ timeout: 10000 });

    // After stat cards load, at least one value should be visible.
    // With no router configured, we expect "Unconfigured".
    // With a router configured, we expect "Online" or "Offline".
    const routerValue = page.getByText(/^(Online|Offline|Unconfigured|Unreachable)$/);
    await expect(routerValue.first()).toBeVisible({ timeout: 10000 });

    // "Active Devices" card shows a number
    await expect(page.getByText('Active Devices')).toBeVisible();
    // The value is a number (could be 0)
    const devicesCard = page.locator('text=Active Devices').locator('..').locator('..');
    await expect(devicesCard.getByText(/total known/)).toBeVisible({ timeout: 10000 });

    // "Unread Alerts" card shows a value
    await expect(page.getByText('Unread Alerts')).toBeVisible();
    const alertsCard = page.locator('text=Unread Alerts').locator('..').locator('..');
    await expect(alertsCard.getByText(/All clear|Needs attention/)).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-stat-values.png', fullPage: true });
  });

  test('system health ring loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // System Health card should show the health ring (percentage text)
    await expect(page.getByText('System Health')).toBeVisible({ timeout: 10000 });
    // The ring shows "X%" and "N/N online" — wait for the percentage
    await expect(page.getByText(/\d+%/)).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-health-ring.png', fullPage: true });
  });

  test('dashboard has Recent Alerts section', async ({ page }) => {
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-alerts.png', fullPage: true });
  });

  test('dashboard has Device Breakdown section', async ({ page }) => {
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-devices.png', fullPage: true });
  });

  test('dashboard displays loading state or content', async ({ page }) => {
    // Dashboard should either show content or be in loading state
    // Check that we're on the dashboard and it's responsive
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });
  });
});
