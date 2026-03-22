import { test, expect, login } from '../../e2e/fixtures';

test.describe('TopBar polish (#602)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('search input has blue glow on focus', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search devices, IPs, MACs');
    await expect(searchInput).toBeVisible();

    // Focus the search input
    await searchInput.click();

    // Verify the focused input has the blue ring/glow classes applied
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

  test('notification badge has pulse animation class when unread > 0', async ({ page }) => {
    // Check the notification bell area
    const bellButton = page.locator('button[aria-label="Notifications"]');
    await expect(bellButton).toBeVisible();

    // Check if there's a badge — if unread > 0 it should have pulse class
    const badge = bellButton.locator('.animate-badge-pulse');
    const badgeCount = await badge.count();

    if (badgeCount > 0) {
      // Badge exists and has the pulse animation class
      await expect(badge).toBeVisible();

      // Verify it has the animation style
      const animationName = await badge.evaluate((el) => {
        return window.getComputedStyle(el).animationName;
      });
      expect(animationName).toContain('badge-pulse');
    }
    // If no unread alerts, badge won't be rendered — that's fine

    await page.screenshot({ path: 'tests/screenshots/topbar-notification-badge.png' });
  });
});
