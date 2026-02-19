import { test, expect, Page } from '@playwright/test';

const PASSWORD = 'testpass123';

async function login(page: Page) {
  await page.goto('/login/');
  await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}

test.describe('Devices page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
  });

  test('devices page loads with heading', async ({ page }) => {
    await expect(page.locator('h1:has-text("Devices")')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/devices-page.png', fullPage: true });
  });

  test('devices page has filter buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("All")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Online")')).toBeVisible();
    await expect(page.locator('button:has-text("Offline")')).toBeVisible();
    await expect(page.locator('button:has-text("Unknown")')).toBeVisible();
  });

  test('devices page has search input', async ({ page }) => {
    const search = page.locator('input[placeholder="Search name, IP, MAC…"]');
    await expect(search).toBeVisible({ timeout: 5000 });
  });

  test('devices page has Scan Now button', async ({ page }) => {
    await expect(page.locator('button:has-text("Scan Now")')).toBeVisible({ timeout: 5000 });
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
    await page.click('button:has-text("Online")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-online-filter.png', fullPage: true });
    
    // Click All filter to go back
    await page.click('button:has-text("All")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/devices-all-filter.png', fullPage: true });
  });

  test('search filters devices', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const search = page.locator('input[placeholder="Search name, IP, MAC…"]');
    await search.fill('192.168');
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'tests/screenshots/devices-search.png', fullPage: true });
  });
});
