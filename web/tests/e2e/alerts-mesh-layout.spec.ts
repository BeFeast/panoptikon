import { test, expect, login } from '../../e2e/fixtures';

test.describe('Alerts mesh layout (U6)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders mesh header + filter chips + persists filter via URL', async ({ page }) => {
    await page.goto('/alerts/');

    // Root marker present
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });

    // Operations eyebrow + heading
    await expect(page.getByText('Operations', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible();

    // All five filter chips render
    for (const id of [
      'filter-chip-all',
      'filter-chip-critical',
      'filter-chip-warning',
      'filter-chip-info',
      'filter-chip-ack',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // Activate Critical chip -> URL gains ?filter=critical
    await page.getByTestId('filter-chip-critical').click();
    await page.waitForFunction(() => window.location.search.includes('filter=critical'), null, {
      timeout: 5000,
    });
    expect(page.url()).toContain('filter=critical');

    // Reload preserves the chip selection via URL deeplink
    await page.reload();
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('filter-chip-critical')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Reset to All -> URL drops the param
    await page.getByTestId('filter-chip-all').click();
    await page.waitForFunction(() => !window.location.search.includes('filter='), null, {
      timeout: 5000,
    });

    await page.screenshot({ path: 'tests/screenshots/alerts-mesh-layout.png', fullPage: true });
  });

  test('clicking an alert row opens the details drawer (when any present)', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const rows = page.getByTestId('alert-row');
    const count = await rows.count();
    if (count === 0) {
      // No alerts in this DB — assert empty state copy and bail.
      await expect(page.getByText(/all clear|no alerts in this filter/i)).toBeVisible();
      return;
    }

    await rows.first().click();
    await expect(page.getByTestId('alert-drawer')).toBeVisible({ timeout: 5000 });
    // Tabs render
    await expect(page.getByTestId('details-tab-overview')).toBeVisible();
    await expect(page.getByTestId('details-tab-activity')).toBeVisible();
    await expect(page.getByTestId('details-tab-source')).toBeVisible();
    // Tab switching works
    await page.getByTestId('details-tab-activity').click();
    await expect(page.getByTestId('details-tab-activity')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.screenshot({ path: 'tests/screenshots/alerts-drawer.png', fullPage: true });
  });
});
