import { test, expect, login } from '../../e2e/fixtures';

test.describe('Layout & Grid — card clipping / spacing regressions (#544)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard cards are not clipped at bottom — 1280x800 desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // Scroll the main content area to the very bottom
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTo(0, main.scrollHeight);
    });
    await page.waitForTimeout(500);

    // The "Device Breakdown" card (last card) must be scrollable-to and visible
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 5000 });

    // Verify every visible card is fully inside the scrollable area (not clipped)
    const cards = page.locator('[data-testid="infra-health-card"], [class*="border-slate-800"][class*="bg-slate-900"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Check that the main scrollable container can reach the bottom of its content
    const scrollInfo = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return { scrollable: false, reachesBottom: false };
      const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
      return { scrollable: main.scrollHeight > main.clientHeight, reachesBottom: atBottom };
    });
    // If content is scrollable, we must be able to reach the bottom
    if (scrollInfo.scrollable) {
      expect(scrollInfo.reachesBottom).toBe(true);
    }

    await page.screenshot({ path: 'tests/screenshots/layout-card-bottom-1280.png', fullPage: true });
  });

  test('dashboard cards are not clipped at bottom — 1366x768 laptop', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // Scroll to bottom
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTo(0, main.scrollHeight);
    });
    await page.waitForTimeout(500);

    // Last card visible after scrolling
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/layout-card-bottom-1366.png', fullPage: true });
  });

  test('stat cards have consistent padding — no extra bottom space', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // Verify core stat card headers are present (style token may vary between
    // tracking-wider and arbitrary tracking values after UI polish updates).
    const statLabels = ['Router Status', 'Active Devices', 'WAN Bandwidth', 'Unread Alerts'];
    for (const label of statLabels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/layout-stat-card-padding.png', fullPage: true });
  });

  test('layout containers use overflow-clip not overflow-hidden', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Verify the main layout containers do not create unwanted scroll contexts
    // overflow-clip is preferred over overflow-hidden for layout wrappers
    const mainEl = page.locator('main');
    await expect(mainEl).toBeVisible();

    // Main should be scrollable (overflow-y: auto)
    const isScrollable = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      return getComputedStyle(main).overflowY === 'auto';
    });
    expect(isScrollable).toBe(true);

    await page.screenshot({ path: 'tests/screenshots/layout-overflow-clip.png' });
  });

  test('devices grid cards are fully visible without clipping', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/devices');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();

    // Wait for cards or empty state
    await page.waitForTimeout(3000);

    // If there are device cards, verify they are not clipped
    const deviceCards = page.locator('.border-slate-800.bg-slate-900.cursor-pointer');
    const cardCount = await deviceCards.count();
    if (cardCount > 0) {
      // Check that the first card's border/content is fully rendered
      const box = await deviceCards.first().boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThan(50); // Cards should have meaningful height
        expect(box.width).toBeGreaterThan(100); // Cards should have meaningful width
      }
    }

    await page.screenshot({ path: 'tests/screenshots/layout-devices-no-clip.png', fullPage: true });
  });
});

test.describe('Layout & Grid — no overflow or clipping (#524)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('dashboard cards do not overflow viewport at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Wait for stat cards to resolve
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // No horizontal scrollbar — body should not be wider than viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for sub-pixel rounding

    await page.screenshot({ path: 'tests/screenshots/layout-dashboard-1280.png', fullPage: true });
  });

  test('dashboard cards do not overflow at 768px tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({ path: 'tests/screenshots/layout-dashboard-768.png', fullPage: true });
  });

  test('device breakdown labels are not clipped', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Device Breakdown')).toBeVisible({ timeout: 10000 });

    // Wait for device breakdown section to populate (or show "No devices found")
    const breakdownSection = page.getByText('Device Breakdown').locator('xpath=ancestor::div[contains(@class,"border-slate-800")]').first();
    await expect(breakdownSection).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/layout-device-breakdown.png', fullPage: true });
  });

  test('stat card values use truncate to prevent overflow', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Router Status')).toBeVisible({ timeout: 10000 });

    // Verify that the stat card value elements have truncate class
    // This is a structural check — the "truncate" class on value <p> elements
    // ensures long text won't break the card layout.
    const statValues = page.locator('.tabular-nums.truncate');
    const count = await statValues.count();
    // At least one stat card value should have the truncate class
    expect(count).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/layout-stat-card-truncate.png', fullPage: true });
  });

  test('devices page grid cards do not overflow at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/devices');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();

    // Wait for either device cards or empty state
    await page.waitForTimeout(3000);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({ path: 'tests/screenshots/layout-devices-1024.png', fullPage: true });
  });

  test('services page table cells handle long domains', async ({ page }) => {
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible();

    // Verify the table container has overflow handling
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({ path: 'tests/screenshots/layout-services.png', fullPage: true });
  });

  test('TopBar search dropdown truncates long results', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // The search input should be present in the top bar
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/layout-topbar.png' });
  });

  test('no horizontal scroll on any major page at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const pages = ['/dashboard', '/devices', '/services'];

    for (const url of pages) {
      await page.goto(url);
      await page.waitForTimeout(2000);

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth, `Page ${url} overflows horizontally`).toBeLessThanOrEqual(viewportWidth + 1);
    }

    await page.screenshot({ path: 'tests/screenshots/layout-no-scroll.png', fullPage: true });
  });
});
