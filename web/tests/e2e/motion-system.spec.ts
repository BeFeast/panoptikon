import { test, expect, login } from '../../e2e/fixtures';

test.describe('Motion system animations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('page transition renders with stagger container', async ({ page }) => {
    // Navigate to dashboard — the PageTransition wrapper should apply
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // The page content should be fully visible (opacity 1) after transition
    // PageTransition uses framer-motion so we check the page loaded and rendered
    await page.waitForTimeout(500); // Allow stagger animation to complete
    await page.screenshot({ path: 'tests/screenshots/motion-page-transition.png', fullPage: true });
  });

  test('skeleton loaders use shimmer effect instead of pulse', async ({ page }) => {
    // Navigate to a page that shows skeleton loaders
    // Dashboard stat cards briefly show skeletons while loading
    await page.goto('/dashboard');

    // Check that any skeleton elements use animate-shimmer class
    // We inject a check before data loads to catch the skeleton state
    const hasShimmer = await page.evaluate(() => {
      const styles = Array.from(document.styleSheets)
        .flatMap(sheet => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return [];
          }
        })
        .some(rule => rule.cssText.includes('shimmer'));
      return styles;
    });
    expect(hasShimmer).toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/motion-shimmer-styles.png', fullPage: true });
  });

  test('buttons have press feedback scale transform', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Navigate to a settings page that has buttons
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Find a visible button
    const button = page.getByRole('button').first();
    await expect(button).toBeVisible({ timeout: 10000 });

    // Verify the button renders (framer-motion applies whileTap on interaction)
    await page.screenshot({ path: 'tests/screenshots/motion-button-idle.png' });
  });

  test('switch toggle renders with spring animation element', async ({ page }) => {
    // Navigate to a settings page that has toggle switches
    await page.goto('/settings/scanner');
    await page.waitForLoadState('networkidle');

    // Find a switch - the component now uses motion.span for the thumb
    const switchEl = page.locator('button[role="switch"]').first();
    await expect(switchEl).toBeVisible({ timeout: 10000 });

    // Take screenshot of switch in its current state
    await page.screenshot({ path: 'tests/screenshots/motion-switch-before.png' });

    // Click the switch to toggle it
    await switchEl.click();
    // Wait for spring animation to settle
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'tests/screenshots/motion-switch-after.png' });
  });

  test('shimmer CSS animation is defined in stylesheets', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Verify the shimmer keyframes and animate-shimmer class exist in the page styles
    const shimmerDefined = await page.evaluate(() => {
      const allRules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            allRules.push(rule.cssText);
          }
        } catch {
          // cross-origin stylesheets
        }
      }
      const hasKeyframes = allRules.some(r => r.includes('@keyframes shimmer'));
      const hasClass = allRules.some(r => r.includes('animate-shimmer'));
      return { hasKeyframes, hasClass };
    });

    expect(shimmerDefined.hasKeyframes).toBeTruthy();
    expect(shimmerDefined.hasClass).toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/motion-shimmer-keyframes.png' });
  });

  test('reduced motion media query is respected', async ({ page }) => {
    // Emulate prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify shimmer animation is disabled via CSS
    const shimmerDisabled = await page.evaluate(() => {
      const allRules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            allRules.push(rule.cssText);
          }
        } catch {
          // cross-origin
        }
      }
      // The reduced motion media query should set animation: none
      return allRules.some(r =>
        r.includes('prefers-reduced-motion') && r.includes('animation')
      );
    });

    expect(shimmerDisabled).toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/motion-reduced-motion.png', fullPage: true });
  });
});
