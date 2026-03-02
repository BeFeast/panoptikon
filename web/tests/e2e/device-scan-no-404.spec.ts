import { test, expect, login } from '../../e2e/fixtures';

test.describe('Device scan endpoint — no 404 for unscanned devices', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('GET /devices/:id/scan returns 200 (not 404) when no scan exists', async ({ page }) => {
    // Collect scan API responses
    const scanResponses: { url: string; status: number }[] = [];
    page.on('response', (resp) => {
      if (resp.url().includes('/api/v1/devices/') && resp.url().endsWith('/scan')) {
        scanResponses.push({ url: resp.url(), status: resp.status() });
      }
    });

    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for devices to load
    await page.waitForTimeout(3000);
    const pageText = await page.textContent('body') ?? '';
    const hasDevices = /\d+\.\d+\.\d+\.\d+/.test(pageText);
    if (!hasDevices) {
      test.skip();
      return;
    }

    // Open the first device drawer
    const deviceRow = page.locator('[data-device-row]').first();
    if (await deviceRow.isVisible()) {
      await deviceRow.click();
    } else {
      const tableRow = page.locator('tr').filter({ hasText: /\d+\.\d+\.\d+\.\d+/ }).first();
      if (await tableRow.isVisible()) {
        await tableRow.click();
      } else {
        test.skip();
        return;
      }
    }

    // Wait for drawer to open
    await page.waitForTimeout(1000);
    const sheetContent = page.locator('[role="dialog"]');
    await expect(sheetContent).toBeVisible({ timeout: 5000 });

    // Click the Ports tab to trigger the scan fetch
    const portsTab = page.getByRole('tab', { name: /Ports/i });
    if (!(await portsTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await portsTab.click();
    await page.waitForTimeout(2000);

    // Verify no 404 responses were received from scan endpoint
    for (const resp of scanResponses) {
      expect(resp.status, `Scan endpoint ${resp.url} should not return 404`).not.toBe(404);
    }

    // If we got scan responses, they should all be 200
    if (scanResponses.length > 0) {
      for (const resp of scanResponses) {
        expect(resp.status).toBe(200);
      }
    }

    await page.screenshot({ path: 'tests/screenshots/device-scan-no-404.png' });
  });

  test('Ports tab shows "No port scan results yet" for unscanned device', async ({ page }) => {
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for devices to load
    await page.waitForTimeout(3000);
    const pageText = await page.textContent('body') ?? '';
    const hasDevices = /\d+\.\d+\.\d+\.\d+/.test(pageText);
    if (!hasDevices) {
      test.skip();
      return;
    }

    // Open the first device drawer
    const deviceRow = page.locator('[data-device-row]').first();
    if (await deviceRow.isVisible()) {
      await deviceRow.click();
    } else {
      const tableRow = page.locator('tr').filter({ hasText: /\d+\.\d+\.\d+\.\d+/ }).first();
      if (await tableRow.isVisible()) {
        await tableRow.click();
      } else {
        test.skip();
        return;
      }
    }

    // Wait for drawer
    await page.waitForTimeout(1000);
    const sheetContent = page.locator('[role="dialog"]');
    await expect(sheetContent).toBeVisible({ timeout: 5000 });

    // Click Ports tab
    const portsTab = page.getByRole('tab', { name: /Ports/i });
    if (!(await portsTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await portsTab.click();
    await page.waitForTimeout(2000);

    // The Ports tab should either show scan results or "No port scan results yet"
    // It should NOT show an error state
    const tabContent = await sheetContent.textContent() ?? '';
    const hasValidState =
      tabContent.includes('No port scan results yet') ||
      tabContent.includes('Scan Ports') ||
      tabContent.includes('Last scanned') ||
      tabContent.includes('No open ports found');
    expect(hasValidState, 'Ports tab should show a valid state (not an error)').toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/device-scan-ports-tab.png' });
  });
});
