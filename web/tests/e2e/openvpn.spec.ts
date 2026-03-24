import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN management page (/openvpn).
 *
 * Validates page load, tab structure, server config display,
 * client table, and certificate listing (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_SERVER = {
  available: true,
  enabled: true,
  port: 1194,
  mode: "ip",
  protocol: "tcp",
  certificate: "ovpn-server-cert",
  default_profile: "default",
  cipher: "aes256-cbc",
  auth: "sha1",
  require_client_certificate: false,
};

const MOCK_SERVER_UNAVAILABLE = {
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
};

const MOCK_CLIENTS = {
  available: true,
  clients: [
    {
      id: "*1",
      name: "vpn-user1",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: "10.8.0.2",
      disabled: false,
      comment: "Test user",
    },
    {
      id: "*2",
      name: "vpn-user2",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: "10.8.0.3",
      disabled: true,
      comment: null,
    },
  ],
};

const MOCK_CERTIFICATES = {
  available: true,
  certificates: [
    {
      id: "*1",
      name: "ovpn-ca",
      common_name: "Panoptikon CA",
      issuer: "Panoptikon CA",
      key_size: "4096",
      days_valid: "3650",
      trusted: true,
      ca: true,
      has_private_key: true,
      invalid_before: "2024-01-01",
      invalid_after: "2034-01-01",
      expires_after: "3285d",
      fingerprint: "abcdef1234567890",
    },
    {
      id: "*2",
      name: "ovpn-server-cert",
      common_name: "server.example.com",
      issuer: "Panoptikon CA",
      key_size: "2048",
      days_valid: "365",
      trusted: true,
      ca: false,
      has_private_key: true,
      invalid_before: "2025-01-01",
      invalid_after: "2026-01-01",
      expires_after: "282d",
      fingerprint: "fedcba9876543210",
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOpenvpnApis(
  page: Page,
  server: unknown,
  clients: unknown,
  certificates: unknown,
) {
  await page.route("**/api/v1/openvpn/server", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(server),
    }),
  );
  await page.route("**/api/v1/openvpn/clients", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(clients),
      });
    }
    return route.continue();
  });
  await page.route("**/api/v1/openvpn/certificates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(certificates),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Management Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads and shows server configuration", async ({ page }) => {
    await mockOpenvpnApis(page, MOCK_SERVER, MOCK_CLIENTS, MOCK_CERTIFICATES);
    await page.goto("/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server tab should be active by default
    await expect(page.getByText("OpenVPN Server Configuration")).toBeVisible();

    // Check server config details are displayed
    await expect(page.getByText("1194")).toBeVisible();
    await expect(page.getByText("tcp")).toBeVisible();
    await expect(page.getByText("aes256-cbc")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-server.png",
    });
  });

  test("shows unavailable message when MikroTik not configured", async ({
    page,
  }) => {
    await mockOpenvpnApis(
      page,
      MOCK_SERVER_UNAVAILABLE,
      { available: false, clients: [] },
      { available: false, certificates: [] },
    );
    await page.goto("/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText("MikroTik router is not configured"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-unavailable.png",
    });
  });

  test("clients tab shows PPP secrets with export and delete", async ({
    page,
  }) => {
    await mockOpenvpnApis(page, MOCK_SERVER, MOCK_CLIENTS, MOCK_CERTIFICATES);
    await page.goto("/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to clients tab
    await page.getByRole("tab", { name: "Clients" }).click();

    // Should show both clients
    await expect(page.getByText("vpn-user1")).toBeVisible();
    await expect(page.getByText("vpn-user2")).toBeVisible();

    // User1 should show active badge
    await expect(page.getByText("active")).toBeVisible();
    // User2 should show disabled badge
    await expect(page.getByText("disabled")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-clients.png",
    });
  });

  test("certificates tab shows router certificates", async ({ page }) => {
    await mockOpenvpnApis(page, MOCK_SERVER, MOCK_CLIENTS, MOCK_CERTIFICATES);
    await page.goto("/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to certificates tab
    await page.getByRole("tab", { name: "Certificates" }).click();

    // Should show certificates
    await expect(page.getByText("ovpn-ca")).toBeVisible();
    await expect(page.getByText("Panoptikon CA")).toBeVisible();
    await expect(page.getByText("ovpn-server-cert")).toBeVisible();

    // CA certificate should have CA badge
    const caBadges = page.getByText("CA", { exact: true });
    await expect(caBadges.first()).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates.png",
    });
  });
});
