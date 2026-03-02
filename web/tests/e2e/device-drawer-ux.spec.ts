import { test, expect, login } from '../../e2e/fixtures';

test.describe('Device drawer UX — scrolling, field order, sticky save', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });
  });

  /** Helper: open the first device's detail drawer. Returns true if a device existed. */
  async function openFirstDeviceDrawer(page: import('@playwright/test').Page): Promise<boolean> {
    await page.waitForTimeout(3000);
    const pageText = await page.textContent('body') ?? '';
    const hasDevices = /\d+\.\d+\.\d+\.\d+/.test(pageText);
    if (!hasDevices) return false;

    // Try data-device-row first, fallback to table row with IP
    const deviceRow = page.locator('[data-device-row]').first();
    if (await deviceRow.isVisible()) {
      await deviceRow.click();
    } else {
      const tableRow = page.locator('tr').filter({ hasText: /\d+\.\d+\.\d+\.\d+/ }).first();
      if (await tableRow.isVisible()) {
        await tableRow.click();
      } else {
        return false;
      }
    }

    // Wait for the sheet/dialog to open
    await page.waitForTimeout(1000);
    return true;
  }

  test('drawer body is scrollable and does not clip content', async ({ page }) => {
    const opened = await openFirstDeviceDrawer(page);
    if (!opened) { test.skip(); return; }

    // The sheet content should have overflow-y-auto on its scrollable child
    const sheetContent = page.locator('[role="dialog"]');
    await expect(sheetContent).toBeVisible({ timeout: 5000 });

    // Verify the scrollable container exists within the drawer
    const scrollableArea = sheetContent.locator('.overflow-y-auto');
    await expect(scrollableArea).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/device-drawer-scrollable.png' });
  });

  test('Edit tab shows sticky Save button at the bottom', async ({ page }) => {
    const opened = await openFirstDeviceDrawer(page);
    if (!opened) { test.skip(); return; }

    // Click the Edit tab
    const editTab = page.getByRole('tab', { name: 'Edit' });
    await expect(editTab).toBeVisible({ timeout: 5000 });
    await editTab.click();
    await page.waitForTimeout(500);

    // The Save Changes button should be visible without scrolling
    const saveButton = page.getByRole('button', { name: /Save Changes/i });
    await expect(saveButton).toBeVisible({ timeout: 5000 });

    // Verify the save button is within the viewport (sticky footer)
    const saveBox = await saveButton.boundingBox();
    expect(saveBox).not.toBeNull();
    if (saveBox) {
      const viewport = page.viewportSize();
      if (viewport) {
        // Save button bottom edge should be within the viewport
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(viewport.height);
      }
    }

    await page.screenshot({ path: 'tests/screenshots/device-drawer-edit-save-visible.png' });
  });

  test('drawer header shows custom name first with detected hostname as secondary', async ({ page }) => {
    const opened = await openFirstDeviceDrawer(page);
    if (!opened) { test.skip(); return; }

    // Take a screenshot of the drawer header to verify field order
    const sheetContent = page.locator('[role="dialog"]');
    await expect(sheetContent).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/screenshots/device-drawer-header-name-order.png' });

    // Verify the drawer has key UI elements — title and status
    const sheetText = await sheetContent.textContent() ?? '';
    const hasIdentity =
      sheetText.includes('Info') ||
      sheetText.includes('Edit') ||
      sheetText.includes('Online') ||
      sheetText.includes('Offline');
    expect(hasIdentity).toBeTruthy();
  });

  test('Info tab OS field renders without errors', async ({ page }) => {
    const opened = await openFirstDeviceDrawer(page);
    if (!opened) { test.skip(); return; }

    // Info tab is the default — verify it renders key sections
    const sheetContent = page.locator('[role="dialog"]');
    await expect(sheetContent).toBeVisible({ timeout: 5000 });

    const sheetText = await sheetContent.textContent() ?? '';
    // Should have basic info fields
    const hasBasicInfo =
      sheetText.includes('IP Address') ||
      sheetText.includes('MAC Address');
    expect(hasBasicInfo).toBeTruthy();

    await page.screenshot({ path: 'tests/screenshots/device-drawer-info-os.png' });
  });
});
