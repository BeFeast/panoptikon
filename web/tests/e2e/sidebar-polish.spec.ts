import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar polish — accent bar, hover, separators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('active nav item shows left accent bar', async ({ page }) => {
    // Dashboard should be active after login
    const activeLink = page.locator('aside a[href="/dashboard"]');
    await expect(activeLink).toBeVisible({ timeout: 15000 });

    // The accent bar is a span inside the active link
    const accentBar = activeLink.locator('span.rounded-full');
    await expect(accentBar).toBeVisible();

    // Verify it has the gradient background classes
    await expect(accentBar).toHaveClass(/bg-gradient-to-b/);
    await expect(accentBar).toHaveClass(/from-blue-400/);

    await page.screenshot({ path: 'tests/screenshots/sidebar-accent-bar.png', fullPage: true });
  });

  test('icons have hover scale transition class', async ({ page }) => {
    // Check that nav link icons have the hover scale class
    const navIcon = page.locator('aside a[href="/devices"] svg');
    await expect(navIcon).toBeVisible({ timeout: 15000 });
    await expect(navIcon).toHaveClass(/group-hover\/nav:scale-105/);

    await page.screenshot({ path: 'tests/screenshots/sidebar-hover-icon.png', fullPage: true });
  });

  test('group separators use dotted border', async ({ page }) => {
    // The second group (Routing & Proxy) should have a dotted top border
    // First group (Network) should NOT have a dotted border
    const sidebar = page.locator('aside nav');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Find group header containers with dotted border
    const dottedSeparators = sidebar.locator('.border-dotted');
    const count = await dottedSeparators.count();
    // Should have separators on all groups except the first one
    expect(count).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: 'tests/screenshots/sidebar-group-separators.png', fullPage: true });
  });

  test('collapsed tooltips have slide-in animation class', async ({ page }) => {
    // Collapse the sidebar
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseBtn).toBeVisible({ timeout: 15000 });
    await collapseBtn.click();

    // Hover over a nav icon to trigger tooltip
    const devicesLink = page.locator('aside a[href="/devices"]');
    await expect(devicesLink).toBeVisible();
    await devicesLink.hover();

    // Wait for tooltip to appear
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Verify tooltip has the slide-in animation class
    await expect(tooltip).toHaveClass(/slide-in-from-left/);

    await page.screenshot({ path: 'tests/screenshots/sidebar-tooltip-slide.png', fullPage: true });
  });

  test('footer has reduced visual weight', async ({ page }) => {
    // Footer border should use the lighter border-slate-800/50
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Version text should be visible but with reduced opacity
    const versionText = sidebar.locator('p.text-slate-700\\/60');
    await expect(versionText).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-footer.png', fullPage: true });
  });
});
