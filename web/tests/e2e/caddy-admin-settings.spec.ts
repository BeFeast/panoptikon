import { test, expect, login } from "../../e2e/fixtures";

async function openCaddy(page: import("@playwright/test").Page) {
  await login(page);
  await page.goto("/caddy/");
  await expect(
    page.getByRole("heading", { name: "Caddy Reverse Proxy", level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#caddy-managed")).toBeVisible();
}

async function keepUnmanaged(page: import("@playwright/test").Page) {
  const managed = page.locator("#caddy-managed");
  if ((await managed.getAttribute("aria-checked")) === "true") {
    await managed.click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Caddy settings saved")).toBeVisible();
  }
}

test("caddy admin settings save and reload roundtrip", async ({ page }) => {
  await openCaddy(page);
  await keepUnmanaged(page);

  await page.locator("#caddy-admin-user").fill("panoptikon-e2e");
  await page.locator("#caddy-admin-password").fill("caddy-e2e-secret");
  await page.locator("#caddy-lan-ip").fill("10.10.0.32");
  await page.locator("#caddy-admin-resolve-ip").fill("10.10.0.32");
  await page.locator("#caddy-admin-gate-port").fill("2029");
  await page
    .locator("#caddy-admin-allowed-ranges")
    .fill("10.10.0.22/32,127.0.0.1/32");
  await page.locator("#caddy-acme-email").fill("caddy-e2e@example.test");
  await page.locator("#caddy-acme-zones").fill("example.test");
  await page.locator("#caddy-dns-token-env").fill("CADDY_E2E_TOKEN");

  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Caddy settings saved")).toBeVisible({
    timeout: 10_000,
  });

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#caddy-admin-user")).toHaveValue(
    "panoptikon-e2e",
  );
  await expect(page.locator("#caddy-admin-password")).toHaveValue("");
  await expect(page.locator("#caddy-admin-password")).toHaveAttribute(
    "placeholder",
    /\(set\)/,
  );
  await expect(page.locator("#caddy-lan-ip")).toHaveValue("10.10.0.32");
  await expect(page.locator("#caddy-admin-resolve-ip")).toHaveValue(
    "10.10.0.32",
  );
  await expect(page.locator("#caddy-admin-gate-port")).toHaveValue("2029");
  await expect(page.locator("#caddy-admin-allowed-ranges")).toHaveValue(
    "10.10.0.22/32,127.0.0.1/32",
  );
  await expect(page.locator("#caddy-acme-email")).toHaveValue(
    "caddy-e2e@example.test",
  );
  await expect(page.locator("#caddy-dns-token-env")).toHaveValue(
    "CADDY_E2E_TOKEN",
  );
  await page.screenshot({
    path: "tests/screenshots/caddy-admin-settings-persisted.png",
    fullPage: true,
  });

  // Restore shared non-secret settings for the rest of the E2E suite. The
  // password intentionally remains set while managed mode remains disabled.
  await page.locator("#caddy-admin-user").fill("");
  await page.locator("#caddy-lan-ip").fill("");
  await page.locator("#caddy-admin-resolve-ip").fill("");
  await page.locator("#caddy-admin-gate-port").fill("2019");
  await page.locator("#caddy-admin-allowed-ranges").fill("");
  await page.locator("#caddy-acme-email").fill("");
  await page.locator("#caddy-acme-zones").fill("");
  await page.locator("#caddy-dns-token-env").fill("CLOUDFLARE_API_TOKEN");
  await save.click();
  await expect(page.getByText("Caddy settings saved")).toBeVisible();
});

test("sync status badge reflects unmanaged state", async ({ page }) => {
  await openCaddy(page);
  await keepUnmanaged(page);
  await expect(page.getByTestId("caddy-sync-status")).toHaveText("Unmanaged");
  await page.getByRole("button", { name: "Sync to Caddy" }).click();
  await expect(
    page.getByText("Sync skipped: Caddy is unmanaged"),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/screenshots/caddy-sync-badge-unmanaged.png",
  });
});

test("sync badge renders failed state", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/caddy/status", (route) =>
    route.fulfill({
      json: {
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
      },
    }),
  );
  await page.goto("/caddy/");
  await expect(page.getByTestId("caddy-sync-status")).toHaveText("Sync failed");
  await page.screenshot({
    path: "tests/screenshots/caddy-sync-badge-failed.png",
  });
});

test("sync badge renders locked-out state", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/caddy/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: false,
        managed: true,
        auth_enabled: true,
        gate_change_pending: false,
        last_sync_ok: false,
        last_sync_at: "2026-09-06T00:00:00Z",
        last_sync_error: "gate unavailable",
        last_sync_route_count: 1,
        last_sync_locked_out: true,
      },
    }),
  );
  await page.goto("/caddy/");
  await expect(page.getByTestId("caddy-sync-status")).toHaveText("Locked out");
  await page.screenshot({
    path: "tests/screenshots/caddy-sync-badge-locked-out.png",
  });
});

test("dns provider select only offers cloudflare", async ({ page }) => {
  await openCaddy(page);
  await page.locator("#caddy-dns-provider").click();
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: "cloudflare" }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/screenshots/caddy-dns-provider-cloudflare.png",
  });
});
