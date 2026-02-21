import { test, expect, PASSWORD } from '../../e2e/fixtures';

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login/');
    
    // Wait for hydration - the "Sign in to your network dashboard" text appears after status check
    await expect(page.locator('h1:has-text("Panoptikon")')).toBeVisible();
    await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
    
    // Password input should be present
    await expect(page.locator('#password')).toBeVisible();
    
    // Sign In button should be present
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/login-page.png', fullPage: true });
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
    
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('text=Invalid password')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/login-error.png', fullPage: true });
  });

  test('login with correct password redirects to dashboard', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.locator('text=Sign in to your network dashboard')).toBeVisible({ timeout: 5000 });
    
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    
    // Dashboard heading should be visible
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-after-login.png', fullPage: true });
  });
});
