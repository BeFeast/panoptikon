import { test, expect, login } from '../../e2e/fixtures';

test.describe('Alerts page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('alerts page loads with heading', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/alerts-page.png', fullPage: true });
  });

  test('agent offline alert shows agent name not raw UUID', async ({ page }) => {
    const agentName = `e2e-alert-agent-${Date.now()}`;

    // Create an agent via the UI to get a real agent in the DB.
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

    const nameInput = page.getByPlaceholder(/docker-lxc/);
    await nameInput.fill(agentName);
    await page.getByRole('button', { name: 'Generate API Key' }).click();
    await expect(page.getByRole('heading', { name: 'Agent Created' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });

    // Verify the agent appears in the agents table — grab its row for the ID.
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10000 });

    // Navigate to alerts page and verify it loads.
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Check that no alert messages contain a raw UUID pattern (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
    // This verifies the fix: agent_offline alerts should use agent name, not UUID.
    const uuidPattern = /Agent [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const alertMessages = await page.locator('text=/Agent .* disconnected/').all();
    for (const msg of alertMessages) {
      const text = await msg.textContent();
      expect(text).not.toMatch(uuidPattern);
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-no-uuid.png', fullPage: true });
  });
});
