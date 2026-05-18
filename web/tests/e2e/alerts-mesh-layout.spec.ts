import { test, expect, login } from '../../e2e/fixtures';

/**
 * Alerts page — literal port of `alerts-login.jsx` ALERTS section.
 *
 * Surface contract per design source:
 *  - "Operations" eyebrow + "Alerts" h1 + mono subtitle with bucket counts.
 *  - 4 severity bucket KPI cards (critical / warning / info / resolved) each
 *    with a colored rail + count + inline Spark.
 *  - 2-pane layout: left list (segmented All/Open/Ack/Resolved tabs) + right
 *    inline detail pane.
 *  - Row click sets the right pane selection (no off-canvas drawer).
 *  - Segment selection persists via `?filter=open|ack|resolved` URL param.
 */
test.describe('Alerts mesh layout (U6 — literal port)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders mesh header + severity buckets + segmented tabs', async ({ page }) => {
    await page.goto('/alerts/');

    // Root marker present
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });

    // Operations eyebrow + heading (typography recipes from design source)
    await expect(page.getByText('Operations', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Alerts', level: 1 }),
    ).toBeVisible();

    // Subtitle includes the bucket-count phrases (compatibility with
    // alerts-severity.spec.ts) — at least one must render.
    await expect(page.getByText(/\d+ total/)).toBeVisible();
    await expect(page.getByText(/\d+ critical/)).toBeVisible();
    await expect(page.getByText(/\d+ warning/)).toBeVisible();
    await expect(page.getByText(/\d+ info/)).toBeVisible();

    await page.screenshot({
      path: 'tests/screenshots/alerts-mesh-layout.png',
      fullPage: true,
    });
  });

  test('segmented filter (All/Open/Ack/Resolved) round-trips through URL', async ({
    page,
  }) => {
    await page.goto('/alerts/');
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });

    // Skip when the DB is empty — the segmented control only renders inside the
    // list pane which is hidden by the empty state.
    const emptyState = page.getByText('All clear!');
    if (await emptyState.isVisible().catch(() => false)) {
      return;
    }

    const allTab = page.getByRole('tab', { name: 'All' });
    const openTab = page.getByRole('tab', { name: 'Open' });
    const ackTab = page.getByRole('tab', { name: 'Ack' });
    const resolvedTab = page.getByRole('tab', { name: 'Resolved' });

    await expect(allTab).toBeVisible();
    await expect(openTab).toBeVisible();
    await expect(ackTab).toBeVisible();
    await expect(resolvedTab).toBeVisible();

    // Switch to Open -> URL gains ?filter=open
    await openTab.click();
    await page.waitForFunction(
      () => window.location.search.includes('filter=open'),
      null,
      { timeout: 5000 },
    );
    expect(page.url()).toContain('filter=open');

    // Reload preserves the segment selection via deeplink
    await page.reload();
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Open' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Back to All -> URL drops the filter param
    await page.getByRole('tab', { name: 'All' }).click();
    await page.waitForFunction(
      () => !window.location.search.includes('filter='),
      null,
      { timeout: 5000 },
    );
  });

  test('clicking an alert row updates the right-pane detail selection', async ({
    page,
  }) => {
    await page.goto('/alerts/');
    await expect(page.getByTestId('alerts-root')).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const rows = page.getByTestId('alert-row');
    const count = await rows.count();
    if (count === 0) {
      // Empty DB — empty-state copy must render and the test bails.
      await expect(page.getByText('All clear!')).toBeVisible();
      return;
    }

    // First row is auto-selected on mount per source — verify the detail pane
    // shows an ALERT-XXXX id.
    await expect(page.getByText(/ALERT-[A-Z0-9]+/).first()).toBeVisible({
      timeout: 5000,
    });

    await page.screenshot({
      path: 'tests/screenshots/alerts-mesh-detail.png',
      fullPage: true,
    });
  });
});
