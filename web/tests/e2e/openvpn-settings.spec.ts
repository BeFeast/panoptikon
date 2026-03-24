import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Settings page (/settings/openvpn).
 *
 * Uses mocked API responses to avoid needing a real MikroTik router.
 */

// ── Mock data ────────────────────────────────────────────

const MOCK_OPENVPN_STATUS = {
  server: {
    available: true,
    enabled: true,
    port: 1194,
    mode: "ip",
    protocol: "tcp",
    cipher: "aes256-cbc",
    auth: "sha1",
    certificate: "ovpn-server",
    default_profile: "default",
    require_client_certificate: false,
  },
  certificates: [
    {
      id: "*1",
      name: "ca-cert",
      common_name: "Panoptikon CA",
      key_size: "2048",
      days_valid: "3650",
      fingerprint: "abc123",
      invalid_before: "2024-01-01",
      invalid_after: "2034-01-01",
      has_private_key: true,
      is_authority: true,
      is_ca: true,
      expired: false,
      trusted: true,
    },
    {
      id: "*2",
      name: "ovpn-server",
      common_name: "vpn.example.com",
      key_size: "2048",
      days_valid: "365",
      fingerprint: "def456",
      invalid_before: "2024-06-01",
      invalid_after: "2025-06-01",
      has_private_key: true,
      is_authority: false,
      is_ca: false,
      expired: false,
      trusted: true,
    },
  ],
  connected_clients: [
    {
      name: "client-1",
      client_address: "10.0.0.5",
      encoding: "AES-256-CBC",
      uptime: "1h30m",
      status: "connected",
    },
  ],
};

const MOCK_OPENVPN_NO_ROUTER = {
  server: {
    available: false,
    enabled: false,
    port: null,
    mode: null,
    protocol: null,
    cipher: null,
    auth: null,
    certificate: null,
    default_profile: null,
    require_client_certificate: false,
  },
  certificates: [],
  connected_clients: [],
};

// ── Helpers ──────────────────────────────────────────────

async function mockOpenVpnStatus(page: Page, data: unknown) {
  await page.route("**/api/v1/openvpn/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────

test.describe("OpenVPN Settings Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads with OpenVPN Settings heading", async ({ page }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-heading.png",
    });
  });

  test("shows server configuration when router is configured", async ({
    page,
  }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The SettingsSection with title "Server" should be visible
    // Use data-testid="settings-section" to find the section, then check inside it
    const serverSection = page
      .locator('[data-testid="settings-section"]')
      .filter({ hasText: "Server" })
      .first();
    await expect(serverSection).toBeVisible();

    // Port input should have value 1194
    const portInput = page.locator('input[type="number"]');
    await expect(portInput).toHaveValue("1194");

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-server-config.png",
    });
  });

  test("shows certificates table with cert data", async ({ page }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Certificates section should be visible
    const certSection = page
      .locator('[data-testid="settings-section"]')
      .filter({ hasText: "VPN Certificates" });
    await expect(certSection).toBeVisible();

    // Certificate names should be in the table
    await expect(page.getByText("ca-cert")).toBeVisible();
    await expect(page.getByText("ovpn-server")).toBeVisible();

    // CA badge should be visible
    await expect(certSection.getByText("CA")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-certificates.png",
    });
  });

  test("shows router not configured message when unavailable", async ({
    page,
  }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_NO_ROUTER);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should show not configured message
    await expect(
      page.getByText("MikroTik router is not configured"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-no-router.png",
    });
  });

  test("client config export buttons are visible", async ({ page }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Export section should have download and copy buttons
    await expect(
      page.getByRole("button", { name: /Download .ovpn/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Copy to Clipboard/ }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-export.png",
    });
  });

  test("save button is visible when server is configured", async ({
    page,
  }) => {
    await mockOpenVpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Save button should be visible
    await expect(page.getByTestId("save-button")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-save-button.png",
    });
  });
});
