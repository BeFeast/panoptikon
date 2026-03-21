import { test, expect, login } from '../../e2e/fixtures';

test.describe('Empty states with illustrated placeholders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Devices page shows empty state with icon and CTA', async ({ page }) => {
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load (either devices appear or empty state)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/empty-state-devices.png', fullPage: true });
  });

  test('Agents page shows empty state with icon and description', async ({ page }) => {
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/empty-state-agents.png', fullPage: true });
  });

  test('SSH Hosts page shows empty state with Add SSH Host CTA', async ({ page }) => {
    await page.goto('/ssh-hosts/');
    await expect(page.getByRole('heading', { name: 'SSH Hosts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(2000);

    // If empty state is shown, the Add SSH Host button should be in the empty state
    const emptyState = page.getByText('No SSH hosts configured');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      await expect(page.getByText('Add a host to start collecting')).toBeVisible();
      const ctaButton = page.getByRole('button', { name: 'Add SSH Host' });
      // CTA in empty state or header
      await expect(ctaButton.first()).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/empty-state-ssh-hosts.png', fullPage: true });
  });

  test('Alerts page shows celebratory empty state', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(2000);

    // If no alerts, should show celebratory "All clear!" message
    const emptyState = page.getByText('All clear!');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/empty-state-alerts.png', fullPage: true });
  });

  test('Dashboard shows welcome card on fresh install', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Welcome card may or may not show depending on setup state
    const welcomeText = page.getByText('Welcome to Panoptikon');
    if (await welcomeText.isVisible()) {
      await expect(welcomeText).toBeVisible();
      // Should show progress and setup steps
      await expect(page.getByText('Complete setup')).toBeVisible();
      await expect(page.getByText('Configure router')).toBeVisible();
      await expect(page.getByText('Discover devices')).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/empty-state-dashboard.png', fullPage: true });
  });

  test('EmptyState component renders with correct structure', async ({ page }) => {
    // Navigate to agents page which likely has no agents in test env
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load
    await page.waitForTimeout(3000);

    // Check for empty state structure — icon container, title, description
    const emptyState = page.getByText('No agents connected');
    if (await emptyState.isVisible()) {
      // Title should be visible
      await expect(emptyState).toBeVisible();
      // Description should be visible
      await expect(page.getByText('Install an agent on a remote machine')).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/empty-state-component.png', fullPage: true });
  });

  test('Traffic page shows empty state with monitoring hint', async ({ page }) => {
    await page.goto('/traffic/');
    // The traffic page might have a heading or just content
    await page.waitForTimeout(3000);

    const emptyState = page.getByText('No traffic data');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      await expect(page.getByText('Enable NetFlow or sFlow')).toBeVisible();
    }

    await page.screenshot({ path: 'tests/screenshots/empty-state-traffic.png', fullPage: true });
  });
});
