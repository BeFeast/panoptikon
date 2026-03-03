import { test, expect, login } from '../../e2e/fixtures';

test.describe('DNS Query Log page — no 500 errors', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('GET /api/v1/dns-logs returns 200 (not 500)', async ({ page }) => {
    // Collect dns-logs API responses
    const dnsResponses: { url: string; status: number }[] = [];
    page.on('response', (resp) => {
      if (resp.url().includes('/api/v1/dns-logs')) {
        dnsResponses.push({ url: resp.url(), status: resp.status() });
      }
    });

    await page.goto('/dns-logs');

    // Page heading should be visible
    await expect(
      page.getByRole('heading', { name: 'DNS Query Log', level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // Wait for API requests to complete
    await page.waitForTimeout(3000);

    // All dns-logs API calls should return 200, never 500
    expect(dnsResponses.length, 'Expected at least one dns-logs API call').toBeGreaterThan(0);
    for (const resp of dnsResponses) {
      expect(resp.status, `${resp.url} should not return 500`).not.toBe(500);
      expect(resp.status, `${resp.url} should return 200`).toBe(200);
    }

    await page.screenshot({ path: 'tests/screenshots/dns-logs-no-500.png' });
  });

  test('DNS logs page shows table or empty state (not error)', async ({ page }) => {
    await page.goto('/dns-logs');

    // Page heading should be visible
    await expect(
      page.getByRole('heading', { name: 'DNS Query Log', level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(3000);

    // The Query Log tab should be active by default and show either:
    // - A table with data rows
    // - An empty state message about configuring Unbound
    const pageText = await page.textContent('body') ?? '';
    const hasTable = pageText.includes('Domain') && pageText.includes('Client');
    const hasEmptyState = pageText.includes('No DNS queries recorded yet');
    expect(
      hasTable || hasEmptyState,
      'DNS logs page should show a table or empty state, not an error'
    ).toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/dns-logs-page-state.png' });
  });

  test('DNS stats endpoint returns 200', async ({ page }) => {
    // Specifically track stats endpoint
    const statsResponses: { url: string; status: number }[] = [];
    page.on('response', (resp) => {
      if (resp.url().includes('/api/v1/dns-logs/stats')) {
        statsResponses.push({ url: resp.url(), status: resp.status() });
      }
    });

    await page.goto('/dns-logs');
    await expect(
      page.getByRole('heading', { name: 'DNS Query Log', level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // Wait for stats to load
    await page.waitForTimeout(3000);

    // Stats endpoint should return 200
    expect(statsResponses.length, 'Expected at least one dns-logs/stats API call').toBeGreaterThan(0);
    for (const resp of statsResponses) {
      expect(resp.status, `${resp.url} should return 200`).toBe(200);
    }

    // Stats cards should be visible (Total Queries, Blocked, etc.)
    await expect(page.getByText('Total Queries')).toBeVisible();
    await expect(page.getByText('Blocked')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/dns-logs-stats.png' });
  });
});
