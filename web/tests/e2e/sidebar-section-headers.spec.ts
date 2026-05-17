import { test, expect, login } from '../../e2e/fixtures';

test.describe('Sidebar section headers — toggle only via chevron', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('section header label text does not toggle collapse', async ({ page }) => {
    // Wait for sidebar to be visible with section labels
    const networkLabel = page.locator('aside span', { hasText: 'Network' }).first();
    await expect(networkLabel).toBeVisible({ timeout: 15000 });

    // Verify a nav item in the Network section is visible (section is expanded)
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
    await expect(dashboardLink).toBeVisible();

    // Click the label text — should NOT collapse the section
    await networkLabel.click();

    // Dashboard link should still be visible (section not collapsed)
    await expect(dashboardLink).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-label-no-collapse.png', fullPage: true });
  });

  test('chevron button toggles section collapse', async ({ page }) => {
    // Wait for sidebar
    const collapseBtn = page.locator('aside').getByRole('button', { name: /Collapse Overview/i });
    await expect(collapseBtn).toBeVisible({ timeout: 15000 });

    // Verify section is expanded — Dashboard link visible
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
    await expect(dashboardLink).toBeVisible();

    // Click the chevron button to collapse
    await collapseBtn.click();

    // Dashboard link should be hidden (section collapsed)
    await expect(dashboardLink).not.toBeVisible();

    // The button should now say "Expand"
    const expandBtn = page.locator('aside').getByRole('button', { name: /Expand Overview/i });
    await expect(expandBtn).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-section-collapsed-via-chevron.png', fullPage: true });

    // Click again to expand
    await expandBtn.click();
    await expect(dashboardLink).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/sidebar-section-expanded-via-chevron.png', fullPage: true });
  });

  test('section headers are visually distinct from nav items', async ({ page }) => {
    // Wait for sidebar to load
    const networkLabel = page.locator('aside span', { hasText: 'Network' }).first();
    await expect(networkLabel).toBeVisible({ timeout: 15000 });

    // Section header label should have cursor-default (not pointer)
    const cursor = await networkLabel.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('default');

    // Section header label should have user-select: none
    const userSelect = await networkLabel.evaluate((el) => getComputedStyle(el).userSelect);
    expect(userSelect).toBe('none');

    await page.screenshot({ path: 'tests/screenshots/sidebar-section-headers-distinct.png', fullPage: true });
  });

  test('chevron toggle is keyboard accessible', async ({ page }) => {
    // Wait for sidebar
    const collapseBtn = page.locator('aside').getByRole('button', { name: /Collapse Overview/i });
    await expect(collapseBtn).toBeVisible({ timeout: 15000 });

    // Verify aria-expanded attribute
    await expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');

    // Verify Dashboard link is visible
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' }).first();
    await expect(dashboardLink).toBeVisible();

    // Focus the button and press Enter to toggle
    await collapseBtn.focus();
    await page.keyboard.press('Enter');

    // Section should be collapsed
    await expect(dashboardLink).not.toBeVisible();

    // aria-expanded should now be false
    const expandBtn = page.locator('aside').getByRole('button', { name: /Expand Overview/i });
    await expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

    await page.screenshot({ path: 'tests/screenshots/sidebar-section-keyboard-toggle.png', fullPage: true });
  });
});
