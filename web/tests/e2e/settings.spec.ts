import { test, expect, login } from '../../e2e/fixtures';

/**
 * Helper: reset MikroTik-related settings via the API so each test starts clean.
 */
async function resetMikrotikSettings(page: import('@playwright/test').Page) {
  await page.request.patch('/api/v1/settings', {
    data: {
      mikrotik_url: '',
      mikrotik_user: '',
      mikrotik_password: '',
      mikrotik_enabled: true,
    },
  });
}

/**
 * Helper: reset Xiaomi Mesh settings via the API so each test starts clean.
 */
async function resetXiaomiSettings(page: import('@playwright/test').Page) {
  await page.request.patch('/api/v1/settings', {
    data: {
      xiaomi_mesh_ip: '',
      xiaomi_mesh_password: '',
      xiaomi_mesh_enabled: false,
      xiaomi_mesh_poll_interval: 30,
    },
  });
}

/**
 * Helper: reset VyOS settings via the API so each test starts clean.
 */
async function resetVyosSettings(page: import('@playwright/test').Page) {
  await page.request.patch('/api/v1/settings', {
    data: {
      vyos_url: '',
      vyos_api_key: '',
    },
  });
}

// ── MikroTik Settings ────────────────────────────────────────────────────────

test.describe('MikroTik Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await resetMikrotikSettings(page);
    await page.goto('/settings/router');
    // MikroTik tab is selected by default
    await expect(page.locator('#mt-url')).toBeVisible({ timeout: 10000 });
  });

  test('default state: placeholder shows 10.10.0.125 and toggle is enabled', async ({ page }) => {
    // The URL input should be empty but show the default placeholder
    await expect(page.locator('#mt-url')).toHaveAttribute('placeholder', 'http://10.10.0.125');

    // MikroTik integration should be enabled by default
    const toggle = page.locator('#mt-enabled');
    await expect(toggle).toBeVisible();
    // The switch has data-state="checked" when on
    await expect(toggle).toHaveAttribute('data-state', 'checked');
  });

  test('save URL, username, and toggle — values persist after reload', async ({ page }) => {
    // Disable the toggle first (it's enabled by default)
    await page.locator('#mt-enabled').click();

    // Fill in credentials
    await page.locator('#mt-url').fill('http://10.10.0.125');
    await page.locator('#mt-user').fill('admin');
    await page.locator('#mt-password').fill('secret123');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('MikroTik settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();
    await expect(page.locator('#mt-url')).toBeVisible({ timeout: 10000 });

    // Verify all values persisted
    await expect(page.locator('#mt-url')).toHaveValue('http://10.10.0.125');
    await expect(page.locator('#mt-user')).toHaveValue('admin');
    // Password is never returned — check indicator text "(saved)"
    await expect(page.getByText('(saved)')).toBeVisible();
    // Toggle should be off (we disabled it)
    await expect(page.locator('#mt-enabled')).toHaveAttribute('data-state', 'unchecked');
  });

  test('toggle enabled state persists after reload', async ({ page }) => {
    // MikroTik is enabled by default — disable it
    await page.locator('#mt-enabled').click();
    await expect(page.locator('#mt-enabled')).toHaveAttribute('data-state', 'unchecked');

    // Save (only the toggle change)
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('MikroTik settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();
    await expect(page.locator('#mt-enabled')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#mt-enabled')).toHaveAttribute('data-state', 'unchecked');

    // Now re-enable and save
    await page.locator('#mt-enabled').click();
    await expect(page.locator('#mt-enabled')).toHaveAttribute('data-state', 'checked');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('MikroTik settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload again — should be enabled
    await page.reload();
    await expect(page.locator('#mt-enabled')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#mt-enabled')).toHaveAttribute('data-state', 'checked');
  });

  test('Test Connection works with unsaved form values', async ({ page }) => {
    // Fill URL without saving first
    await page.locator('#mt-url').fill('http://10.10.0.125');
    await page.locator('#mt-user').fill('admin');

    // Test Connection button should be enabled (URL is filled)
    const testBtn = page.getByRole('button', { name: 'Test Connection' });
    await expect(testBtn).toBeEnabled();

    // Click Test Connection — it should attempt to connect using form values
    // (we expect it to fail since there's no real router, but it should not
    // require a prior save)
    await testBtn.click();

    // Wait for a result — either success or error, but NOT "Router URL is required"
    // which would mean it ignored the unsaved form values
    await expect(
      page.getByText('Connected!').or(
        page.getByText('unreachable')
      ).or(
        page.getByText('Failed to test connection')
      )
    ).toBeVisible({ timeout: 15000 });

    // Verify it did NOT show "Router URL is required" (which means unsaved values were used)
    await expect(page.getByText('Router URL is required.')).not.toBeVisible();
  });
});

// ── Xiaomi Mesh Settings ─────────────────────────────────────────────────────

test.describe('Xiaomi Mesh Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await resetXiaomiSettings(page);
    await page.goto('/settings/xiaomi-mesh');
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });
  });

  test('save default IP 10.10.0.199 — value persists after reload', async ({ page }) => {
    // The IP field should show the default value 10.10.0.199
    await expect(page.locator('#xiaomi-ip')).toHaveValue('10.10.0.199');

    // We need to enable and provide a password to make the form saveable
    // with the default IP. First trigger a change to make the form dirty.
    // Clear and re-enter the IP to mark it dirty.
    await page.locator('#xiaomi-ip').fill('');
    await page.locator('#xiaomi-ip').fill('10.10.0.199');

    // Enable integration and set password (required when enabled)
    await page.locator('#xiaomi-enabled').click();
    await page.locator('#xiaomi-password').fill('testpass');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });

    // Verify IP persisted — this was the bug: default value was not saved
    await expect(page.locator('#xiaomi-ip')).toHaveValue('10.10.0.199');
    // Verify enabled persisted
    await expect(page.locator('#xiaomi-enabled')).toHaveAttribute('data-state', 'checked');
  });

  test('save non-default IP 10.10.0.1 — value persists after reload', async ({ page }) => {
    // Fill non-default IP
    await page.locator('#xiaomi-ip').fill('10.10.0.1');

    // Enable integration and set password
    await page.locator('#xiaomi-enabled').click();
    await page.locator('#xiaomi-password').fill('testpass');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });

    // Verify non-default IP persisted
    await expect(page.locator('#xiaomi-ip')).toHaveValue('10.10.0.1');
  });

  test('change IP from default to non-default — new value persists', async ({ page }) => {
    // First save with default IP
    await page.locator('#xiaomi-ip').fill('');
    await page.locator('#xiaomi-ip').fill('10.10.0.199');
    await page.locator('#xiaomi-enabled').click();
    await page.locator('#xiaomi-password').fill('testpass');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Now change to non-default IP
    await page.locator('#xiaomi-ip').fill('10.10.0.1');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload and verify new IP
    await page.reload();
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#xiaomi-ip')).toHaveValue('10.10.0.1');
  });

  test('poll interval persists after save and reload', async ({ page }) => {
    // Change poll interval to a non-default value
    await page.locator('#xiaomi-poll-interval').fill('60');

    // Save (poll interval change is enough to be dirty)
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload and verify
    await page.reload();
    await expect(page.locator('#xiaomi-poll-interval')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#xiaomi-poll-interval')).toHaveValue('60');
  });

  test('enabled toggle persists after save and reload', async ({ page }) => {
    // Enable integration (disabled by default)
    await page.locator('#xiaomi-enabled').click();
    await expect(page.locator('#xiaomi-enabled')).toHaveAttribute('data-state', 'checked');

    // Provide required password and save
    await page.locator('#xiaomi-password').fill('testpass');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload and verify
    await page.reload();
    await expect(page.locator('#xiaomi-enabled')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#xiaomi-enabled')).toHaveAttribute('data-state', 'checked');
  });
});

// ── VyOS Settings ────────────────────────────────────────────────────────────

test.describe('VyOS Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await resetVyosSettings(page);
    await page.goto('/settings/router');
    // Switch to VyOS tab
    await page.getByRole('tab', { name: /VyOS/ }).click();
    await expect(page.locator('#vyos-url')).toBeVisible({ timeout: 10000 });
  });

  test('save VyOS URL and API key — values persist after reload', async ({ page }) => {
    // Fill VyOS settings
    await page.locator('#vyos-url').fill('https://10.10.0.50');
    await page.locator('#vyos-key').fill('my-vyos-api-key');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('VyOS settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload and switch to VyOS tab
    await page.reload();
    await expect(page.locator('#mt-url')).toBeVisible({ timeout: 10000 });
    await page.getByRole('tab', { name: /VyOS/ }).click();
    await expect(page.locator('#vyos-url')).toBeVisible({ timeout: 5000 });

    // Verify URL persisted
    await expect(page.locator('#vyos-url')).toHaveValue('https://10.10.0.50');
    // API key indicator should show "(saved)"
    await expect(page.getByText('(saved)')).toBeVisible();
  });
});

// ── General Settings Contract ────────────────────────────────────────────────

test.describe('General Settings Contract', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('MikroTik: any filled and saved field survives page reload', async ({ page }) => {
    await resetMikrotikSettings(page);
    await page.goto('/settings/router');
    await expect(page.locator('#mt-url')).toBeVisible({ timeout: 10000 });

    // Fill all fields
    await page.locator('#mt-url').fill('http://192.168.1.1');
    await page.locator('#mt-user').fill('routeradmin');
    await page.locator('#mt-password').fill('routerpass');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('MikroTik settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();
    await expect(page.locator('#mt-url')).toBeVisible({ timeout: 10000 });

    // All fields must survive
    await expect(page.locator('#mt-url')).toHaveValue('http://192.168.1.1');
    await expect(page.locator('#mt-user')).toHaveValue('routeradmin');
    await expect(page.getByText('(saved)')).toBeVisible(); // password indicator
  });

  test('Xiaomi: any filled and saved field survives page reload', async ({ page }) => {
    await resetXiaomiSettings(page);
    await page.goto('/settings/xiaomi-mesh');
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });

    // Fill all fields with non-default values
    await page.locator('#xiaomi-ip').fill('10.10.0.50');
    await page.locator('#xiaomi-enabled').click();
    await page.locator('#xiaomi-password').fill('meshpass');
    await page.locator('#xiaomi-poll-interval').fill('120');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Xiaomi Mesh settings saved.')).toBeVisible({ timeout: 10000 });

    // Reload
    await page.reload();
    await expect(page.locator('#xiaomi-ip')).toBeVisible({ timeout: 10000 });

    // All fields must survive
    await expect(page.locator('#xiaomi-ip')).toHaveValue('10.10.0.50');
    await expect(page.locator('#xiaomi-enabled')).toHaveAttribute('data-state', 'checked');
    await expect(page.getByText('(saved)')).toBeVisible();
    await expect(page.locator('#xiaomi-poll-interval')).toHaveValue('120');
  });
});
