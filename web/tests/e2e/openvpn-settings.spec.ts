import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Settings page (/settings/openvpn).
 *
 * Validates server configuration form, client account table,
 * and certificate listing (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_SERVER = {
  enabled: true,
  port: 1194,
  default_profile: "default",
  protocol: "tcp",
  cipher: "aes256-cbc",
  auth: "sha1",
  certificate: "server-cert",
  require_client_certificate: false,
  mode: "ip",
  netmask: "255.255.255.0",
};

const MOCK_OVPN_CLIENTS = [
  {
    id: "*1",
    name: "vpn-user-1",
    service: "ovpn",
    profile: "default",
    local_address: null,
    remote_address: "10.8.0.2",
    comment: "Test VPN user",
    disabled: false,
  },
  {
    id: "*2",
    name: "vpn-user-2",
    service: "ovpn",
    profile: "default",
    local_address: null,
    remote_address: "10.8.0.3",
    comment: null,
    disabled: true,
  },
];

const MOCK_CERTIFICATES = [
  {
    id: "*1",
    name: "ca-cert",
    common_name: "Panoptikon CA",
    key_type: "rsa",
    key_size: "2048",
    fingerprint: "abc123",
    invalid_before: "2024-01-01",
    invalid_after: "2034-01-01",
    has_private_key: true,
    ca: true,
    trusted: true,
    expired: false,
    authority: true,
    subject_alt_name: null,
  },
  {
    id: "*2",
    name: "server-cert",
    common_name: "vpn.example.com",
    key_type: "rsa",
    key_size: "2048",
    fingerprint: "def456",
    invalid_before: "2024-01-01",
    invalid_after: "2026-01-01",
    has_private_key: true,
    ca: false,
    trusted: true,
    expired: false,
    authority: false,
    subject_alt_name: "DNS:vpn.example.com",
  },
];

// ── Helpers ──────────────────────────────────────────────────

async function mockOpenVpnApis(page: Page) {
  await page.route("**/api/v1/openvpn/server", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_OVPN_SERVER),
    }),
  );
  await page.route("**/api/v1/openvpn/clients", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_OVPN_CLIENTS),
      });
    }
    return route.fulfill({ status: 201 });
  });
  await page.route("**/api/v1/openvpn/certificates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CERTIFICATES),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Settings Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays server configuration form with loaded values", async ({
    page,
  }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Server", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server configuration card should be visible
    await expect(page.getByText("Server Configuration")).toBeVisible();

    // Save button should be visible
    await expect(
      page.getByRole("button", { name: "Save Configuration" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-server.png",
    });
  });

  test("shows client accounts table", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Server", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Client table should show both users
    await expect(page.getByText("vpn-user-1")).toBeVisible();
    await expect(page.getByText("vpn-user-2")).toBeVisible();

    // Status badges
    await expect(page.getByText("enabled")).toBeVisible();
    await expect(page.getByText("disabled")).toBeVisible();

    // Add Client button should be visible
    await expect(
      page.getByRole("button", { name: "Add Client" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-clients.png",
    });
  });

  test("shows certificates table", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Server", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Certificates should be shown
    await expect(page.getByText("Panoptikon CA")).toBeVisible();
    await expect(page.getByText("vpn.example.com")).toBeVisible();

    // CA badge should be visible in the certificates table
    await expect(
      page.locator("table").last().getByText("CA", { exact: true }).first(),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-certificates.png",
    });
  });

  test("shows MikroTik not configured message when API unavailable", async ({
    page,
  }) => {
    await page.route("**/api/v1/openvpn/server", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.route("**/api/v1/openvpn/clients", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.route("**/api/v1/openvpn/certificates", (route) =>
      route.fulfill({ status: 503 }),
    );
    await page.goto("/settings/openvpn");

    await expect(
      page.getByText("MikroTik Not Configured"),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-not-configured.png",
    });
  });
});
