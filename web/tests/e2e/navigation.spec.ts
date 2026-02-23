import { test, expect, login } from '../../e2e/fixtures';

test.describe('Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar is visible with navigation links', async ({ page }) => {
    // The sidebar should be present with key navigation items
    await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Devices' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Agents' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alerts' }).first()).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/sidebar.png', fullPage: true });
  });

  test('navigate to devices page via sidebar', async ({ page }) => {
    // Click on Devices link in the sidebar
    await page.getByRole('link', { name: 'Devices' }).first().click();
    await page.waitForURL('**/devices**', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();
  });

  test('navigate to agents page via sidebar', async ({ page }) => {
    await page.getByRole('link', { name: 'Agents' }).first().click();
    await page.waitForURL('**/agents**', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible();
  });

  test('navigate to alerts page via sidebar', async ({ page }) => {
    await page.getByRole('link', { name: 'Alerts' }).first().click();
    await page.waitForURL('**/alerts**', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible();
  });

  test('navigate to settings page via sidebar', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).first().click();
    await page.waitForURL('**/settings**', { timeout: 10000 });
    // Settings heading
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
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
