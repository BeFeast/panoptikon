import { test, expect, login } from '../../e2e/fixtures';

test.describe.skip('Critical Devices Dialog (#528)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('critical-devices API returns list with expected fields', async ({ page }) => {
    // Create a test device that will be auto-detected as critical
    const createResp = await page.request.post('/api/v1/devices', {
      data: {
        mac: 'CC:DD:EE:FF:00:28',
        is_manual: true,
        custom_name: 'Critical Dialog Test Server',
        custom_type: 'server',
      },
    });
    expect(createResp.ok()).toBeTruthy();

    // Fetch critical devices list
    const response = await page.request.get('/api/v1/dashboard/critical-devices');
    expect(response.ok()).toBeTruthy();
    const devices = await response.json();

    expect(Array.isArray(devices)).toBeTruthy();
    expect(devices.length).toBeGreaterThanOrEqual(1);

    // Verify structure of the first device
    const dev = devices[0];
    expect(dev).toHaveProperty('id');
    expect(dev).toHaveProperty('is_online');
    expect(dev).toHaveProperty('classification');
    expect(['pinned', 'auto']).toContain(dev.classification);

    await page.screenshot({ path: 'tests/screenshots/critical-devices-api.png' });
  });

  test('clicking Infrastructure Health card opens critical devices dialog', async ({ page }) => {
    // Create a test device that qualifies as critical
    await page.request.post('/api/v1/devices', {
      data: {
        mac: 'CC:DD:EE:FF:01:28',
        is_manual: true,
        custom_name: 'Dialog Click Test NAS',
        custom_type: 'nas',
      },
    });

    // Navigate to dashboard
    await page.goto('/dashboard');
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

    // Wait for stats to load (health ring should show a percentage or N/A)
    await expect(page.getByText(/\d+%|No critical devices|N\/A/).first()).toBeVisible({ timeout: 10000 });

    // Click the health card
    const healthCard = page.locator('[data-testid="infra-health-card"]');
    await expect(healthCard).toBeVisible();
    await healthCard.click();

    // Dialog should appear with "Critical Devices" title
    await expect(page.getByRole('heading', { name: 'Critical Devices' })).toBeVisible({ timeout: 5000 });

    // Should show at least our test device
    await expect(page.getByText('Dialog Click Test NAS')).toBeVisible({ timeout: 5000 });

    // Each device should show online/offline status
    await expect(page.getByText(/Online|Offline/).first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/critical-devices-dialog.png' });
  });

  test('dialog shows device classification (pinned vs auto)', async ({ page }) => {
    // Create a device and pin it as critical
    const createResp = await page.request.post('/api/v1/devices', {
      data: {
        mac: 'CC:DD:EE:FF:02:28',
        is_manual: true,
        custom_name: 'Pinned Critical Device',
        custom_type: 'phone', // Not auto-infra type
      },
    });
    const created = await createResp.json();

    // Pin as critical
    await page.request.patch(`/api/v1/devices/${created.id}`, {
      data: { is_critical: true },
    });

    // Fetch critical devices and verify classification
    const response = await page.request.get('/api/v1/dashboard/critical-devices');
    const devices = await response.json();

    const pinned = devices.find((d: { id: string }) => d.id === created.id);
    expect(pinned).toBeDefined();
    expect(pinned.classification).toBe('pinned');

    // Navigate to dashboard and open dialog
    await page.goto('/dashboard');
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for stats to load

    const healthCard = page.locator('[data-testid="infra-health-card"]');
    await healthCard.click();

    await expect(page.getByRole('heading', { name: 'Critical Devices' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pinned Critical Device')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/critical-devices-pinned.png' });
  });

  test('dialog can be closed', async ({ page }) => {
    // Ensure there's at least one critical device
    await page.request.post('/api/v1/devices', {
      data: {
        mac: 'CC:DD:EE:FF:03:28',
        is_manual: true,
        custom_name: 'Close Dialog Test Router',
        custom_type: 'router',
      },
    });

    await page.goto('/dashboard');
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // Open dialog
    const healthCard = page.locator('[data-testid="infra-health-card"]');
    await healthCard.click();
    await expect(page.getByRole('heading', { name: 'Critical Devices' })).toBeVisible({ timeout: 5000 });

    // Close via the X button
    await page.locator('button:has(.sr-only:text("Close"))').click();

    // Dialog should be gone
    await expect(page.getByRole('heading', { name: 'Critical Devices' })).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: 'tests/screenshots/critical-devices-dialog-closed.png' });
  });
});
