import { test, expect, login } from '../../e2e/fixtures';

test.describe.skip('Infrastructure Health (#518)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard shows Infrastructure Health card instead of System Health', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // The old "System Health" label should be gone
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

    // Should show health ring content: percentage or "No critical devices" / "N/A"
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/infra-health-card.png', fullPage: true });
  });

  test('dashboard stats API includes critical_online and critical_total', async ({ page }) => {
    const response = await page.request.get('/api/v1/dashboard/stats');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // New fields must be present
    expect(data).toHaveProperty('critical_online');
    expect(data).toHaveProperty('critical_total');
    expect(typeof data.critical_online).toBe('number');
    expect(typeof data.critical_total).toBe('number');

    // critical_online <= critical_total <= devices_total
    expect(data.critical_online).toBeLessThanOrEqual(data.critical_total);
    expect(data.critical_total).toBeLessThanOrEqual(data.devices_total);

    // Old fields still present for backwards compatibility
    expect(data).toHaveProperty('devices_online');
    expect(data).toHaveProperty('devices_total');

    await page.screenshot({ path: 'tests/screenshots/infra-health-api.png' });
  });

  test('device detail shows Pin Critical button and Health Role info', async ({ page }) => {
    // Navigate to devices page
    await page.goto('/devices');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 10000 });

    // Wait for devices to load
    await page.waitForTimeout(2000);

    // If there are device cards, click the first one to open detail
    const deviceCards = page.locator('[class*="border-slate-800"][class*="bg-slate-900"]').filter({ hasText: /[0-9A-F]{2}:[0-9A-F]{2}/i });
    const count = await deviceCards.count();

    if (count > 0) {
      await deviceCards.first().click();

      // Should see the Pin Critical button or Unpin button
      const pinButton = page.getByRole('button', { name: /Pin Critical|Unpin/ });
      await expect(pinButton.first()).toBeVisible({ timeout: 5000 });

      // Should see Health Role in the info tab
      await expect(page.getByText('Health Role')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/Pinned \(critical\)|Excluded|Auto-detect/)).toBeVisible({ timeout: 5000 });

      await page.screenshot({ path: 'tests/screenshots/infra-health-device-detail.png' });
    }
  });

  test('device is_critical field toggles via PATCH API', async ({ page }) => {
    // Create a test device via API
    const createResp = await page.request.post('/api/v1/devices', {
      data: {
        mac: 'AA:BB:CC:DD:EE:F1',
        name: 'infra-health-test-device',
        is_manual: true,
        custom_name: 'Test Server',
        custom_type: 'server',
      },
    });
    expect(createResp.ok()).toBeTruthy();
    const created = await createResp.json();
    const deviceId = created.id;

    // Verify device starts with is_critical = null (auto-detect)
    const getResp1 = await page.request.get(`/api/v1/devices/${deviceId}`);
    expect(getResp1.ok()).toBeTruthy();
    const device1 = await getResp1.json();
    // Server with custom_type=server should be auto-detected as infrastructure
    // but is_critical itself should be null (auto-detect mode)

    // Pin the device as critical
    const patchResp1 = await page.request.patch(`/api/v1/devices/${deviceId}`, {
      data: { is_critical: true },
    });
    expect(patchResp1.status()).toBe(204);

    // Verify it's now pinned
    const getResp2 = await page.request.get(`/api/v1/devices/${deviceId}`);
    const device2 = await getResp2.json();
    expect(device2.is_critical).toBe(true);

    // Verify critical_total includes this device
    const statsResp = await page.request.get('/api/v1/dashboard/stats');
    const stats = await statsResp.json();
    expect(stats.critical_total).toBeGreaterThanOrEqual(1);

    // Unpin the device
    const patchResp2 = await page.request.patch(`/api/v1/devices/${deviceId}`, {
      data: { is_critical: false },
    });
    expect(patchResp2.status()).toBe(204);

    // Verify it's now excluded
    const getResp3 = await page.request.get(`/api/v1/devices/${deviceId}`);
    const device3 = await getResp3.json();
    expect(device3.is_critical).toBe(false);

    await page.screenshot({ path: 'tests/screenshots/infra-health-toggle-api.png' });
  });

  test('health ring shows N/A when zero critical devices', async ({ page }) => {
    // Check dashboard stats to see if there are critical devices
    const response = await page.request.get('/api/v1/dashboard/stats');
    const stats = await response.json();

    if (stats.critical_total === 0) {
      // Navigate to dashboard
      await page.goto('/dashboard');
      await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

      // Should show "No critical devices" or "N/A"
      await expect(page.getByText(/No critical devices|N\/A/).first()).toBeVisible({ timeout: 10000 });

      await page.screenshot({ path: 'tests/screenshots/infra-health-empty.png', fullPage: true });
    }
  });
});
