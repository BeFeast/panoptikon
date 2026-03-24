import { test, expect } from '../../e2e/fixtures';

test.describe('Login password validation', () => {
  test('short password (< 8 chars) is rejected on login', async ({ page }) => {
    await page.goto('/login/');

    // Wait for the login form to be ready
    await expect(
      page.getByText('Sign in to your network operations console'),
    ).toBeVisible({ timeout: 15000 });

    // Enter a short password (fewer than 8 characters)
    await page.fill('#password', 'short');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should show "Invalid password" error (server returns 401)
    await expect(page.getByText('Invalid password')).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: 'tests/screenshots/login-short-password.png',
      fullPage: true,
    });
  });
});
