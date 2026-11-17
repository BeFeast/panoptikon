import { test, expect, login } from "../../e2e/fixtures";

test.describe.serial("Caddy production admin settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("caddy admin settings save and reload roundtrip", async ({ page }) => {
    await page.goto("/caddy/");
    await expect(page.locator("#caddy-admin-user")).toBeVisible({
      timeout: 15_000,
    });

    const managed = page.locator("#caddy-managed");
    if ((await managed.getAttribute("data-state")) === "checked") {
      await managed.click();
    }
    await page.locator("#caddy-admin-user").fill("panoptikon-e2e");
    await page.locator("#caddy-admin-password").fill("caddy-e2e-secret");
    await page.locator("#caddy-lan-ip").fill("10.23.45.67");
    await page.locator("#caddy-admin-gate-port").fill("2443");
    await page
      .locator("#caddy-admin-allowed-ranges")
      .fill("10.23.45.1/32,127.0.0.1/32");
    await page.locator("#caddy-acme-email").fill("caddy-e2e@example.test");
    await page.locator("#caddy-dns-token-env").fill("CADDY_E2E_TOKEN");

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Caddy settings saved")).toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#caddy-admin-user")).toHaveValue(
      "panoptikon-e2e"
    );
    await expect(page.locator("#caddy-lan-ip")).toHaveValue("10.23.45.67");
    await expect(page.locator("#caddy-admin-gate-port")).toHaveValue("2443");
    await expect(page.locator("#caddy-admin-allowed-ranges")).toHaveValue(
      "10.23.45.1/32,127.0.0.1/32"
    );
    await expect(page.locator("#caddy-acme-email")).toHaveValue(
      "caddy-e2e@example.test"
    );
    await expect(page.locator("#caddy-dns-token-env")).toHaveValue(
      "CADDY_E2E_TOKEN"
    );
    await expect(page.locator("#caddy-admin-password")).toHaveValue("");
    await expect(page.locator("#caddy-admin-password")).toHaveAttribute(
      "placeholder",
      /\(set\)/
    );
    await page.screenshot({
      path: "tests/screenshots/caddy-admin-settings-persisted.png",
      fullPage: true,
    });

    // Restore non-secret shared settings for parallel suites. The test password
    // intentionally remains set while managed mode remains off.
    await page.locator("#caddy-admin-user").fill("");
    await page.locator("#caddy-lan-ip").fill("");
    await page.locator("#caddy-admin-gate-port").fill("2019");
    await page.locator("#caddy-admin-allowed-ranges").fill("");
    await page.locator("#caddy-acme-email").fill("");
    await page
      .locator("#caddy-dns-token-env")
      .fill("CLOUDFLARE_API_TOKEN");
    await save.click();
    await expect(page.getByText("Caddy settings saved")).toBeVisible();
  });

  test("sync status badge reflects unmanaged state", async ({ page }) => {
    await page.goto("/caddy/");
    await expect(page.getByTestId("caddy-sync-status")).toHaveText(
      "Unmanaged"
    );
    await page.getByRole("button", { name: "Sync to Caddy" }).click();
    await expect(
      page.getByText("Sync skipped: Caddy is unmanaged")
    ).toBeVisible();
    await page.screenshot({
      path: "tests/screenshots/caddy-sync-badge-unmanaged.png",
    });
  });

  test("sync badge renders failed and locked-out states", async ({ page }) => {
    const status = {
      configured: true,
      reachable: false,
      managed: true,
      auth_enabled: true,
      gate_change_pending: false,
      last_sync_ok: false,
      last_sync_at: "2026-09-06T00:00:00Z",
      last_sync_error: "boom",
      last_sync_route_count: 0,
      last_sync_locked_out: false,
    };
    await page.route("**/api/v1/caddy/status", (route) =>
      route.fulfill({ json: status })
    );
    await page.goto("/caddy/");
    await expect(page.getByTestId("caddy-sync-status")).toHaveText(
      "Sync failed"
    );
    await page.screenshot({
      path: "tests/screenshots/caddy-sync-badge-failed.png",
    });

    status.last_sync_locked_out = true;
    await page.reload();
    await expect(page.getByTestId("caddy-sync-status")).toHaveText(
      "Locked out"
    );
    await page.screenshot({
      path: "tests/screenshots/caddy-sync-badge-locked-out.png",
    });
  });

  test("dns provider select only offers cloudflare", async ({ page }) => {
    await page.goto("/caddy/");
    await page.locator("#caddy-dns-provider").click();
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(
      page.getByRole("option", { name: "cloudflare" })
    ).toBeVisible();
    await page.screenshot({
      path: "tests/screenshots/caddy-dns-provider.png",
    });
  });

  test("admin settings remain usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/caddy/");
    await expect(page.locator("#admin-url")).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflows).toBe(false);
    await page.screenshot({
      path: "tests/screenshots/caddy-admin-settings-mobile.png",
      fullPage: true,
    });
  });
});
