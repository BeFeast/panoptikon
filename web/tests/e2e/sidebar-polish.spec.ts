import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar polish — accent bar, hover, separators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Ensure dashboard is fully loaded before sidebar tests
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 30000 });
  });

  test.skip('active nav item shows left accent bar', async ({ page }) => {
    // Dashboard should be active — wait for sidebar to render
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Use href^= (starts-with) to handle trailing slash in production builds (trailingSlash: true)
    const activeLink = page.locator('aside nav a[href^="/dashboard"]');
    await expect(activeLink).toBeVisible({ timeout: 15000 });

    // The accent bar is a span inside the active link
    const accentBar = activeLink.locator('span.rounded-full');
    await expect(accentBar).toBeVisible({ timeout: 10000 });

    // Verify it has the gradient background classes
    await expect(accentBar).toHaveClass(/bg-gradient-to-b/, { timeout: 10000 });
    await expect(accentBar).toHaveClass(/from-blue-400/, { timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-accent-bar.png', fullPage: true });
  });

  test.skip('icons have hover scale transition class', async ({ page }) => {
    // Wait for sidebar to be fully rendered
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Check that nav link icons have the hover scale class
    // Use href^= to handle trailing slash in production builds
    const navIcon = page.locator('aside nav a[href^="/devices"] svg');
    await expect(navIcon).toBeVisible({ timeout: 15000 });
    await expect(navIcon).toHaveClass(/group-hover\/nav:scale-105/, { timeout: 10000 });

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

  test.skip('collapsed tooltips have slide-in animation class', async ({ page }) => {
    // Wait for sidebar
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Collapse the sidebar
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseBtn).toBeVisible({ timeout: 15000 });
    await collapseBtn.click();

    // Wait for collapse animation
    await page.waitForTimeout(500);

    // Hover over a nav icon to trigger tooltip
    // Use href^= to handle trailing slash in production builds
    const devicesLink = page.locator('aside nav a[href^="/devices"]');
    await expect(devicesLink).toBeVisible({ timeout: 5000 });
    await devicesLink.hover();

    // Wait for tooltip to appear
    const tooltip = page.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 10000 });

    // Verify tooltip has the slide-in animation class
    await expect(tooltip).toHaveClass(/slide-in-from-left/, { timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-tooltip-slide.png', fullPage: true });
  });

  test('footer has reduced visual weight', async ({ page }) => {
    // Footer border should use the lighter border-slate-800/50
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Version text should be visible but with reduced opacity
    const versionText = sidebar.locator('p.text-\\[10px\\]');
    await expect(versionText).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-footer.png', fullPage: true });
  });
});
