import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar rebrand — cyan accents instead of blue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 30000 });
  });

  test('sidebar is visible with shared brand mark tile', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Logo tile should render the shared thin network glyph.
    const logoTile = sidebar.locator('div[class*="bg-cyan-400"]');
    await expect(logoTile).toBeVisible({ timeout: 10000 });
    await expect(logoTile.getByTestId('brand-mark')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-rebrand-logo.png', fullPage: true });
  });

  test('active nav item uses cyan highlight', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Dashboard link should be active with cyan styling
    const activeLink = page.locator('aside nav a[href^="/dashboard"]');
    await expect(activeLink).toBeVisible({ timeout: 15000 });
    await expect(activeLink).toHaveClass(/text-cyan-500/, { timeout: 10000 });
    await expect(activeLink).toHaveClass(/bg-cyan-500\/10/, { timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-rebrand-active-nav.png', fullPage: true });
  });

  test('active accent bar uses cyan gradient', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const activeLink = page.locator('aside nav a[href^="/dashboard"]');
    await expect(activeLink).toBeVisible({ timeout: 15000 });

    // The accent bar span inside the active link
    const accentBar = activeLink.locator('span.rounded-full');
    await expect(accentBar).toBeVisible({ timeout: 10000 });
    await expect(accentBar).toHaveClass(/from-cyan-400/, { timeout: 10000 });
    await expect(accentBar).toHaveClass(/to-cyan-600/, { timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-rebrand-accent-bar.png', fullPage: true });
  });

  test('no blue accent classes remain in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Verify no blue accent classes in any sidebar element
    const blueElements = sidebar.locator('.bg-blue-500, .text-blue-500, .text-blue-400, .from-blue-400, .to-blue-600');
    await expect(blueElements).toHaveCount(0);

    await page.screenshot({ path: 'tests/screenshots/sidebar-rebrand-no-blue.png', fullPage: true });
  });
});
