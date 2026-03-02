import { test, expect, login } from '../../e2e/fixtures';

test.describe('Critical Devices Modal (#528)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('clicking Infrastructure Health card opens critical devices modal', async ({ page }) => {
    // Dashboard should load
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

    // Wait for health ring to render (either percentage or N/A)
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    // Click the health ring button to open the modal
    const viewDetailsButton = page.getByRole('button', { name: 'View critical devices' });
    await viewDetailsButton.click();

    // Modal should appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Critical Devices')).toBeVisible();
    await expect(page.getByText('Devices included in the Infrastructure Health metric')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/critical-devices-modal.png' });
  });

  test('critical devices API endpoint returns valid data', async ({ page }) => {
    const response = await page.request.get('/api/v1/dashboard/critical-devices');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(Array.isArray(data)).toBeTruthy();

    // If there are devices, validate their shape
    if (data.length > 0) {
      const dev = data[0];
      expect(dev).toHaveProperty('id');
      expect(dev).toHaveProperty('name');
      expect(dev).toHaveProperty('is_online');
      expect(dev).toHaveProperty('last_seen_at');
      expect(dev).toHaveProperty('classification');
      expect(typeof dev.is_online).toBe('boolean');
      expect(['pinned', 'auto']).toContain(dev.classification);
    }

    await page.screenshot({ path: 'tests/screenshots/critical-devices-api.png' });
  });

  test('modal shows empty state or device list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

    // Wait for stats to load
    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    // Open the modal
    const viewDetailsButton = page.getByRole('button', { name: 'View critical devices' });
    await viewDetailsButton.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Should show either a list of devices with status dots or the empty state message
    const deviceLinks = page.getByRole('dialog').locator('a[href*="/devices/"]');
    const emptyMessage = page.getByText('No critical devices found');
    const deviceCount = await deviceLinks.count();

    if (deviceCount === 0) {
      await expect(emptyMessage).toBeVisible({ timeout: 5000 });
    } else {
      // Each device link should be visible
      await expect(deviceLinks.first()).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/critical-devices-modal-content.png' });
  });

  test('modal can be closed', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Infrastructure Health')).toBeVisible({ timeout: 10000 });

    const healthContent = page.getByText(/\d+%|No critical devices|N\/A/);
    await expect(healthContent.first()).toBeVisible({ timeout: 10000 });

    // Open
    const viewDetailsButton = page.getByRole('button', { name: 'View critical devices' });
    await viewDetailsButton.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Close via X button
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: 'tests/screenshots/critical-devices-modal-closed.png' });
  });
});
