import { test, expect, login, setupIfNeeded } from '../../e2e/fixtures';

const MARK = /\/brand\/panoptikon-mark\.svg$/;

test.describe('Brand mark — static SVG asset everywhere', () => {
  test('setup and login pages render the mark from the static asset', async ({ page }) => {
    // Fresh DB lands on /setup, a configured one on /login — both carry the mark.
    await page.goto('/login');
    const mark = page.locator('img[data-brand-mark="panoptikon"]');
    await expect(mark).toBeVisible({ timeout: 15000 });
    await expect(mark).toHaveAttribute('src', MARK);
    await expect
      .poll(() => mark.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'tests/screenshots/brand-mark-login.png' });

    // Complete first-run setup (no-op when already configured), then check /login itself.
    await setupIfNeeded(page);
    await page.context().clearCookies(); // drop the session setup may have created
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 20000 });
    const loginMark = page.locator('img[data-brand-mark="panoptikon"]');
    await expect(loginMark).toBeVisible({ timeout: 15000 });
    await expect(loginMark).toHaveAttribute('src', MARK);
  });

  test('sidebar, topbar and favicon all use the same asset', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    const sidebarMark = page.locator('aside img[data-brand-mark="panoptikon"]');
    await expect(sidebarMark).toBeVisible({ timeout: 15000 });
    await expect(sidebarMark).toHaveAttribute('src', MARK);
    await expect
      .poll(() => sidebarMark.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    const topbarMark = page.locator('header img[data-brand-mark="panoptikon"]');
    await expect(topbarMark).toBeVisible({ timeout: 15000 });
    await expect(topbarMark).toHaveAttribute('src', MARK);

    const favicon = page.locator('link[rel="icon"]').first();
    await expect(favicon).toHaveAttribute('href', /favicon\.svg/);
    const res = await page.request.get('/brand/panoptikon-mark.svg');
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain('aria-label="Panoptikon"');

    await page.screenshot({ path: 'tests/screenshots/brand-mark-dashboard.png', fullPage: true });
  });
});
