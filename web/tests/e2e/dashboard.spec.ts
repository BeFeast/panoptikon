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

  test('top row cards have consistent heights', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for stat cards to resolve so we measure final rendered heights
    await expect(page.getByText('System Health')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // The System Health card and the stat-cards wrapper are direct children
    // of the top bento grid. Grab all top-level grid children and compare heights.
    const systemHealthCard = page.getByText('System Health').locator('xpath=ancestor::div[contains(@class,"border-slate-800")]').first();
    const routerStatusCard = page.getByText('Router Status').locator('xpath=ancestor::div[contains(@class,"border-slate-800")]').first();

    const healthBox = await systemHealthCard.boundingBox();
    const routerBox = await routerStatusCard.boundingBox();

    expect(healthBox).toBeTruthy();
    expect(routerBox).toBeTruthy();

    // Both cards should have h-full, so the stat cards should stretch to match
    // the System Health card. Allow a small tolerance (5px) for sub-pixel rounding.
    const heightDiff = Math.abs(healthBox!.height - routerBox!.height);
    expect(heightDiff).toBeLessThanOrEqual(5);

    await page.screenshot({ path: 'tests/screenshots/dashboard-card-heights.png', fullPage: true });
  });

  test('dashboard stats API responds within 2 seconds (#494)', async ({ page }) => {
    // Bug #494: /api/v1/dashboard/stats used to block 3-5s because check_vyos()
    // always ran with a 5s timeout even when MikroTik was the active router.
    // After the fix, the endpoint should respond in <2s.
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const start = Date.now();
    const response = await page.request.get('/api/v1/dashboard/stats');
    const elapsed = Date.now() - start;

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('router_status');
    expect(body).toHaveProperty('devices_online');
    expect(body).toHaveProperty('devices_total');
    expect(body).toHaveProperty('alerts_unread');

    // Must respond in under 2 seconds (was 3-5s before fix)
    expect(elapsed).toBeLessThan(2000);

    await page.screenshot({ path: 'tests/screenshots/dashboard-stats-perf.png', fullPage: true });
  });

  test('dashboard displays loading state or content', async ({ page }) => {
    // Dashboard should either show content or be in loading state
    // Check that we're on the dashboard and it's responsive
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });
  });

  test('dashboard stats API returns router_type field', async ({ page }) => {
    // The /api/v1/dashboard/stats endpoint must include router_type
    // so the UI knows which router is active (mikrotik, vyos, or none).
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // router_type must be one of the known values
    expect(['mikrotik', 'vyos', 'none']).toContain(data.router_type);
    // router_status must still be present
    expect(['connected', 'disconnected', 'unconfigured']).toContain(data.router_status);

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-type-api.png' });
  });

  test('router status subtitle reflects active router type', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for stat cards to resolve
    const routerCard = page.getByText('Router Status');
    await expect(routerCard).toBeVisible({ timeout: 10000 });

    // The subtitle should mention the specific router type or show generic text
    // depending on what's configured. In a test environment with no router
    // configured, we expect "Router not configured".
    const subtitle = page.getByText(
      /Connected to (MikroTik|VyOS|router)|Cannot reach (MikroTik|VyOS|router)|Router not configured/
    );
    await expect(subtitle.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-subtitle.png', fullPage: true });
  });
});
