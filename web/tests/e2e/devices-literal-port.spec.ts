import { test, expect, login } from '../../e2e/fixtures';

// Literal-port verification per design-export runbook.
// The page must render the design's exact chrome (typography utilities,
// header strip, query bar layout, tab labels) regardless of whether the
// backend currently has devices to display.
test.describe('Devices — literal port of devices.jsx + details.jsx', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
  });

  test('header uses .t-display headline and .t-micro eyebrow', async ({ page }) => {
    await expect(page.locator('[data-testid="devices-root"]')).toBeVisible({ timeout: 15000 });
    const headline = page.getByRole('heading', { name: 'Devices', level: 1 });
    await expect(headline).toBeVisible();
    await expect(headline).toHaveClass(/t-display/);
    const eyebrow = page.locator('.t-micro', { hasText: 'Network' }).first();
    await expect(eyebrow).toBeVisible();
    await page.screenshot({
      path: 'tests/screenshots/devices-literal-header.png',
      fullPage: false,
    });
  });

  test('query bar uses .mesh-card chrome with esc kbd hint', async ({ page }) => {
    const bar = page.locator('[data-testid="query-bar"]');
    await expect(bar).toBeVisible({ timeout: 15000 });
    await expect(bar).toHaveClass(/mesh-card/);
    await expect(bar.locator('kbd', { hasText: 'esc' })).toBeVisible();
  });

  test('header action buttons use .btn / .btn-primary recipe', async ({ page }) => {
    const rescan = page.locator('[data-testid="devices-rescan"]');
    const add = page.locator('[data-testid="devices-add"]');
    await expect(rescan).toBeVisible({ timeout: 15000 });
    await expect(rescan).toHaveClass(/btn/);
    await expect(add).toHaveClass(/btn-primary/);
  });

  test('details drawer renders design tab labels (no Edit/WiFi)', async ({ page }) => {
    await page.waitForTimeout(2500);
    const row = page.locator('[data-testid="device-row"]').first();
    const rowCount = await page.locator('[data-testid="device-row"]').count();
    test.skip(rowCount === 0, 'No devices available to open drawer');
    await row.click();
    const drawer = page.locator('[data-testid="device-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    for (const label of ['Overview', 'Traffic', 'Ports', 'DNS', 'Alerts', 'Audit']) {
      await expect(drawer.getByRole('tab', { name: label })).toBeVisible();
    }
    // No Edit tab and no WiFi tab — those concerns moved to /assets.
    await expect(drawer.getByRole('tab', { name: 'Edit' })).toHaveCount(0);
    await expect(drawer.getByRole('tab', { name: 'WiFi' })).toHaveCount(0);
    await page.screenshot({
      path: 'tests/screenshots/devices-literal-drawer.png',
      fullPage: true,
    });
  });
});
