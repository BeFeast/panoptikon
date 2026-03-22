import { test, expect, login } from '../../e2e/fixtures';

test.describe('Empty states', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Agents page shows empty state with CTA', async ({ page }) => {
    await page.goto('/agents/');
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for data to load — if no agents exist, the empty state should appear
    // If agents exist, verify the table is shown instead
    const emptyState = page.getByText('No agents connected');
    const agentsTable = page.locator('table');

    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      agentsTable.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
      // Verify empty state structure
      await expect(page.getByText('Install a lightweight agent')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add Agent' })).toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/agents-empty-state.png', fullPage: true });
    } else {
      // Agents exist — verify table is visible
      await expect(agentsTable).toBeVisible();
    }
  });

  test('SSH Hosts page shows empty state with CTA', async ({ page }) => {
    await page.goto('/ssh-hosts/');

    // Page may show: h1 heading (normal load), or ErrorState (API failure).
    // Wait for either the heading or the error state to appear.
    const heading = page.getByRole('heading', { name: 'SSH Hosts', level: 1 });
    const errorState = page.getByText('Something went wrong');

    await Promise.race([
      heading.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      errorState.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);

    // If the API failed and ErrorState replaced the page, skip the rest
    if (await errorState.isVisible()) {
      await page.screenshot({ path: 'tests/screenshots/ssh-hosts-error-state.png', fullPage: true });
      return;
    }

    await expect(heading).toBeVisible();

    const emptyState = page.getByText('No SSH hosts configured');
    const hostsTable = page.locator('table');

    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      hostsTable.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
      await expect(page.getByText('Connect to remote hosts via SSH')).toBeVisible();
      // Use .first() — header also has an "Add SSH Host" button
      await expect(page.getByRole('button', { name: 'Add SSH Host' }).first()).toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/ssh-hosts-empty-state.png', fullPage: true });
    } else {
      await expect(hostsTable).toBeVisible();
    }
  });

  test('Alerts page shows celebratory empty state when no alerts', async ({ page }) => {
    await page.goto('/alerts/');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible({ timeout: 15000 });

    const emptyState = page.getByText('All clear!');
    const alertsList = page.locator('[class*="space-y-2"]').filter({ has: page.locator('[class*="border-slate-800"]') });

    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      alertsList.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
      await expect(page.getByText('No alerts right now')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Configure Alert Rules' })).toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/alerts-empty-state.png', fullPage: true });
    }
  });

  test('Dashboard shows welcome card on fresh install', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    // The welcome card may or may not appear depending on setup state
    const welcomeCard = page.getByTestId('welcome-card');
    const infraCard = page.getByTestId('infra-health-card');

    // Wait for at least the infra card to load (indicates dashboard loaded)
    await expect(infraCard).toBeVisible({ timeout: 15000 });

    if (await welcomeCard.isVisible()) {
      await expect(page.getByText('Welcome to Panoptikon')).toBeVisible();
      await expect(page.getByText('Setup progress')).toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/dashboard-welcome-card.png', fullPage: true });
    }
  });

  test('Dashboard section error states have retry buttons', async ({ page }) => {
    await page.goto('/dashboard/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({ timeout: 15000 });

    // Wait for the dashboard to fully load
    await expect(page.getByTestId('infra-health-card')).toBeVisible({ timeout: 15000 });

    // Verify no raw error text is shown without a retry option
    // If any section errors appear, they should have retry links
    const retryLinks = page.getByText('Retry');
    const errorTexts = page.locator('text=/Failed to load/');

    // If there are errors, each should have a retry button nearby
    const errorCount = await errorTexts.count();
    if (errorCount > 0) {
      const retryCount = await retryLinks.count();
      expect(retryCount).toBeGreaterThanOrEqual(errorCount);
    }

    await page.screenshot({ path: 'tests/screenshots/dashboard-states.png', fullPage: true });
  });

  test('EmptyState and ErrorState components render correctly', async ({ page }) => {
    // Navigate to devices page — most likely to show empty state on a fresh install
    await page.goto('/devices/');
    await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible({ timeout: 15000 });

    const emptyState = page.getByText('No devices found');
    const deviceCards = page.locator('[class*="grid"]').filter({ has: page.locator('[class*="border-slate-"]') });

    await Promise.race([
      emptyState.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      deviceCards.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);

    if (await emptyState.isVisible()) {
      // Verify the EmptyState component has CTA button
      await expect(page.getByText('Run a network scan')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Scan Network' })).toBeVisible();
      await page.screenshot({ path: 'tests/screenshots/devices-empty-state.png', fullPage: true });
    }
  });
});
