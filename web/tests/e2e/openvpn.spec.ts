import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Management page (/openvpn).
 *
 * Validates server config display, client listing, certificate listing,
 * and client config export (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVERVIEW = {
  mikrotik_available: true,
  server: {
    enabled: true,
    port: 1194,
    mode: "ip",
    protocol: "tcp",
    certificate: "ovpn-server",
    default_profile: "default-encryption",
    auth: "sha1",
    cipher: "aes256-cbc",
    netmask: "24",
    max_mtu: 1500,
    require_client_certificate: false,
  },
  clients: [
    {
      id: "*1",
      name: "vpn-user1",
      service: "ovpn",
      profile: "default-encryption",
      local_address: "10.8.0.1",
      remote_address: "10.8.0.2",
      disabled: false,
      comment: null,
    },
    {
      id: "*2",
      name: "vpn-user2",
      service: "ovpn",
      profile: "default-encryption",
      local_address: "10.8.0.1",
      remote_address: "10.8.0.3",
      disabled: true,
      comment: "Test user",
    },
  ],
  certificates: [
    {
      id: "*1",
      name: "ca-cert",
      common_name: "Panoptikon CA",
      fingerprint: "abc123",
      key_size: "4096",
      days_valid: "3650",
      invalid_before: "2024-01-01",
      invalid_after: "2034-01-01",
      ca: true,
      has_private_key: true,
      expired: false,
      trusted: true,
    },
    {
      id: "*2",
      name: "ovpn-server",
      common_name: "ovpn-server",
      fingerprint: "def456",
      key_size: "2048",
      days_valid: "365",
      invalid_before: "2024-01-01",
      invalid_after: "2025-01-01",
      ca: false,
      has_private_key: true,
      expired: false,
      trusted: false,
    },
  ],
};

const MOCK_OVERVIEW_UNAVAILABLE = {
  mikrotik_available: false,
  server: null,
  clients: [],
  certificates: [],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOpenVpnOverview(page: Page, data: unknown) {
  await page.route("**/api/v1/openvpn/overview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Management Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("page loads with correct heading and tabs", async ({ page }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Tabs should be visible
    await expect(page.getByRole("tab", { name: "Server Config" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Clients" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Certificates" })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-page.png",
    });
  });

  test("shows server configuration details", async ({ page }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server config tab is default — check server info
    await expect(page.getByText("Server Configuration")).toBeVisible();
    await expect(page.getByText("ovpn-server")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-server-config.png",
    });
  });

  test("clients tab shows VPN users", async ({ page }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Clients tab
    await page.getByRole("tab", { name: "Clients" }).click();

    // Verify client data
    await expect(page.getByText("vpn-user1")).toBeVisible();
    await expect(page.getByText("vpn-user2")).toBeVisible();
    await expect(page.getByText("10.8.0.2")).toBeVisible();
    await expect(page.getByText("10.8.0.3")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-clients.png",
    });
  });

  test("certificates tab shows PKI certificates", async ({ page }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Certificates tab
    await page.getByRole("tab", { name: "Certificates" }).click();

    // Verify certificate data
    await expect(page.getByText("ca-cert")).toBeVisible();
    await expect(page.getByText("Panoptikon CA")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates.png",
    });
  });

  test("shows unavailable state when MikroTik not configured", async ({
    page,
  }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW_UNAVAILABLE);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText("MikroTik router is not configured"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-unavailable.png",
    });
  });

  test("summary cards show correct values", async ({ page }) => {
    await mockOpenVpnOverview(page, MOCK_OVERVIEW);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Check summary cards
    await expect(page.getByText("Enabled")).toBeVisible();
    await expect(page.getByText("TCP")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-summary.png",
    });
  });
});
