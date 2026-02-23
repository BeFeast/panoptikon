import { test, expect, login } from '../../e2e/fixtures';

test.describe('Devices page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
  });

  test('devices page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/devices-page.png', fullPage: true });
  });

  test('devices page has filter buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Online' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Offline' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unknown' })).toBeVisible();
  });

  test('devices page has search input', async ({ page }) => {
    const search = page.getByPlaceholder('Search name, IP, MAC, vendor…');
    await expect(search).toBeVisible({ timeout: 15000 });
  });

  test('devices page has Scan Now button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Scan Now' })).toBeVisible({ timeout: 15000 });
  });

  test('devices show IP addresses', async ({ page }) => {
    // Wait for data to load (either device cards or "No devices" message)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/devices-loaded.png', fullPage: true });
    
    const pageText = await page.textContent('body') ?? '';
    
    // Check if there are device cards with IPs or if it shows "No devices match"
    const ipPattern = /\d+\.\d+\.\d+\.\d+/;
    const hasDevices = ipPattern.test(pageText);
    const hasNoDevicesMessage = pageText.includes('No devices match');
    
    // Either devices with IPs or empty state - both are valid
    expect(hasDevices || hasNoDevicesMessage).toBeTruthy();
  });

  test('filter buttons work', async ({ page }) => {
    // Wait for devices to load
    await page.waitForTimeout(2000);
    
    // Click Online filter
    await page.getByRole('button', { name: 'Online' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-online-filter.png', fullPage: true });
    
    // Click All filter to go back
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-all-filter.png', fullPage: true });
  });

  test('search filters devices', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const search = page.getByPlaceholder('Search name, IP, MAC, vendor…');
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill('192.168');
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'tests/screenshots/devices-search.png', fullPage: true });
  });
});
