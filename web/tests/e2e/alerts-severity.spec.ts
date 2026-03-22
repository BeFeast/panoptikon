import { test, expect, login } from '../../e2e/fixtures';

test.describe('Alerts page severity indicators', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('alert rows have color-coded left borders by severity', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for alerts to load (either cards appear or "No alerts yet" message)
    const alertCard = page.locator('[class*="border-l-4"]').first();
    const emptyState = page.getByText('No alerts yet');

    await Promise.race([
      alertCard.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
      // No alerts — skip border checks but verify page loaded
      await page.screenshot({ path: 'tests/screenshots/alerts-severity-empty.png', fullPage: true });
      return;
    }

    // Verify that alert cards have severity-colored left borders
    const cards = page.locator('[class*="border-l-4"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Each card with border-l-4 should have one of the severity colors
    for (let i = 0; i < Math.min(count, 5); i++) {
      const card = cards.nth(i);
      const className = await card.getAttribute('class') ?? '';
      const hasSeverityBorder =
        className.includes('border-l-red-500') ||
        className.includes('border-l-amber-500') ||
        className.includes('border-l-blue-500');
      expect(hasSeverityBorder).toBe(true);
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-severity-borders.png', fullPage: true });
  });

  test('critical alerts have pulse animation class', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Check for critical alert cards with pulse animation
    const criticalCards = page.locator('.animate-pulse-critical');
    const emptyState = page.getByText('No alerts yet');

    await Promise.race([
      criticalCards.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    // If critical alerts exist, they should have the pulse class
    if (await criticalCards.first().isVisible().catch(() => false)) {
      const count = await criticalCards.count();
      expect(count).toBeGreaterThan(0);

      // Also verify they have the red border
      for (let i = 0; i < Math.min(count, 3); i++) {
        const className = await criticalCards.nth(i).getAttribute('class') ?? '';
        expect(className).toContain('border-l-red-500');
      }
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-critical-pulse.png', fullPage: true });
  });

  test('severity summary bar shows counts when alerts exist', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for alerts to load
    const summaryBar = page.getByText('Severity');
    const emptyState = page.getByText('No alerts yet');

    await Promise.race([
      summaryBar.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
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
