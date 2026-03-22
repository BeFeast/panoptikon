import { test, expect, login } from '../../e2e/fixtures';

test.describe('Alert card left border accent', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('alert cards have flat left edge for clean border accent', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for alerts API to finish loading
    await page.waitForLoadState('networkidle');

    const emptyState = page.getByText('All clear!');
    if (await emptyState.isVisible().catch(() => false)) {
      // No alerts — nothing to check, just verify page loaded
      await page.screenshot({ path: 'tests/screenshots/alert-border-empty.png', fullPage: true });
      return;
    }

    // All alert cards should have rounded-l-none (border-radius 0 on left side)
    // to prevent the curly-brace artifact from rounded-2xl base Card
    const alertCards = page.locator('.rounded-l-none.border-slate-800');
    const count = await alertCards.count();
    expect(count).toBeGreaterThan(0);

    // Verify the first card's computed left border-radius is 0
    const firstCard = alertCards.first();
    const borderRadii = await firstCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        topLeft: style.borderTopLeftRadius,
        bottomLeft: style.borderBottomLeftRadius,
      };
    });

    expect(borderRadii.topLeft).toBe('0px');
    expect(borderRadii.bottomLeft).toBe('0px');

    await page.screenshot({ path: 'tests/screenshots/alert-card-border-fix.png', fullPage: true });
  });
});
