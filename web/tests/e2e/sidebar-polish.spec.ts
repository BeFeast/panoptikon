import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar polish — accent bar, hover, separators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('active nav item shows left accent bar', async ({ page }) => {
    // Dashboard should be active after login
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // The active link should contain the accent bar (gradient span)
    const activeLink = sidebar.locator('a.bg-blue-500\\/10').first();
    await expect(activeLink).toBeVisible();

    const accentBar = activeLink.locator('span.bg-gradient-to-b');
    await expect(accentBar).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-active-accent-bar.png' });
  });

  test('group headers have dotted separator lines', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Group separators should use dotted border
    const dottedSeparators = sidebar.locator('span.border-dotted');
    const count = await dottedSeparators.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'tests/screenshots/sidebar-dotted-separators.png' });
  });

  test('icons have hover scale class', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Nav link icons should have the group-hover:scale-105 class
    const iconWithScale = sidebar.locator('svg.group-hover\\:scale-105').first();
    await expect(iconWithScale).toBeVisible();
  });

  test('collapsed sidebar tooltips have slide animation class', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Collapse sidebar
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await collapseBtn.click();

    // Hover over first nav link to trigger tooltip
    const firstNavIcon = sidebar.locator('a').first();
    await firstNavIcon.hover();

    // Tooltip should appear with slide-in animation class
    const tooltip = page.locator('[data-side="right"].slide-in-from-left-1');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/sidebar-collapsed-tooltip.png' });
  });

  test('footer has reduced visual weight', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    // Footer border should use the subtle divider (border-slate-800/50)
    const footer = sidebar.locator('.border-slate-800\\/50').last();
    await expect(footer).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-footer.png' });
  });
});
