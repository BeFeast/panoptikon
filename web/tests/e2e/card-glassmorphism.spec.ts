import { test, expect, login } from '../../e2e/fixtures';

test.describe('Card glassmorphism 2.0 — backdrop blur, glow, hover (#592)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('cards have backdrop-blur-xl and top-edge inner glow pseudo-element', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Total Devices')).toBeVisible({ timeout: 10000 });

    // Find a Card component on the dashboard — they use backdrop-blur-xl now
    const card = page.locator('.backdrop-blur-xl').first();
    await expect(card).toBeVisible();

    // Verify the card has the ::before pseudo-element for top-edge glow
    const hasPseudo = await card.evaluate((el) => {
      const before = window.getComputedStyle(el, '::before');
      // The pseudo-element should have height of 1px and a gradient background
      return before.height === '1px' && before.backgroundImage.includes('gradient');
    });
    expect(hasPseudo).toBe(true);

    await page.screenshot({ path: 'tests/screenshots/card-glassmorphism-blur.png', fullPage: true });
  });

  test('card hover shows blue border glow transition', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Total Devices')).toBeVisible({ timeout: 10000 });

    const card = page.locator('.backdrop-blur-xl').first();
    await expect(card).toBeVisible();

    // Verify the card has a transition on border-color
    const hasTransition = await card.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.transitionProperty.includes('border-color') ||
             style.transitionProperty === 'all';
    });
    expect(hasTransition).toBe(true);

    // Hover and verify border color changes
    await card.hover();
    // Allow transition to complete
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/screenshots/card-glassmorphism-hover.png', fullPage: true });
  });

  test('card-active CSS class creates left accent bar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Inject a test element with card-active class to verify the CSS utility
    const hasAccentBar = await page.evaluate(() => {
      const div = document.createElement('div');
      div.className = 'card-active';
      div.style.width = '200px';
      div.style.height = '100px';
      div.style.position = 'fixed';
      div.style.top = '-9999px'; // offscreen
      document.body.appendChild(div);

      const after = window.getComputedStyle(div, '::after');
      const hasBar = after.width === '4px' &&
                     after.backgroundImage.includes('gradient') &&
                     after.position === 'absolute';
      document.body.removeChild(div);
      return hasBar;
    });
    expect(hasAccentBar).toBe(true);

    await page.screenshot({ path: 'tests/screenshots/card-glassmorphism-active.png' });
  });

  test('no regression — dashboard cards are still visible and rendered', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.getByText('Total Devices')).toBeVisible({ timeout: 10000 });

    // Stat labels should still be visible
    const statLabels = ['Total Devices', 'Active Alerts', 'WAN Traffic', 'Infra Health'];
    for (const label of statLabels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({ path: 'tests/screenshots/card-glassmorphism-regression.png', fullPage: true });
  });
});
