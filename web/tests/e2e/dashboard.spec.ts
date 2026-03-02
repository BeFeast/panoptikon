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

  test('infrastructure health ring loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Infrastructure Health card should show the health ring or "No critical devices"
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    // The ring shows "X%" and "N/N critical online" or "No critical devices" when empty
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

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
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // The Infrastructure Health card and the stat-cards wrapper are direct children
    // of the top bento grid. Grab all top-level grid children and compare heights.
    const systemHealthCard = page.getByText('Infrastructure Health').locator('xpath=ancestor::div[contains(@class,"border-slate-800")]').first();
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
    // so the UI knows which router is active (mikrotik or none).
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // router_type must be one of the known values
    expect(['mikrotik', 'none']).toContain(data.router_type);
    // router_status must still be present
    expect(['connected', 'disconnected', 'unconfigured']).toContain(data.router_status);

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-type-api.png' });
  });

  test('dashboard stats API returns critical device counts (#518)', async ({ page }) => {
    // The /api/v1/dashboard/stats endpoint must include critical_online and critical_total
    // for the infrastructure health ring.
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
    // The /api/v1/dashboard/stats endpoint should respond quickly even when
    // a router is offline. With the concurrent fetch + 500ms router timeout,
    // the API should never take more than ~1s. We allow 2s for CI slack.
    const start = Date.now();
    const response = await page.request.get('/api/v1/dashboard/stats');
    const elapsed = Date.now() - start;

    expect(response.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(2000);

    const data = await response.json();
    // Sanity-check the response shape
    expect(data).toHaveProperty('router_status');
    expect(data).toHaveProperty('devices_online');
    expect(data).toHaveProperty('wan_rx_bps');

    await page.screenshot({ path: 'tests/screenshots/dashboard-fast-api.png' });
  });

  test('dashboard renders stat cards within 3 seconds', async ({ page }) => {
    // Navigate to dashboard and measure how long it takes for stat cards
    // to appear. With the performance fix, this should be < 3s even if
    // a router integration is offline or slow.
    await page.goto('/dashboard');
    const start = Date.now();

    // Wait for the stat cards to fully render (not skeletons)
    const routerValue = page.getByText(/^(Online|Offline|Unconfigured|Unreachable)$/);
    await expect(routerValue.first()).toBeVisible({ timeout: 5000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);

    await page.screenshot({ path: 'tests/screenshots/dashboard-fast-render.png', fullPage: true });
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
      /Connected to (MikroTik|router)|Cannot reach (MikroTik|router)|Router not configured/
    );
    await expect(subtitle.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/dashboard-router-subtitle.png', fullPage: true });
  });
});
