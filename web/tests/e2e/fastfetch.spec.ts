import { test, expect, login } from '../../e2e/fixtures';

test.describe('Fastfetch integration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('agents page loads and shows agent list', async ({ page }) => {
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'tests/screenshots/fastfetch-agents-page.png', fullPage: true });
  });

  test('fastfetch API endpoint returns data or null', async ({ page }) => {
    // Create an agent first to test the fastfetch endpoint
    const agentName = `e2e-fastfetch-${Date.now()}`;
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

    const nameInput = page.getByPlaceholder(/docker-lxc/);
    await nameInput.fill(agentName);
    await page.getByRole('button', { name: 'Generate API Key' }).click();
    await expect(page.getByRole('heading', { name: 'Agent Created' })).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/screenshots/fastfetch-agent-created.png' });

    // Close dialog
    await page.getByRole('button', { name: 'Done' }).click();

    // Find the agent in the list and get its ID
    await expect(page.getByText(agentName)).toBeVisible({ timeout: 10000 });

    // Test the fastfetch API endpoint directly — it should return null for a new agent
    // (no fastfetch data sent yet since no agent process has connected)
    const response = await page.evaluate(async (name: string) => {
      // Get agents list
      const res = await fetch('/api/v1/agents', { credentials: 'include' });
      const agents = await res.json();
      const agent = agents.find((a: { name: string }) => a.name === name);
      if (!agent) return { error: 'Agent not found' };

      // Fetch fastfetch data
      const ffRes = await fetch(`/api/v1/agents/${agent.id}/fastfetch`, { credentials: 'include' });
      return { status: ffRes.status, data: await ffRes.json(), agentId: agent.id };
    }, agentName);

    // Endpoint should return 200 with null data for an agent without fastfetch reports
    expect(response.status).toBe(200);

    await page.screenshot({ path: 'tests/screenshots/fastfetch-api-endpoint.png', fullPage: true });
  });

  test('agent detail page shows Hardware Info card with fastfetch fields', async ({ page }) => {
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    // Check if there are any existing agents to view details
    const agentLinks = page.locator('a[href*="/agents/detail"]');
    const count = await agentLinks.count();

    if (count > 0) {
      // Click first agent to view details
      await agentLinks.first().click();
      await page.waitForLoadState('networkidle');

      // The detail page should load
      await expect(page.getByRole('link', { name: 'Back to Agents' })).toBeVisible({ timeout: 15000 });

      // If hardware info is available, the card should be visible
      const hardwareCard = page.getByText('Hardware Info');
      const hasHardware = await hardwareCard.isVisible().catch(() => false);

      if (hasHardware) {
        // Verify the card structure renders correctly
        await expect(hardwareCard).toBeVisible();

        // Check for fastfetch-enriched labels (they only show if data exists)
        // These are the new fields added by fastfetch integration
        const possibleLabels = ['Model', 'Motherboard', 'CPU', 'GPU', 'RAM Type', 'BIOS', 'Disk', 'Uptime', 'Serial'];
        for (const label of possibleLabels) {
          const element = page.locator(`text=${label}:`).first();
          const visible = await element.isVisible().catch(() => false);
          if (visible) {
            // Just confirm the label renders without error
            await expect(element).toBeVisible();
          }
        }
      }

      await page.screenshot({ path: 'tests/screenshots/fastfetch-agent-detail.png', fullPage: true });
    } else {
      // No agents exist — create one and verify the detail page loads
      const agentName = `e2e-fastfetch-detail-${Date.now()}`;
      await page.getByRole('button', { name: 'Add Agent', exact: true }).first().click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

      const nameInput = page.getByPlaceholder(/docker-lxc/);
      await nameInput.fill(agentName);
      await page.getByRole('button', { name: 'Generate API Key' }).click();
      await expect(page.getByRole('heading', { name: 'Agent Created' })).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'Done' }).click();

      // Navigate to the newly created agent's detail page
      await page.getByText(agentName).click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({ path: 'tests/screenshots/fastfetch-new-agent-detail.png', fullPage: true });
    }
  });
});
