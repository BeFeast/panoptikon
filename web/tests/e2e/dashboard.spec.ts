import { test, expect, login } from '../../e2e/fixtures';
import type { Page } from '@playwright/test';

async function mockDashboardData(page: Page) {
  const now = new Date().toISOString();

  await page.route('**/api/v1/dashboard/stats', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        router_status: 'connected',
        router_type: 'mikrotik',
        devices_online: 2,
        devices_total: 2,
        alerts_unread: 1,
        wan_rx_bps: 1_250_000,
        wan_tx_bps: 250_000,
        critical_online: 1,
        critical_total: 2,
      }),
    });
  });

  await page.route('**/api/v1/alerts?limit=5', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'alert-dashboard-render',
          type: 'device_offline',
          message: 'Core switch uplink saturated',
          severity: 'WARNING',
          is_read: false,
          created_at: now,
        },
      ]),
    });
  });

  await page.route('**/api/v1/traffic/history?minutes=60', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { minute: now, rx_bps: 500_000, tx_bps: 100_000 },
        { minute: now, rx_bps: 1_250_000, tx_bps: 250_000 },
      ]),
    });
  });

  await page.route('**/api/v1/devices', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'dev-core-switch',
          mac: '00:11:22:33:44:55',
          name: 'Core Switch',
          hostname: 'core-gateway',
          vendor: 'MikroTik',
          mdns_services: null,
          is_online: true,
        },
        {
          id: 'dev-nas',
          mac: '00:11:22:33:44:66',
          name: 'Storage NAS',
          hostname: 'storage-nas',
          vendor: 'Synology',
          mdns_services: null,
          is_online: true,
        },
      ]),
    });
  });

  await page.route('**/api/v1/dashboard/top-devices?limit=6', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'dev-core-switch',
          name: 'Core Switch',
          hostname: 'core-gateway',
          ip: '10.0.0.2',
          vendor: 'MikroTik',
          rx_bps: 900_000,
          tx_bps: 125_000,
        },
      ]),
    });
  });

  await page.route('**/api/v1/topology/graph', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        router: {
          router_type: 'mikrotik',
          is_online: true,
          wan_ip: '198.51.100.10',
          hostname: 'edge-mikrotik',
          version: '7.16',
        },
        devices: [
          {
            id: 'dev-core-switch',
            mac: '00:11:22:33:44:55',
            name: 'Core Switch',
            hostname: 'core-gateway',
            vendor: 'MikroTik',
            is_online: true,
            ips: ['10.0.0.2'],
          },
          {
            id: 'dev-nas',
            mac: '00:11:22:33:44:66',
            name: 'Storage NAS',
            hostname: 'storage-nas',
            vendor: 'Synology',
            is_online: false,
            ips: ['10.0.0.10'],
          },
        ],
        positions: [],
      }),
    });
  });
}

async function openDashboard(page: Page) {
  await mockDashboardData(page);
  await login(page);
}

test.describe('Dashboard', () => {
  test('dashboard page loads with stat cards', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for API calls to settle before checking stat cards
    await page.waitForLoadState('networkidle');

    // Should have stat cards (4 of them) — wait for stats to load
    // In error state titles: Router Status, Active Devices, WAN Bandwidth, Unread Alerts
    await expect(page.getByText('Router Status', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active Devices', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('WAN Bandwidth', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Unread Alerts', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-stat-cards.png', fullPage: true });
  });

  test('stat cards show values after load', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for stat cards to resolve from skeleton to real values
    await expect(page.getByText('Router Status', { exact: true })).toBeVisible({ timeout: 10000 });

    // "Active Devices" card shows a number and subtitle
    const devicesSubtitle = page.getByText(/total known/);
    await expect(devicesSubtitle.first()).toBeVisible({ timeout: 10000 });

    // "Unread Alerts" card shows status
    await expect(page.getByText('Unread Alerts', { exact: true })).toBeVisible();
    const alertsSubtitle = page.getByText(/All clear|Needs attention/);
    await expect(alertsSubtitle.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-stat-values.png', fullPage: true });
  });

  test('infrastructure health ring loads', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Infrastructure Health card should show the health ring or "No critical devices"
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    // The ring shows "X%" and "N/N critical online" or "No critical devices" when empty
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-health-ring.png', fullPage: true });
  });

  test('quick actions row is visible', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Quick actions pills should be visible
    await expect(page.getByText('Scan Network')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('View Alerts')).toBeVisible();
    await expect(page.getByText('Check DNS')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-quick-actions.png', fullPage: true });
  });

  test('bento grid layout renders section data', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for API calls to settle before checking bento grid
    await page.waitForLoadState('networkidle');

    // All bento grid sections should be visible and resolved with API-backed data,
    // not only their unconditional section titles.
    await expect(page.getByText('WAN Traffic').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('1.3 Mbps').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('250.0 Kbps').first()).toBeVisible();
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Core switch uplink saturated')).toBeVisible();
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('50%')).toBeVisible();
    await expect(page.getByText('1/2 critical online')).toBeVisible();
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Router Health')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Available router client').first()).toBeVisible();
    await expect(page.getByText('Top Devices')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Core Switch', { exact: true })).toBeVisible();
    await expect(page.getByText('10.0.0.2')).toBeVisible();
    await expect(page.getByText('Topology Preview')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Offline', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Routers')).toBeVisible();
    await expect(page.getByText('Servers')).toBeVisible();
    await expect(page.getByText('Connected to MikroTik')).toBeVisible();
    await expect(page.getByText('2 total known')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-bento-grid.png', fullPage: true });
  });

  test('dashboard has Recent Alerts section', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByText('Recent Alerts')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-alerts.png', fullPage: true });
  });

  test('dashboard has Device Breakdown section', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-devices.png', fullPage: true });
  });

  test('dashboard stats API responds within 2 seconds (#494)', async ({ page }) => {
    await openDashboard(page);
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
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard-full.png', fullPage: true });
  });

  test('dashboard stats API returns router_type field', async ({ page }) => {
    await openDashboard(page);
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(['mikrotik', 'pfsense', 'none']).toContain(data.router_type);
    expect(['connected', 'disconnected', 'unconfigured']).toContain(data.router_status);

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-type-api.png' });
  });

  test('dashboard stats API returns critical device counts (#518)', async ({ page }) => {
    await openDashboard(page);
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
    await openDashboard(page);
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
    await openDashboard(page);
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
    await openDashboard(page);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // All stat cards should still be visible
    await expect(page.getByText('Router Status', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Active Devices', { exact: true })).toBeVisible();

    // Quick actions should be visible
    await expect(page.getByText('Scan Network')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-mobile.png', fullPage: true });
  });
});
