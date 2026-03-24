import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for the OpenVPN Settings page (/settings/openvpn).
 *
 * Validates server configuration form, certificate table, and client
 * config export functionality.
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OPENVPN_STATUS_NO_MIKROTIK = {
  mikrotik_available: false,
  settings: null,
  certificates: [],
};

const MOCK_OPENVPN_STATUS = {
  mikrotik_available: true,
  settings: {
    mikrotik_available: true,
    enabled: true,
    port: 1194,
    default_profile: "default",
    certificate: "server-cert",
    auth: "sha1",
    cipher: "aes256-cbc",
    protocol: "tcp",
    require_client_certificate: false,
    mode: "ip",
  },
  certificates: [],
};

const MOCK_OPENVPN_STATUS_WITH_CERTS = {
  mikrotik_available: true,
  settings: {
    mikrotik_available: true,
    enabled: true,
    port: 1194,
    default_profile: "default",
    certificate: "server-cert",
    auth: "sha1",
    cipher: "aes256-cbc",
    protocol: "tcp",
    require_client_certificate: false,
    mode: "ip",
  },
  certificates: [
    {
      name: "ca-cert",
      common_name: "Panoptikon Root",
      key_type: "rsa",
      key_size: "4096",
      days_valid: "3650",
      fingerprint: "AA:BB:CC:DD",
      ca: true,
      has_private_key: true,
      trusted: true,
      invalid_before: "2024-01-01",
      invalid_after: "2034-01-01",
      expired: false,
      revoked: false,
      serial_number: "1",
    },
    {
      name: "server-cert",
      common_name: "vpn.example.com",
      key_type: "rsa",
      key_size: "2048",
      days_valid: "365",
      fingerprint: "EE:FF:00:11",
      ca: false,
      has_private_key: true,
      trusted: true,
      invalid_before: "2024-06-01",
      invalid_after: "2025-06-01",
      expired: false,
      revoked: false,
      serial_number: "2",
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOpenvpnStatus(page: Page, data: unknown) {
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

  test("shows MikroTik not configured message when unavailable", async ({
    page,
  }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS_NO_MIKROTIK);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText("MikroTik integration is not configured"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-no-mikrotik.png",
    });
  });

  test("shows server configuration form when MikroTik is available", async ({
    page,
  }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server config section should be visible
    await expect(page.getByText("OpenVPN Server")).toBeVisible();

    // Form fields should be populated
    await expect(page.locator("#ovpn-port")).toHaveValue("1194");
    await expect(page.locator("#ovpn-enabled")).toBeChecked();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-form.png",
    });
  });

  test("shows client config export section", async ({ page }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Export section should be visible
    await expect(page.getByText("Client Configuration")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export .ovpn Config/i }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-export.png",
    });
  });

  test("shows certificates table with cert data", async ({ page }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS_WITH_CERTS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Certificates section should be visible
    const certSection = page
      .locator('[data-testid="settings-section"]')
      .filter({ hasText: "VPN Certificates" });
    await expect(certSection).toBeVisible();

    // Verify cert names are visible in the table
    await expect(certSection.getByRole("cell", { name: "ca-cert" })).toBeVisible();
    await expect(
      certSection.getByRole("cell", { name: "vpn.example.com" }),
    ).toBeVisible();

    // Verify CA badge is shown — use data-cert-type attribute to target specifically
    await expect(
      certSection.locator("[data-cert-type='ca']"),
    ).toBeVisible();

    // Verify Leaf badge for server cert
    await expect(
      certSection.locator("[data-cert-type='leaf']"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-certificates.png",
    });
  });

  test("shows no certificates message when empty", async ({ page }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // No certs message
    await expect(
      page.getByText("No certificates found on the router"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-no-certs.png",
    });
  });

  test("save button is visible and functional", async ({ page }) => {
    await mockOpenvpnStatus(page, MOCK_OPENVPN_STATUS);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Mock the PATCH endpoint
    await page.route("**/api/v1/openvpn/server", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.fallback();
    });

    const saveButton = page.getByTestId("save-button");
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // After save, button should show "Saved" text briefly
    await expect(saveButton).toContainText("Saved", { timeout: 5000 });

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-save.png",
    });
  });
});
