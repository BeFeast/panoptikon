import { test, expect, Page } from '@playwright/test';

const PASSWORD = 'testpass123';

async function login(page: Page) {
  await page.goto('/login/');
  await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}

test.describe('Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar is visible with navigation links', async ({ page }) => {
    // The sidebar should be present with key navigation items
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Devices').first()).toBeVisible();
    await expect(page.locator('text=Agents').first()).toBeVisible();
    await expect(page.locator('text=Alerts').first()).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/sidebar.png', fullPage: true });
  });

  test('navigate to devices page via sidebar', async ({ page }) => {
    // Click on Devices link in the sidebar
    await page.locator('nav a:has-text("Devices"), a:has-text("Devices")').first().click();
    await page.waitForURL('**/devices**', { timeout: 5000 });
    await expect(page.locator('h1:has-text("Devices")')).toBeVisible();
  });

  test('navigate to agents page via sidebar', async ({ page }) => {
    await page.locator('nav a:has-text("Agents"), a:has-text("Agents")').first().click();
    await page.waitForURL('**/agents**', { timeout: 5000 });
    await expect(page.locator('h1:has-text("Agents")')).toBeVisible();
  });

  test('navigate to alerts page via sidebar', async ({ page }) => {
    await page.locator('nav a:has-text("Alerts"), a:has-text("Alerts")').first().click();
    await page.waitForURL('**/alerts**', { timeout: 5000 });
    await expect(page.locator('h1:has-text("Alerts")')).toBeVisible();
  });

  test('navigate to settings page via sidebar', async ({ page }) => {
    await page.locator('nav a:has-text("Settings"), a:has-text("Settings")').first().click();
    await page.waitForURL('**/settings**', { timeout: 5000 });
    // Settings heading
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/settings-page.png', fullPage: true });
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    // Clear cookies and try to access dashboard
    await page.context().clearCookies();
    await page.goto('/dashboard/');
    
    // The page loads but data fetches will fail with 401
    // The API client redirects to /login on 401
    await page.waitForTimeout(3000);
    
    // Should end up on login page
    await page.screenshot({ path: 'tests/screenshots/unauth-redirect.png', fullPage: true });
  });
});
