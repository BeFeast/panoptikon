import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar UX — collapse button in header + logo link', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('collapse button is in the sidebar header', async ({ page }) => {
    // The collapse button should be in the header with aria-label
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await expect(collapseBtn).toBeVisible({ timeout: 15000 });

    // The old bottom "Collapse" text button should NOT exist
    const oldCollapseText = page.locator('button', { hasText: /^Collapse$/ });
    await expect(oldCollapseText).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-collapse-in-header.png', fullPage: true });
  });

  test('collapse and expand sidebar via header button', async ({ page }) => {
    // Start expanded — "Panoptikon" text should be visible
    await expect(page.locator('text=Panoptikon').first()).toBeVisible({ timeout: 15000 });

    // Click collapse
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await collapseBtn.click();

    // After collapse, the "Panoptikon" text should be hidden
    await expect(page.locator('aside span:has-text("Panoptikon")')).not.toBeVisible();

    // Expand button should appear
    const expandBtn = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(expandBtn).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-collapsed.png', fullPage: true });

    // Click expand
    await expandBtn.click();

    // "Panoptikon" text should be visible again
    await expect(page.locator('aside span:has-text("Panoptikon")')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-expanded.png', fullPage: true });
  });

  test('logo navigates to dashboard', async ({ page }) => {
    // Navigate away from dashboard first
    await page.getByRole('link', { name: 'Devices' }).first().click();
    await page.waitForURL('**/devices**', { timeout: 10000 });

    // Click the Panoptikon logo link in the sidebar header
    const logoLink = page.locator('aside a[href="/dashboard/"]');
    await expect(logoLink).toBeVisible();
    await logoLink.click();

    // Should navigate to dashboard
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-logo-dashboard-link.png', fullPage: true });
  });
});
