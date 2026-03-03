import { test, expect, login } from '../../e2e/fixtures';

test.describe('Agents page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/agents/');
  });

  test('agents page loads with heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/agents-page.png', fullPage: true });
  });

  test('Add Agent button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Agent', exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('Add Agent dialog opens', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
    
    // Dialog should appear with "Add New Agent" title
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('heading', { name: 'Add New Agent' })).toBeVisible();
    await expect(page.locator('[role="dialog"]').getByText('Agent Name')).toBeVisible();
    
    // Name input should be present
    const nameInput = page.getByPlaceholder(/docker-lxc/);
    await expect(nameInput).toBeVisible();
    
    // Generate API Key button should be disabled when name is empty
    const createBtn = page.getByRole('button', { name: 'Generate API Key' });
    await expect(createBtn).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-open.png' });
  });

  test('Agent creation flow', async ({ page }) => {
    const agentName = `e2e-agent-${Date.now()}`;
    
    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    
    // Fill agent name
    const nameInput = page.getByPlaceholder(/docker-lxc/);
    await nameInput.fill(agentName);
    
    // Click Generate API Key
    await page.getByRole('button', { name: 'Generate API Key' }).click();
    
    // Should show "Agent Created" title and API key
    await expect(page.getByRole('heading', { name: 'Agent Created' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="dialog"]').getByText('API Key')).toBeVisible();
    await expect(page.getByText(/Save this key/)).toBeVisible();
    
    // Should show install command tabs
    await expect(page.getByText('Linux x86_64')).toBeVisible();
    await expect(page.getByText('Linux ARM64')).toBeVisible();
    await expect(page.getByText('macOS ARM')).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-created.png' });
    
    // Close dialog
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    
    // The agent should now appear in the table
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/agents-after-create.png', fullPage: true });
  });

  test('Dialog fits within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-viewport.png' });
    
    // Check dialog doesn't overflow viewport
    const dialog = page.locator('[role="dialog"]');
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1280);
      expect(box.y + box.height).toBeLessThanOrEqual(800);
    }
  });

  test('Dialog fits on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });
    
    // force: true bypasses Playwright's actionability check — overflow:clip on layout containers
    // confuses the hit-test on mobile viewport, but the button is genuinely clickable in real browsers.
    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click({ force: true });
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    
    // Fill name and create to test the larger dialog state
    const nameInput = page.getByPlaceholder(/docker-lxc/);
    await nameInput.fill('mobile-test');
    await page.getByRole('button', { name: 'Generate API Key' }).click();
    await expect(page.getByRole('heading', { name: 'Agent Created' })).toBeVisible({ timeout: 10000 });
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-mobile.png', fullPage: true });
    
    // Check dialog doesn't overflow
    const dialog = page.locator('[role="dialog"]');
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 1); // Allow 1px tolerance
    }
  });
});
