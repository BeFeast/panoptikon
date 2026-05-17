import { test, expect, PASSWORD } from '../../e2e/fixtures';

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login/');

    await expect(page.getByRole('heading', { name: 'Panoptikon', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Operator')).toHaveValue('operator', { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'reset key' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with SSO' })).toBeVisible();
    await expect(page.getByText('all systems healthy')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/login-page.png', fullPage: true });
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByLabel('Operator')).toHaveValue('operator', { timeout: 15000 });

    await page.fill('#password', 'wrongpassword');
    await page.getByRole('button', { name: /Sign in/i }).click();

    await expect(page.getByText('Invalid password')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/login-error.png', fullPage: true });
  });

  test('login with correct password redirects to dashboard', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByLabel('Operator')).toHaveValue('operator', { timeout: 15000 });

    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /Sign in/i }).click();

    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard-after-login.png', fullPage: true });
  });
});
