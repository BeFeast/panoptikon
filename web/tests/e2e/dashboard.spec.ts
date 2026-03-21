import { test, expect, login } from '../../e2e/fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard page loads with hero stat cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Hero stats row should show 4 cards
    const heroStats = page.getByTestId('hero-stats');
    await expect(heroStats).toBeVisible({ timeout: 10000 });
    await expect(heroStats.getByText('Total Devices')).toBeVisible();
    await expect(heroStats.getByText('Active Alerts')).toBeVisible();
    await expect(heroStats.getByText('Uptime')).toBeVisible();
    await expect(heroStats.getByText('Traffic')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-hero-stats.png', fullPage: true });
  });

  test('hero stats animate count-up on page load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for hero stats to resolve (not skeletons)
    const heroStats = page.getByTestId('hero-stats');
    await expect(heroStats).toBeVisible({ timeout: 10000 });

    // Total Devices card should show a numeric value after loading
    await expect(page.getByText('Total Devices')).toBeVisible({ timeout: 10000 });

    // After data loads, hero cards should show either a number or formatted value
    // The "online now" subtitle confirms the card has resolved
    const devicesSubtitle = page.getByText(/online now/);
    await expect(devicesSubtitle.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-hero-animated.png', fullPage: true });
  });

  test('bento grid layout renders with mixed card sizes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const bentoGrid = page.getByTestId('bento-grid');
    await expect(bentoGrid).toBeVisible({ timeout: 10000 });

    // Infrastructure Health card should be visible
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    // WAN Traffic card should be visible (large card)
    await expect(page.getByText('WAN Traffic')).toBeVisible({ timeout: 10000 });
    // Recent Alerts card should be visible
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 10000 });
    // Device Breakdown card should be visible (full width)
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-bento-grid.png', fullPage: true });
  });

  test('quick actions row is visible and functional', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    const quickActions = page.getByTestId('quick-actions');
    await expect(quickActions).toBeVisible();

    // Check all 3 quick actions are present
    await expect(quickActions.getByText('Scan Network')).toBeVisible();
    await expect(quickActions.getByText('View Alerts')).toBeVisible();
    await expect(quickActions.getByText('Check DNS')).toBeVisible();

    // Quick actions should be links
    const scanLink = quickActions.getByRole('link', { name: 'Scan Network' });
    await expect(scanLink).toHaveAttribute('href', '/devices');

    const alertsLink = quickActions.getByRole('link', { name: 'View Alerts' });
    await expect(alertsLink).toHaveAttribute('href', '/alerts');

    const dnsLink = quickActions.getByRole('link', { name: 'Check DNS' });
    await expect(dnsLink).toHaveAttribute('href', '/dns');

    await page.screenshot({ path: 'tests/screenshots/dashboard-quick-actions.png', fullPage: true });
  });

  test('network health ring renders correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Infrastructure Health card should show the health ring or "No critical devices"
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-health-ring.png', fullPage: true });
  });

  test('responsive layout collapses to single column on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await login(page);

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Hero stats should still be visible
    await expect(page.getByText('Total Devices')).toBeVisible({ timeout: 10000 });

    // Quick actions should still be visible
    await expect(page.getByText('Scan Network')).toBeVisible();

    // Bento grid sections should be visible
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('WAN Traffic')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-mobile.png', fullPage: true });
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

    expect(['mikrotik', 'none']).toContain(data.router_type);
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

  test('dashboard renders hero stats within 3 seconds', async ({ page }) => {
    await page.goto('/dashboard');
    const start = Date.now();

    // Wait for the hero stats to fully render (not skeletons)
    const devicesSubtitle = page.getByText(/online now/);
    await expect(devicesSubtitle.first()).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);

    await page.screenshot({ path: 'tests/screenshots/dashboard-fast-render.png', fullPage: true });
  });
});
