import { test, expect, Page } from '@playwright/test';

const PASSWORD = 'testpass123';

async function login(page: Page) {
  await page.goto('/login/');
  await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard page loads with stat cards', async ({ page }) => {
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    
    // Should have stat cards (4 of them)
    await expect(page.locator('text=Router Status')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Active Devices')).toBeVisible();
    await expect(page.locator('text=WAN Bandwidth')).toBeVisible();
    await expect(page.locator('text=Unread Alerts')).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/dashboard-stats.png', fullPage: true });
  });

  test('dashboard has Recent Alerts section', async ({ page }) => {
    await expect(page.locator('text=Recent Alerts')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-alerts.png', fullPage: true });
  });

  test('dashboard has Top Devices by Bandwidth section', async ({ page }) => {
    await expect(page.locator('text=Top Devices by Bandwidth')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-top-devices.png', fullPage: true });
  });
});
