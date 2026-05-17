import { test, expect, login } from '../../e2e/fixtures';

test.describe.skip('TopBar polish (#602)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('search input has cyan glow on focus', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search devices, IPs, MACs');
    await expect(searchInput).toBeVisible();

    // Focus the search input
    await searchInput.click();

    // Verify the focused input has the cyan ring/glow classes applied
    // Playwright evaluates computed styles, so we check the box-shadow
    const boxShadow = await searchInput.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });

    // The glow effect should produce a non-"none" box-shadow when focused
    expect(boxShadow).not.toBe('none');

    await page.screenshot({ path: 'tests/screenshots/topbar-search-glow.png' });
  });

  test('breadcrumbs show for deep navigation paths', async ({ page }) => {
    // Navigate to a settings subpage (depth > 1)
    await page.goto('/settings/scanner');

    // Breadcrumb nav should be visible
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumb).toBeVisible({ timeout: 10000 });

    // Should show "Settings" and "Scanner" segments
    await expect(breadcrumb.getByText('Settings')).toBeVisible();
    await expect(breadcrumb.getByText('Scanner')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/topbar-breadcrumbs.png' });
  });

  test('breadcrumbs hidden on top-level pages', async ({ page }) => {
    // Dashboard is a top-level page (depth = 1)
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 10000 });

    // Breadcrumb nav should NOT be visible
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumb).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/topbar-no-breadcrumbs.png' });
  });

  test('notification bell is visible and functional', async ({ page }) => {
    // Check the notification bell area
    const bellButton = page.locator('button[aria-label="Notifications"]');
    await expect(bellButton).toBeVisible();

    // Click the bell to open dropdown
    await bellButton.click();

    // Dropdown should show "Notifications" header
    await expect(page.getByText('Notifications')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/topbar-notification-bell.png' });
  });
});
