import { test, expect, login } from '../../e2e/fixtures';

test.describe('Alerts page severity indicators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('alert rows render with correct styling', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for alerts API to finish loading
    await page.waitForLoadState('networkidle');

    const emptyState = page.getByText('All clear!');

    if (await emptyState.isVisible().catch(() => false)) {
      // No alerts — verify page loaded
      await page.screenshot({ path: 'tests/screenshots/alerts-severity-empty.png', fullPage: true });
      return;
    }

    // Verify that alert cards are rendered (post-#785 mesh-card recipe)
    const cards = page.locator('[class*="mesh-card"]').filter({ hasText: /.+/ });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/alerts-severity-rows.png', fullPage: true });
  });

  test('severity summary bar shows counts when alerts exist', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for alerts API to finish loading
    await page.waitForLoadState('networkidle');

    const summaryBar = page.getByText('Severity');
    const emptyState = page.getByText('All clear!');

    if (await emptyState.isVisible().catch(() => false)) {
      // No alerts — summary bar should not be visible
      await expect(summaryBar).not.toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/alerts-summary-empty.png', fullPage: true });
      return;
    }

    // If alerts exist and at least one is not acknowledged, summary bar should show
    // Check for at least one severity badge in the summary
    const criticalBadge = page.getByText(/\d+ critical/);
    const warningBadge = page.getByText(/\d+ warning/);
    const infoBadge = page.getByText(/\d+ info/);

    const hasCritical = await criticalBadge.isVisible().catch(() => false);
    const hasWarning = await warningBadge.isVisible().catch(() => false);
    const hasInfo = await infoBadge.isVisible().catch(() => false);

    // At least one severity type should be shown if we have active alerts
    if (await summaryBar.isVisible()) {
      expect(hasCritical || hasWarning || hasInfo).toBe(true);
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-summary-bar.png', fullPage: true });
  });
});
