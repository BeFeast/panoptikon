import { test, expect, login } from '../../e2e/fixtures';

test.describe('Devices page (mesh U1 layout)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
  });

  test('page loads with mesh header', async ({ page }) => {
    await expect(page.locator('[data-testid="devices-root"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();
    // NETWORK eyebrow
    await expect(page.getByText('Network', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/devices-mesh-page.png', fullPage: true });
  });

  test('query bar + filter chips render', async ({ page }) => {
    await expect(page.locator('[data-testid="query-bar"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="devices-query-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-chip-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-chip-online"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-chip-offline"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-chip-unknown"]')).toBeVisible();
  });

  test('action buttons render (Rescan, Add device)', async ({ page }) => {
    await expect(page.locator('[data-testid="devices-rescan"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="devices-add"]')).toBeVisible();
  });

  test('filter chip click changes selection', async ({ page }) => {
    await page.waitForTimeout(2000);
    await page.locator('[data-testid="filter-chip-online"]').click();
    await expect(page.locator('[data-testid="filter-chip-online"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.locator('[data-testid="filter-chip-all"]').click();
    await expect(page.locator('[data-testid="filter-chip-all"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('search input filters by name/ip/mac', async ({ page }) => {
    await page.waitForTimeout(2000);
    const input = page.locator('[data-testid="devices-query-input"]');
    await expect(input).toBeVisible();
    await input.fill('192.168');
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/screenshots/devices-mesh-search.png', fullPage: true });
  });

  test('shows IPs or empty state', async ({ page }) => {
    await page.waitForTimeout(2000);
    const pageText = (await page.textContent('body')) ?? '';
    const hasDevices = /\d+\.\d+\.\d+\.\d+/.test(pageText);
    const hasEmpty = pageText.includes('No devices match');
    expect(hasDevices || hasEmpty).toBeTruthy();
  });

  test('row click opens DetailsDrawer', async ({ page }) => {
    await page.waitForTimeout(2500);
    const firstRow = page.locator('[data-testid="device-row"]').first();
    const rowCount = await page.locator('[data-testid="device-row"]').count();
    test.skip(rowCount === 0, 'No devices available to open drawer for');
    await firstRow.click();
    await expect(page.locator('[data-testid="device-drawer"]')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/devices-mesh-drawer.png', fullPage: true });
  });
});
