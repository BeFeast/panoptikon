import { test, expect, login } from '../../e2e/fixtures';

test.describe('Agents page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/agents/');
  });

  test('agents page loads with heading', async ({ page }) => {
    await expect(page.locator('h1:has-text("Agents")')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/agents-page.png', fullPage: true });
  });

  test('Add Agent button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Add Agent")')).toBeVisible({ timeout: 5000 });
  });

  test('Add Agent dialog opens', async ({ page }) => {
    await page.click('button:has-text("Add Agent")');
    
    // Dialog should appear with "Add New Agent" title
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Add New Agent')).toBeVisible();
    await expect(page.locator('text=Agent Name')).toBeVisible();
    
    // Name input should be present
    const nameInput = page.locator('input[placeholder*="docker-lxc"]');
    await expect(nameInput).toBeVisible();
    
    // Generate API Key button should be disabled when name is empty
    const createBtn = page.locator('button:has-text("Generate API Key")');
    await expect(createBtn).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-open.png' });
  });

  test('Agent creation flow', async ({ page }) => {
    const agentName = `e2e-agent-${Date.now()}`;
    
    await page.click('button:has-text("Add Agent")');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    
    // Fill agent name
    const nameInput = page.locator('input[placeholder*="docker-lxc"]');
    await nameInput.fill(agentName);
    
    // Click Generate API Key
    await page.click('button:has-text("Generate API Key")');
    
    // Should show "Agent Created" title and API key
    await expect(page.locator('text=Agent Created')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=API Key')).toBeVisible();
    await expect(page.locator('text=Save this key')).toBeVisible();
    
    // Should show install command tabs
    await expect(page.locator('text=Linux x86_64')).toBeVisible();
    await expect(page.locator('text=Linux ARM64')).toBeVisible();
    await expect(page.locator('text=macOS ARM')).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/agents-dialog-created.png' });
    
    // Close dialog
    await page.click('button:has-text("Done")');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    
    // The agent should now appear in the table
    await expect(page.locator(`text=${agentName}`)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'tests/screenshots/agents-after-create.png', fullPage: true });
  });

  test('Dialog fits within viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('button:has-text("Add Agent")');
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
    await expect(page.locator('h1:has-text("Agents")')).toBeVisible({ timeout: 5000 });
    
    await page.click('button:has-text("Add Agent")');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    
    // Fill name and create to test the larger dialog state
    const nameInput = page.locator('input[placeholder*="docker-lxc"]');
    await nameInput.fill('mobile-test');
    await page.click('button:has-text("Generate API Key")');
    await expect(page.locator('text=Agent Created')).toBeVisible({ timeout: 5000 });
    
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
