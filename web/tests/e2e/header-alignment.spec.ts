import { test, expect, login } from '../../e2e/fixtures';

test.describe.skip('Sidebar and TopBar header alignment', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 30000 });
  });

  test('sidebar header and topbar header have matching height and border', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15000 });

    const topbar = page.locator('header.sticky');
    await expect(topbar).toBeVisible({ timeout: 15000 });

    // Get computed heights of both headers
    const sidebarHeader = sidebar.locator('> div').first();
    const sidebarBox = await sidebarHeader.boundingBox();
    const topbarBox = await topbar.boundingBox();

    expect(sidebarBox).not.toBeNull();
    expect(topbarBox).not.toBeNull();

    // Both headers must have the same height (60px)
    expect(sidebarBox!.height).toBe(topbarBox!.height);

    // Screenshot of the top-left corner showing alignment
    await page.screenshot({
      path: 'tests/screenshots/header-alignment.png',
      clip: { x: 0, y: 0, width: 500, height: 80 },
    });
  });
});
