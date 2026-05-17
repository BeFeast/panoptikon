import { test, expect } from '../../e2e/fixtures';

test.describe('Login password validation', () => {
  test('short password (< 8 chars) is rejected on login', async ({ page }) => {
    await page.goto('/login/');

    await expect(page.getByLabel('Operator')).toHaveValue('operator', { timeout: 15000 });

    await page.fill('#password', 'short');
    await page.getByRole('button', { name: /Sign in/i }).click();

    await expect(page.getByText('Invalid password')).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: 'tests/screenshots/login-short-password.png',
      fullPage: true,
    });
  });
});
