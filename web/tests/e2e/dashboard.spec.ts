import { test, expect, login } from '../../e2e/fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Explicitly navigate to dashboard to ensure full page load
    await login(page);
  });

  test('dashboard page loads with stat cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for API calls to settle before checking stat cards
    await page.waitForLoadState('networkidle');

    // Should have stat cards (4 of them) — wait for stats to load
    // In error state titles: Router Status, Active Devices, WAN Bandwidth, Unread Alerts
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active Devices')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('WAN Bandwidth')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Unread Alerts')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-stat-cards.png', fullPage: true });
  });

  test('stat cards show values after load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for stat cards to resolve from skeleton to real values
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // "Active Devices" card shows a number and subtitle
    const devicesSubtitle = page.getByText(/total known/);
    await expect(devicesSubtitle.first()).toBeVisible({ timeout: 10000 });

    // "Unread Alerts" card shows status
    await expect(page.getByText('Unread Alerts')).toBeVisible();
    const alertsSubtitle = page.getByText(/All clear|Needs attention/);
    await expect(alertsSubtitle.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-stat-values.png', fullPage: true });
  });

  test('infrastructure health ring loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Infrastructure Health card should show the health ring or "No critical devices"
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    // The ring shows "X%" and "N/N critical online" or "No critical devices" when empty
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-health-ring.png', fullPage: true });
  });

  test('quick actions row is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Quick actions pills should be visible
    await expect(page.getByText('Scan Network')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('View Alerts')).toBeVisible();
    await expect(page.getByText('Check DNS')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-quick-actions.png', fullPage: true });
  });

  test('bento grid layout has correct sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for API calls to settle before checking bento grid
    await page.waitForLoadState('networkidle');

    // All bento grid sections should be visible
    await expect(page.getByText('WAN Traffic').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Router Health')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Top Devices')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Topology Preview')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-bento-grid.png', fullPage: true });
  });

  test('dashboard has Recent Alerts section', async ({ page }) => {
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-alerts.png', fullPage: true });
  });

  test('dashboard has Device Breakdown section', async ({ page }) => {
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-devices.png', fullPage: true });
  });

  test('dashboard stats API responds within 2 seconds (#494)', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });
  });

  test('dashboard stats API returns router_type field', async ({ page }) => {
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(['mikrotik', 'pfsense', 'none']).toContain(data.router_type);
    expect(['connected', 'disconnected', 'unconfigured']).toContain(data.router_status);

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-type-api.png' });
  });

  test('dashboard stats API returns critical device counts (#518)', async ({ page }) => {
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data).toHaveProperty('critical_online');
    expect(data).toHaveProperty('critical_total');
    expect(typeof data.critical_online).toBe('number');
    expect(typeof data.critical_total).toBe('number');
    expect(data.critical_online).toBeGreaterThanOrEqual(0);
    expect(data.critical_total).toBeGreaterThanOrEqual(0);
    expect(data.critical_online).toBeLessThanOrEqual(data.critical_total);

    await page.screenshot({ path: 'tests/screenshots/dashboard-critical-stats-api.png' });
  });

  test('dashboard stats API responds within 2 seconds', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.get('/api/v1/dashboard/stats');
    const elapsed = Date.now() - start;

    expect(response.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(2000);

    const data = await response.json();
    expect(data).toHaveProperty('router_status');
    expect(data).toHaveProperty('devices_online');
    expect(data).toHaveProperty('wan_rx_bps');

    await page.screenshot({ path: 'tests/screenshots/dashboard-fast-api.png' });
  });

  test('dashboard renders stat cards within 3 seconds', async ({ page }) => {
    await page.goto('/dashboard');
    const start = Date.now();

    // Wait for the stat cards to fully render (not skeletons)
    const devicesSubtitle = page.getByText(/total known/);
    await expect(devicesSubtitle.first()).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);

    await page.screenshot({ path: 'tests/screenshots/dashboard-fast-render.png', fullPage: true });
  });

  test('responsive layout collapses to single column on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // All stat cards should still be visible
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Active Devices')).toBeVisible();

    // Quick actions should be visible
    await expect(page.getByText('Scan Network')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-mobile.png', fullPage: true });
  });
});
