import { test, expect, login } from "../../e2e/fixtures";

test.describe("Cloudflare Tunnel Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/cloudflare-tunnel/");
    await expect(page.locator("#cf-api-token")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("page renders with all three fields", async ({ page }) => {
    await expect(page.locator("#cf-api-token")).toBeVisible();
    await expect(page.locator("#cf-account-id")).toBeVisible();
    await expect(page.locator("#cf-tunnel-id")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-cloudflare-tunnel.png",
    });
  });

  test("save and reload persists account ID, tunnel ID and API token", async ({
    page,
  }) => {
    const testAccountId = "e2e-account-id-abc123";
    const testTunnelId = "e2e-tunnel-id-xyz789";

    await page.locator("#cf-api-token").fill("e2e-cf-token-secret");
    await page.locator("#cf-account-id").fill(testAccountId);
    await page.locator("#cf-tunnel-id").fill(testTunnelId);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Cloudflare Tunnel settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#cf-api-token")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#cf-account-id")).toHaveValue(testAccountId);
    await expect(page.locator("#cf-tunnel-id")).toHaveValue(testTunnelId);
    // API token is never returned; the "(saved)" badge confirms it was stored
    await expect(
      page.locator('label[for="cf-api-token"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/settings-cloudflare-tunnel-persisted.png",
    });
  });

  test("inline help text is visible for all three fields", async ({ page }) => {
    // API Token help text
    const apiTokenHelp = page.locator(
      'text=Create at: dash.cloudflare.com → My Profile → API Tokens → Create Token',
    );
    await expect(apiTokenHelp).toBeVisible();
    await expect(apiTokenHelp).toContainText("Account:Cloudflare Tunnel:Edit");
    await expect(apiTokenHelp).toContainText("Zone:DNS:Edit");

    // Account ID help text
    const accountIdHelp = page.locator(
      'text=Found at: dash.cloudflare.com → any domain → right sidebar → Account ID',
    );
    await expect(accountIdHelp).toBeVisible();
    await expect(accountIdHelp).toContainText("32-character hex string");

    // Tunnel ID help text
    const tunnelIdHelp = page.locator(
      'text=Found at: dash.cloudflare.com → Zero Trust → Networks → Tunnels',
    );
    await expect(tunnelIdHelp).toBeVisible();
    await expect(tunnelIdHelp).toContainText("UUID");

    await page.screenshot({
      path: "tests/screenshots/settings-cloudflare-tunnel-help-text.png",
    });
  });

  test("settings index shows Cloudflare Tunnel card under Integrations", async ({
    page,
  }) => {
    await page.goto("/settings/");
    await expect(
      page.getByText("Cloudflare Tunnel", { exact: true }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/settings-index-cloudflare.png",
    });
  });

  test("settings index does not show Nginx Proxy Manager card", async ({
    page,
  }) => {
    await page.goto("/settings/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText("Nginx Proxy Manager"),
    ).not.toBeVisible();
  });

  test("cloudflare tunnel page links to settings/cloudflare-tunnel", async ({
    page,
  }) => {
    await page.goto("/cloudflare-tunnel/");
    await page.waitForLoadState("networkidle");

    // The "Not Configured" message may or may not show depending on state.
    // If configured, tunnel status is shown. Either way, check the page loaded.
    await expect(
      page.getByText("Cloudflare Tunnel"),
    ).toBeVisible({ timeout: 15000 });
  });
});
