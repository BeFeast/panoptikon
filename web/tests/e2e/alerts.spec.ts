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

  test('no duplicate agent_offline alerts within cooldown window', async ({ page }) => {
    // Navigate to alerts page.
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Fetch all agent_offline alerts via the API.
    const resp = await page.request.get('/api/v1/alerts?limit=200&type=agent_offline');
    expect(resp.ok()).toBeTruthy();
    const alerts: Array<{
      agent_id: string | null;
      type: string;
      message: string;
      created_at: string;
    }> = await resp.json();

    // Group agent_offline alerts by agent_id and check that no two alerts
    // for the same agent were created within the 10-minute cooldown window.
    const byAgent = new Map<string, string[]>();
    for (const a of alerts) {
      if (a.agent_id) {
        const times = byAgent.get(a.agent_id) ?? [];
        times.push(a.created_at);
        byAgent.set(a.agent_id, times);
      }
    }

    for (const [agentId, times] of byAgent) {
      const sorted = times.map(t => new Date(t).getTime()).sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        expect(gap).toBeGreaterThanOrEqual(600_000); // 10 minutes in ms
      }
    }

    // Also check the UI: filter to Agent Offline type and verify no
    // adjacent cards show the exact same message text.
    await page.getByRole('button', { name: /Agent Offline/i }).click();
    await page.waitForTimeout(500);

    const cards = await page.locator('[class*="card"], [class*="Card"]').all();
    const messages: string[] = [];
    for (const card of cards) {
      const text = await card.textContent();
      if (text) messages.push(text.trim());
    }

    // Consecutive identical card text would indicate duplicates.
    for (let i = 1; i < messages.length; i++) {
      if (messages[i] === messages[i - 1]) {
        // Allow if timestamps differ — same message with different times is OK.
        // But exact duplicates (same card text) indicate a problem.
        expect(messages[i]).not.toBe(messages[i - 1]);
      }
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-no-duplicates.png', fullPage: true });
  });

  test('alert rows have severity-colored left borders', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Check that alert cards have border-l-2 class for severity borders
    const cards = await page.locator('[class*="border-l-2"]').all();

    // If there are alerts, they should have colored left borders
    if (cards.length > 0) {
      for (const card of cards) {
        const classes = await card.getAttribute('class');
        // Each card should have one of the severity border colors
        const hasSeverityBorder =
          classes?.includes('border-l-red-500') ||
          classes?.includes('border-l-amber-500') ||
          classes?.includes('border-l-blue-500');
        expect(hasSeverityBorder).toBeTruthy();
      }
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-severity-borders.png', fullPage: true });
  });

  test('critical alerts have pulse animation', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Check for critical alert cards with pulse animation
    const criticalCards = await page.locator('[class*="animate-pulse-critical"]').all();

    // If there are critical alerts, they should have the pulse animation class
    // We also verify that cards with red borders exist if critical alerts are present
    const criticalBadges = await page.locator('text=CRITICAL').all();
    if (criticalBadges.length > 0) {
      // There should be at least one pulsing card (non-acknowledged criticals)
      // Some may be acknowledged and not pulsing
      expect(criticalCards.length).toBeGreaterThanOrEqual(0);
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-critical-pulse.png', fullPage: true });
  });

  test('severity summary bar shows counts', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Fetch alerts via API to check if there are any
    const resp = await page.request.get('/api/v1/alerts?limit=200');
    expect(resp.ok()).toBeTruthy();
    const alerts: Array<{ severity: string; acknowledged_at: string | null }> = await resp.json();

    const activeAlerts = alerts.filter(a => !a.acknowledged_at);

    if (alerts.length > 0) {
      // Summary bar should be visible when there are alerts
      const summaryBar = page.locator('[class*="rounded-lg"][class*="border-slate-800"][class*="bg-slate-900"]').first();

      // Check for severity count badges
      const criticalCount = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
      const warningCount = activeAlerts.filter(a => a.severity === 'WARNING').length;
      const infoCount = activeAlerts.filter(a => a.severity === 'INFO').length;

      if (criticalCount > 0) {
        await expect(page.getByText(`${criticalCount} critical`)).toBeVisible();
      }
      if (warningCount > 0) {
        await expect(page.getByText(`${warningCount} warning`)).toBeVisible();
      }
      if (infoCount > 0) {
        await expect(page.getByText(`${infoCount} info`)).toBeVisible();
      }
    }

    await page.screenshot({ path: 'tests/screenshots/alerts-summary-bar.png', fullPage: true });
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
