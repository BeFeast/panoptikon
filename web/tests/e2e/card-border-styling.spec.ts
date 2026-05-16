import { test, expect, login } from '../../e2e/fixtures';

test.describe('Card border styling — no curly-bracket borders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('cards use compact rounded corners on tunnel overview, QoS, and DNS logs', async ({ page }) => {
    // Check VPN Status / Tunnel Overview page
    await page.goto('/vpn-status/');
    await expect(page.getByRole('heading', { name: 'VPN Status', level: 1 })).toBeVisible({ timeout: 15000 });

    // The page header section should use rounded-xl, not rounded-2xl
    const vpnHeader = page.locator('section.rounded-xl').first();
    await expect(vpnHeader).toBeVisible();

    // Cards on this page should have compact radius (rounded-lg = 0.5rem)
    const vpnCard = page.locator('[class*="rounded-lg"][class*="border"]').first();
    const vpnRadius = await vpnCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.borderTopLeftRadius);
    });
    expect(vpnRadius).toBeLessThanOrEqual(8);
    expect(vpnRadius).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/card-border-vpn-status.png', fullPage: true });

    // Check QoS page
    await page.goto('/qos/');
    await expect(page.getByRole('heading', { name: /QoS/i, level: 1 })).toBeVisible({ timeout: 15000 });

    const qosHeader = page.locator('section.rounded-xl').first();
    await expect(qosHeader).toBeVisible();

    // Verify a Card element on QoS page has compact rounded-lg radius.
    const qosCard = page.locator('.rounded-lg.border').first();
    const qosRadius = await qosCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.borderTopLeftRadius);
    });
    expect(qosRadius).toBeLessThanOrEqual(8);
    expect(qosRadius).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/card-border-qos.png', fullPage: true });

    // Check DNS Query Log page
    await page.goto('/dns-logs/');
    await expect(page.getByRole('heading', { name: /DNS Query Log/i, level: 1 })).toBeVisible({ timeout: 15000 });

    // Stat cards on DNS page should have compact rounded-lg corners.
    const dnsStatCard = page.locator('[data-testid="dns-stats-grid"] .rounded-lg').first();
    await expect(dnsStatCard).toBeVisible();

    const dnsRadius = await dnsStatCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return parseFloat(style.borderTopLeftRadius);
    });
    expect(dnsRadius).toBeLessThanOrEqual(8);
    expect(dnsRadius).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/card-border-dns-logs.png', fullPage: true });
  });

  test('no cards have rounded-2xl class (curly bracket artifact)', async ({ page }) => {
    // Check each affected page for absence of rounded-2xl on Card elements
    const pages = ['/vpn-status/', '/qos/', '/dns-logs/'];

    for (const url of pages) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      // No Card elements (with border class) should have rounded-2xl
      // Card-like containers use .border alongside .rounded-*
      const bracketCards = page.locator('.rounded-2xl.border.bg-slate-900\\/60');
      const count = await bracketCards.count();
      expect(count).toBe(0);
    }

    await page.screenshot({ path: 'tests/screenshots/card-border-no-bracket.png', fullPage: true });
  });
});
