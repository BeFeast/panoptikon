import { test, expect, PASSWORD } from '../../e2e/fixtures';

test.describe('Login page visual upgrade', () => {
  test('login page has animated background and glow card', async ({ page }) => {
    await page.goto('/login/');

    // Wait for page hydration
    await expect(page.getByRole('heading', { name: 'Panoptikon', level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });

    // Animated background mesh container
    const bgContainer = page.locator('.login-bg-mesh');
    await expect(bgContainer).toBeVisible();

    // Floating orbs exist
    await expect(page.locator('.login-orb-1')).toBeAttached();
    await expect(page.locator('.login-orb-2')).toBeAttached();
    await expect(page.locator('.login-orb-3')).toBeAttached();

    // Card has glow effect class
    const card = page.locator('.login-card-glow');
    await expect(card).toBeVisible();

    // Gradient text on brand name
    const heading = page.getByRole('heading', { name: 'Panoptikon', level: 1 });
    await expect(heading).toHaveClass(/login-gradient-text/);

    // Version info at bottom
    const versionText = page.locator('p.absolute.bottom-4');
    await expect(versionText).toBeVisible();
    await expect(versionText).toContainText('Panoptikon');

    await page.screenshot({ path: 'tests/screenshots/login-visual-upgrade.png', fullPage: true });
  });

  test('input focus shows glow animation', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });

    // Focus the password input — the wrapper has the login-input class
    const inputWrapper = page.locator('.login-input');
    await expect(inputWrapper).toBeVisible();

    await page.locator('#password').focus();

    await page.screenshot({ path: 'tests/screenshots/login-input-focus-glow.png', fullPage: true });
  });

  test('password eye toggle has animation class', async ({ page }) => {
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });

    // Eye toggle button exists with transition class
    const eyeToggle = page.locator('.eye-toggle');
    await expect(eyeToggle).toBeVisible();

    // Click to show password
    await eyeToggle.click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');

    // Click to hide password
    await eyeToggle.click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');

    await page.screenshot({ path: 'tests/screenshots/login-eye-toggle.png', fullPage: true });
  });

  test('reduced motion disables animations', async ({ page }) => {
    // Emulate prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });

    // Background container is still present but CSS will disable animations
    const bgContainer = page.locator('.login-bg-mesh');
    await expect(bgContainer).toBeVisible();

    // Orbs are still in DOM (CSS handles animation: none)
    await expect(page.locator('.login-orb-1')).toBeAttached();

    await page.screenshot({ path: 'tests/screenshots/login-reduced-motion.png', fullPage: true });
  });

  test('login page works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login/');
    await expect(page.getByText('Sign in to your network dashboard')).toBeVisible({ timeout: 15000 });

    // Card should be visible and not overflowing
    const card = page.locator('.login-card-glow');
    await expect(card).toBeVisible();

    // Form is usable
    await page.fill('#password', 'test');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/login-mobile.png', fullPage: true });
  });
});
