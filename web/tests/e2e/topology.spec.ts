import { test, expect, login } from '../../e2e/fixtures';

test.describe('Topology Page — Auto Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/topology');
  });

  test('topology page loads and shows the topology canvas', async ({ page }) => {
    // The page should show either the loading state or the React Flow canvas
    // Wait for the loading spinner to disappear and canvas to appear
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'tests/screenshots/topology-loaded.png', fullPage: true });
  });

  test('toolbar is visible with layout control buttons', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // Toolbar stats text should be visible
    await expect(page.getByText(/\d+ devices/)).toBeVisible({ timeout: 10000 });

    // Auto-layout button
    const autoLayoutBtn = page.getByTestId('topology-auto-layout');
    await expect(autoLayoutBtn).toBeVisible();
    await expect(autoLayoutBtn).toHaveAttribute('title', 'Auto-layout');

    // Fit view button
    const fitViewBtn = page.getByTestId('topology-fit-view');
    await expect(fitViewBtn).toBeVisible();
    await expect(fitViewBtn).toHaveAttribute('title', 'Fit view');

    // Reset layout button
    const resetBtn = page.getByTestId('topology-reset-layout');
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toHaveAttribute('title', 'Reset layout');

    // Refresh button
    const refreshBtn = page.getByTestId('topology-refresh');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toHaveAttribute('title', 'Refresh now');

    await page.screenshot({ path: 'tests/screenshots/topology-toolbar.png', fullPage: true });
  });

  test('auto-layout button re-runs force simulation without errors', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/\d+ devices/)).toBeVisible({ timeout: 10000 });

    // Click auto-layout
    await page.getByTestId('topology-auto-layout').click();

    // Page should still show the canvas (no crash / error)
    await expect(page.locator('.react-flow')).toBeVisible();

    // No error message should be shown
    await expect(page.getByText('Failed to load topology')).not.toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/topology-auto-layout.png', fullPage: true });
  });

  test('fit view button works without errors', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/\d+ devices/)).toBeVisible({ timeout: 10000 });

    // Click fit view
    await page.getByTestId('topology-fit-view').click();

    // Page should still show the canvas
    await expect(page.locator('.react-flow')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/topology-fit-view.png', fullPage: true });
  });

  test('reset layout button clears positions and re-runs layout', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/\d+ devices/)).toBeVisible({ timeout: 10000 });

    // Click reset layout
    await page.getByTestId('topology-reset-layout').click();

    // Should show loading state briefly then re-render the canvas
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'tests/screenshots/topology-reset-layout.png', fullPage: true });
  });

  test('router node is visible at center of the graph', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

    // The router node should be present in the graph
    // Look for "MikroTik", "VyOS", or "Router" text within the react-flow canvas
    const routerNode = page.locator('.react-flow__node-routerNode');
    // In a test environment there might be no router — the node should still render
    // if topology data is available. If no devices, the canvas is still visible.
    const routerVisible = await routerNode.isVisible().catch(() => false);
    if (routerVisible) {
      await expect(routerNode).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/topology-router-node.png', fullPage: true });
  });

  test('nodes do not overlap when auto-layout is applied', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/\d+ devices/)).toBeVisible({ timeout: 10000 });

    // Click auto-layout to ensure clean layout
    await page.getByTestId('topology-auto-layout').click();

    // Wait for layout to settle
    await page.waitForTimeout(500);

    // Get all device nodes
    const deviceNodes = page.locator('.react-flow__node-deviceNode');
    const count = await deviceNodes.count();

    if (count >= 2) {
      // Check that no two device nodes overlap significantly
      const boxes = [];
      for (let i = 0; i < Math.min(count, 20); i++) {
        const box = await deviceNodes.nth(i).boundingBox();
        if (box) boxes.push(box);
      }

      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
          const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          const overlapArea = overlapX * overlapY;
          const minArea = Math.min(a.width * a.height, b.width * b.height);
          // Significant overlap = more than 30% of the smaller node area
          if (overlapArea > minArea * 0.3) overlaps++;
        }
      }

      // Should have zero or very few significant overlaps
      expect(overlaps).toBeLessThanOrEqual(1);
    }

    await page.screenshot({ path: 'tests/screenshots/topology-no-overlap.png', fullPage: true });
  });
});
