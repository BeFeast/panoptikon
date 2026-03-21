import { test, expect, login } from '../../e2e/fixtures';

test.describe('Design System Overhaul', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('page headings use display font and updated typography', async ({ page }) => {
    await page.goto('/dashboard');
    // Dashboard heading should be visible with updated styling
    const heading = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    await expect(heading).toBeVisible();

    // Verify the heading has the new typography classes
    await expect(heading).toHaveClass(/text-3xl/);
    await expect(heading).toHaveClass(/font-bold/);
    await expect(heading).toHaveClass(/tracking-tight/);
    await expect(heading).toHaveClass(/font-display/);

    await page.screenshot({ path: 'tests/screenshots/design-system-heading.png' });
  });

  test('gradient CSS variables are defined', async ({ page }) => {
    // Check that gradient CSS variables are available on :root
    const gradientPrimary = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--gradient-primary');
    });
    expect(gradientPrimary).toContain('linear-gradient');

    const gradientWarm = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--gradient-warm');
    });
    expect(gradientWarm).toContain('linear-gradient');

    const gradientText = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--gradient-text');
    });
    expect(gradientText).toContain('linear-gradient');
  });

  test('body has colored radial gradients for depth', async ({ page }) => {
    const bodyBg = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundImage;
    });

    // Should contain multiple radial gradients (indigo top-left, emerald bottom-right)
    expect(bodyBg).toContain('radial-gradient');

    // Should have at least 4 gradient layers (2 new colored radials + 2 existing + linear)
    const gradientCount = (bodyBg.match(/radial-gradient/g) || []).length;
    expect(gradientCount).toBeGreaterThanOrEqual(4);

    await page.screenshot({ path: 'tests/screenshots/design-system-body-gradient.png', fullPage: true });
  });

  test('gradient-text utility class works', async ({ page }) => {
    // Inject a test element with the gradient-text class
    await page.evaluate(() => {
      const el = document.createElement('span');
      el.className = 'gradient-text';
      el.id = 'gradient-text-test';
      el.textContent = 'Test Gradient';
      document.body.appendChild(el);
    });

    const el = page.locator('#gradient-text-test');
    await expect(el).toBeVisible();

    const styles = await el.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        backgroundClip: computed.backgroundClip || computed.webkitBackgroundClip,
        backgroundImage: computed.backgroundImage,
      };
    });

    expect(styles.backgroundImage).toContain('linear-gradient');
    expect(styles.backgroundClip).toContain('text');
  });

  test('display font is loaded via CSS variable', async ({ page }) => {
    // The --font-display CSS variable should be resolvable on the body
    const hasDisplayFont = await page.evaluate(() => {
      return getComputedStyle(document.body).getPropertyValue('--font-display');
    });

    // The Plus Jakarta Sans font variable should be applied to the body
    expect(hasDisplayFont.trim()).not.toBe('');

    await page.screenshot({ path: 'tests/screenshots/design-system-fonts.png' });
  });

  test('settings page heading also uses updated typography', async ({ page }) => {
    await page.goto('/settings');
    const heading = page.getByRole('heading', { name: 'Settings', level: 1 });
    await expect(heading).toBeVisible();

    await expect(heading).toHaveClass(/text-3xl/);
    await expect(heading).toHaveClass(/font-bold/);
    await expect(heading).toHaveClass(/font-display/);

    await page.screenshot({ path: 'tests/screenshots/design-system-settings-heading.png' });
  });
});
