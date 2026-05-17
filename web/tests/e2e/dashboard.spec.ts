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

  await page.route('**/api/v1/alerts?limit=*', async (route) => {
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

  await page.route('**/api/v1/traffic/history**', async (route) => {
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

  await page.route('**/api/v1/dashboard/top-devices**', async (route) => {
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
  test('dashboard hero renders core.lan title and KPI row', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('dashboard-title')).toHaveText('core.lan');
    // "Overview" appears both in the eyebrow and the layout breadcrumb,
    // so accept any match here.
    await expect(page.getByText('Overview', { exact: true }).first()).toBeVisible();

    // Wait for API calls to settle so KPIs leave their loading state.
    await page.waitForLoadState('networkidle');

    // KPI labels from the design handoff. The sidebar nav also surfaces
    // "Agents" and "Alerts" so we scope to mesh-kpi components for the
    // disambiguated checks.
    const kpis = page.locator('[data-component="mesh-kpi"]');
    await expect(kpis).toHaveCount(6, { timeout: 15000 });
    await expect(kpis.filter({ hasText: 'Devices online' })).toHaveCount(1);
    await expect(kpis.filter({ hasText: 'Throughput' })).toHaveCount(1);
    await expect(kpis.filter({ hasText: 'Agents' })).toHaveCount(1);
    await expect(kpis.filter({ hasText: 'Alerts' })).toHaveCount(1);
    await expect(kpis.filter({ hasText: 'WAN latency' })).toHaveCount(1);
    await expect(kpis.filter({ hasText: 'DNS blocks' })).toHaveCount(1);

    await page.screenshot({ path: 'tests/screenshots/dashboard-hero.png', fullPage: true });
  });

  test('KPI row resolves to backend-derived values', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('dashboard-title')).toHaveText('core.lan');
    await page.waitForLoadState('networkidle');

    // Devices online: "2 / 2" split across value + unit; assert both visible.
    const kpis = page.locator('[data-component="mesh-kpi"]');
    const devicesKpi = kpis.filter({ hasText: 'Devices online' });
    await expect(devicesKpi).toBeVisible({ timeout: 15000 });
    await expect(devicesKpi).toContainText('2');
    await expect(devicesKpi).toContainText('/ 2');

    // Throughput card should show an Mbps unit.
    const throughputKpi = kpis.filter({ hasText: 'Throughput' });
    await expect(throughputKpi).toContainText('Mbps');

    await page.screenshot({ path: 'tests/screenshots/dashboard-kpi-values.png', fullPage: true });
  });

  test('header action chips render (filter, Add device, Run scan)', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByTestId('dashboard-title')).toHaveText('core.lan');

    await expect(page.getByText('last 24h')).toBeVisible();
    await expect(page.getByText('Add device')).toBeVisible();
    await expect(page.getByText('Run scan')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-actions.png', fullPage: true });
  });

  test('WAN traffic card renders title, legend and range tabs', async ({ page }) => {
    await openDashboard(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'WAN traffic', level: 3 })).toBeVisible({ timeout: 10000 });
    // Legend text is rendered as adjacent inline spans (e.g. "RX 1") — use a substring match.
    await expect(page.getByText(/RX\s+/).first()).toBeVisible();
    await expect(page.getByText(/TX\s+/).first()).toBeVisible();
    // Range tabs.
    for (const r of ['1h', '6h', '24h', '7d']) {
      await expect(page.getByRole('button', { name: r, exact: true })).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/dashboard-wan-traffic.png', fullPage: true });
  });

  test('top talkers table lists device rows with IP', async ({ page }) => {
    await openDashboard(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Top talkers · 24h')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Core Switch', { exact: true })).toBeVisible();
    await expect(page.getByText('10.0.0.2')).toBeVisible();
    await expect(page.getByTestId('top-talker-row').first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-top-talkers.png', fullPage: true });
  });

  test('topology mini card renders with footer counts', async ({ page }) => {
    await openDashboard(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Topology', level: 3 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'open →' })).toBeVisible();
    await expect(page.getByText(/\d+ devices/).first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-topo.png', fullPage: true });
  });

  test('recent events panel renders alert rows', async ({ page }) => {
    await openDashboard(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Recent events', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Core switch uplink saturated')).toBeVisible();
    await expect(page.getByTestId('recent-event-row').first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-events.png', fullPage: true });
  });

  test('subnet utilization grid renders subnet card derived from topology', async ({ page }) => {
    await openDashboard(page);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Subnet utilization', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('subnet-card').first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dashboard-subnets.png', fullPage: true });
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

  test('responsive layout collapses to single column on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDashboard(page);
    // On a 375px viewport the sidebar may collapse with a redirect lag;
    // give the hero a generous timeout instead of asserting immediately.
    await expect(page.getByTestId('dashboard-title')).toHaveText('core.lan', { timeout: 20000 });

    // Header eyebrow still visible. The sidebar nav also renders "Overview"
    // but is hidden on mobile, so filter to a visible match.
    const overviewMatches = page.getByText('Overview', { exact: true });
    await expect(async () => {
      const count = await overviewMatches.count();
      let anyVisible = false;
      for (let i = 0; i < count; i++) {
        if (await overviewMatches.nth(i).isVisible()) {
          anyVisible = true;
          break;
        }
      }
      expect(anyVisible).toBe(true);
    }).toPass({ timeout: 10000 });

    // KPI card label survives mobile breakpoint.
    const kpis = page.locator('[data-component="mesh-kpi"]');
    await expect(kpis.filter({ hasText: 'Devices online' })).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-mobile.png', fullPage: true });
  });
});
