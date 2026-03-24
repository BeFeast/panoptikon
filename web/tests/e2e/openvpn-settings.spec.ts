import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Settings page (/settings/openvpn).
 *
 * Validates that the OpenVPN management page loads correctly
 * and displays server configuration and connected clients (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_STATUS = {
  server: {
    available: true,
    enabled: true,
    port: 1194,
    mode: "ip",
    protocol: "tcp",
    certificate: "server-cert",
    default_profile: "default",
    cipher: "aes256-cbc",
    auth: "sha1",
    require_client_certificate: false,
    keepalive_timeout: "60",
    connected_clients: 1,
  },
  clients: [
    {
      name: "test-client",
      client_address: "10.10.0.50",
      uptime: "1h30m",
      encoding: "BF-128-CBC/SHA1",
      rx_bytes: 2097152,
      tx_bytes: 1048576,
    },
  ],
};

const MOCK_OVPN_NOT_AVAILABLE = {
  server: {
    available: false,
    enabled: false,
    port: null,
    mode: null,
    protocol: null,
    certificate: null,
    default_profile: null,
    cipher: null,
    auth: null,
    require_client_certificate: false,
    keepalive_timeout: null,
    connected_clients: 0,
  },
  clients: [],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOvpnStatus(page: Page, data: unknown) {
  await page.route("**/api/v1/openvpn/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Settings Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows unavailable message when MikroTik is not configured", async ({
    page,
  }) => {
    await mockOvpnStatus(page, MOCK_OVPN_NOT_AVAILABLE);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should show "not configured" message
    await expect(
      page.getByText("MikroTik is not configured"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-unavailable.png",
    });
  });

  test("shows server configuration when MikroTik is available", async ({
    page,
  }) => {
    await mockOvpnStatus(page, MOCK_OVPN_STATUS);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server configuration card should be visible
    await expect(
      page.getByText("Server Configuration"),
    ).toBeVisible();

    // Should show connected client
    await expect(page.getByText("Connected Clients")).toBeVisible();
    await expect(page.getByText("test-client")).toBeVisible();
    await expect(page.getByText("10.10.0.50")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-configured.png",
    });
  });

  test("shows export client config button", async ({ page }) => {
    await mockOvpnStatus(page, MOCK_OVPN_STATUS);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Export button should be visible
    await expect(
      page.getByRole("button", { name: /Export Client Config/i }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-export-button.png",
    });
  });
});
