import { test, expect, login } from '../../e2e/fixtures';

test.describe('Assets page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/assets/');
  });

  test('assets page loads without error', async ({ page }) => {
    // Should NOT show an error state (e.g. 500 from backend)
    await page.waitForTimeout(2000);
    const errorText = page.locator('text=Failed to load');
    await expect(errorText).not.toBeVisible();

    // Should show the page heading
    await expect(page.locator('h1:has-text("Assets")')).toBeVisible({ timeout: 5000 });
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
    await expect(page.locator('button:has-text("Add Asset")')).toBeVisible({ timeout: 5000 });
  });

  test('Add Asset dialog opens', async ({ page }) => {
    await page.click('button:has-text("Add Asset")');

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Add Asset')).toBeVisible();
    await expect(page.locator('text=Name')).toBeVisible();
    await expect(page.locator('text=Type')).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/assets-dialog-open.png' });
  });

  test('create asset → appears in list → delete', async ({ page }) => {
    const assetName = `e2e-asset-${Date.now()}`;

    // Open Add Asset dialog
    await page.click('button:has-text("Add Asset")');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

    // Fill the name field
    const nameInput = page.locator('input[placeholder="e.g. web-server-01"]');
    await nameInput.fill(assetName);

    // Submit
    await page.locator('[role="dialog"] button:has-text("Add Asset")').click();

    // Dialog should close and asset should appear in list
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${assetName}`)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/assets-after-create.png', fullPage: true });

    // Delete the asset — click the delete button in the row
    const row = page.locator('tr', { has: page.locator(`text=${assetName}`) });
    await row.locator('button[title="Delete"]').click();

    // Confirm deletion in the alert dialog
    await expect(page.locator('text=Delete asset?')).toBeVisible({ timeout: 3000 });
    await page.locator('button:has-text("Delete")').last().click();

    // Asset should be removed from the list
    await expect(page.locator(`text=${assetName}`)).not.toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/assets-after-delete.png', fullPage: true });
  });

  test('search filters assets', async ({ page }) => {
    await page.waitForTimeout(2000);

    const search = page.locator('input[placeholder="Search by name, location, IP, owner, tag..."]');
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.fill('nonexistent-asset-xyz');
    await page.waitForTimeout(500);

    // Should show empty filter state or no matching results
    const pageText = await page.textContent('body') ?? '';
    const hasNoMatch = pageText.includes('No assets match') || pageText.includes('No assets yet');
    expect(hasNoMatch).toBeTruthy();
  });
});
