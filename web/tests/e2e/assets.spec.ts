import { test, expect, login } from '../../e2e/fixtures';

test.describe('Assets page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/assets/');
  });

  test('assets page loads without error', async ({ page }) => {
    // Should NOT show an error state (e.g. 500 from backend)
    await page.waitForTimeout(2000);
    const errorText = page.getByText('Failed to load');
    await expect(errorText).not.toBeVisible();

    // Should show the page heading
    await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/assets-page.png', fullPage: true });
  });

  test('assets page renders table or empty state', async ({ page }) => {
    // Wait for loading to finish (skeleton disappears)
    await page.waitForTimeout(3000);

    const pageText = await page.textContent('body') ?? '';

    // Either the table with column headers is visible, or the empty state shows
    const hasTable = pageText.includes('Name') && pageText.includes('Type');
    const hasEmptyState = pageText.includes('No assets yet') || pageText.includes('No assets match');

    expect(hasTable || hasEmptyState).toBeTruthy();
  });

  test('Add Asset button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Asset', exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('Add Asset dialog opens', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Asset', exact: true }).first().click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    // Use role locator to avoid strict mode violation (multiple "Add Asset" elements)
    await expect(page.getByRole('heading', { name: 'Add Asset', exact: true })).toBeVisible();
    await expect(page.locator('[role="dialog"]').getByText('Name', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[role="dialog"]').getByText('Type', { exact: true }).first()).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/assets-dialog-open.png' });
  });

  test('create asset → appears in list → delete', async ({ page }) => {
    const assetName = `e2e-asset-${Date.now()}`;

    // Open Add Asset dialog
    await page.getByRole('button', { name: 'Add Asset', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

    // Fill the name field
    const nameInput = page.locator('input[placeholder="e.g. web-server-01"]');
    await nameInput.fill(assetName);

    // Submit - use the button inside the dialog
    await page.locator('[role="dialog"]').getByRole('button', { name: 'Add Asset', exact: true }).click();

    // Dialog should close and asset should appear in list
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText(assetName)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/assets-after-create.png', fullPage: true });

    // Delete the asset — click the delete button in the row
    const row = page.locator('tr', { has: page.getByText(assetName) });
    await row.locator('button[title="Delete"]').click();

    // Confirm deletion in the alert dialog
    await expect(page.getByText('Delete asset?')).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();

    // Asset should be removed from the list
    await expect(page.getByText(assetName)).not.toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/assets-after-delete.png', fullPage: true });
  });

  test('search filters assets', async ({ page }) => {
    await page.waitForTimeout(2000);

    const search = page.locator('input[placeholder="Search by name, location, IP, owner, tag..."]');
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill('nonexistent-asset-xyz');
    await page.waitForTimeout(500);

    // Should show empty filter state or no matching results
    const pageText = await page.textContent('body') ?? '';
    const hasNoMatch = pageText.includes('No assets match') || pageText.includes('No assets yet');
    expect(hasNoMatch).toBeTruthy();
  });
});
