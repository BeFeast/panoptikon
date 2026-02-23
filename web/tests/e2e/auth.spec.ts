import { test, expect, PASSWORD } from '../../e2e/fixtures';

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login/');
    
    // Wait for hydration - the "Sign in to your network dashboard" text appears after status check
    await expect(page.getByRole('heading', { name: 'Panoptikon', level: 1 })).toBeVisible();
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });
    
    // Password input should be present
    await expect(page.locator('#password')).toBeVisible();
    
    // Sign In button should be present
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/login-page.png', fullPage: true });
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });
    
    await page.fill('#password', 'wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should show error message
    await expect(page.getByText('Invalid password')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/login-error.png', fullPage: true });
  });

  test('login with correct password redirects to dashboard', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });
    
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should redirect to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    
    // Dashboard heading should be visible
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-after-login.png', fullPage: true });
  });
});
