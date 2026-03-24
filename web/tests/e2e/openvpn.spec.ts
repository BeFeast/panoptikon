import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Management settings page (/settings/openvpn).
 *
 * Validates server config display, client account listing, certificate listing,
 * and client config export (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_SERVER = {
  available: true,
  enabled: true,
  port: 1194,
  mode: "ip",
  protocol: "tcp",
  certificate: "server-cert",
  cipher: "aes256-cbc",
  auth: "sha1",
  default_profile: "default",
  require_client_certificate: false,
  redirect_gateway: null,
};

const MOCK_OVPN_SERVER_UNAVAILABLE = {
  available: false,
  enabled: false,
  port: null,
  mode: null,
  protocol: null,
  certificate: null,
  cipher: null,
  auth: null,
  default_profile: null,
  require_client_certificate: false,
  redirect_gateway: null,
};

const MOCK_OVPN_CLIENTS = {
  available: true,
  clients: [
    {
      id: "*1",
      name: "vpn-user-1",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: "10.10.0.5",
      disabled: false,
      comment: "Test user",
    },
    {
      id: "*2",
      name: "vpn-user-2",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: null,
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
      name: "ca-cert",
      common_name: "Panoptikon CA",
      key_type: "rsa",
      key_size: "2048",
      days_valid: "3650",
      trusted: true,
      ca: true,
      issuer: "Panoptikon CA",
      invalid_before: "Jan/01/2024",
      invalid_after: "Jan/01/2034",
      has_private_key: true,
      expired: false,
      fingerprint: "abc123",
    },
    {
      id: "*2",
      name: "server-cert",
      common_name: "vpn.example.com",
      key_type: "rsa",
      key_size: "2048",
      days_valid: "365",
      trusted: false,
      ca: false,
      issuer: "Panoptikon CA",
      invalid_before: "Jan/01/2024",
      invalid_after: "Jan/01/2025",
      has_private_key: true,
      expired: false,
      fingerprint: "def456",
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOpenVpnApis(
  page: Page,
  opts?: {
    server?: unknown;
    clients?: unknown;
    certificates?: unknown;
  },
) {
  await page.route("**/api/v1/openvpn/server", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.server ?? MOCK_OVPN_SERVER),
    }),
  );
  await page.route("**/api/v1/openvpn/clients", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts?.clients ?? MOCK_OVPN_CLIENTS),
      });
    }
    return route.fulfill({ status: 201 });
  });
  await page.route("**/api/v1/openvpn/certificates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.certificates ?? MOCK_CERTIFICATES),
    }),
  );
  await page.route("**/api/v1/openvpn/export/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        config: "client\ndev tun\nproto tcp\nremote 10.0.0.1 1194\n",
        filename: "test.ovpn",
      }),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Management Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows unavailable message when MikroTik is not configured", async ({
    page,
  }) => {
    await mockOpenVpnApis(page, {
      server: MOCK_OVPN_SERVER_UNAVAILABLE,
      clients: { available: false, clients: [] },
      certificates: { available: false, certificates: [] },
    });
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByText("MikroTik Not Configured"),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/openvpn-unavailable.png",
    });
  });

  test("displays server configuration details", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Server config card should show details
    await expect(page.getByText("Server Configuration")).toBeVisible();
    await expect(page.getByText("Enabled")).toBeVisible();
    await expect(page.getByText("1194")).toBeVisible();
    await expect(page.getByText("tcp")).toBeVisible();
    await expect(page.getByText("aes256-cbc")).toBeVisible();
    await expect(page.getByText("server-cert")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-server-config.png",
    });
  });

  test("lists client accounts with status badges", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Client list should show both users
    await expect(page.getByText("vpn-user-1")).toBeVisible();
    await expect(page.getByText("vpn-user-2")).toBeVisible();

    // Status badges
    await expect(page.getByText("active")).toBeVisible();
    await expect(page.getByText("disabled")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-client-list.png",
    });
  });

  test("displays router certificates", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Certificate table
    await expect(page.getByText("Router Certificates")).toBeVisible();
    await expect(page.getByText("ca-cert")).toBeVisible();
    await expect(page.getByText("Panoptikon CA")).toBeVisible();
    await expect(page.getByText("CA")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates.png",
    });
  });

  test("add client dialog opens and has required fields", async ({
    page,
  }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Management" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Client button
    await page.getByRole("button", { name: "Add Client" }).click();

    // Dialog should appear with fields
    await expect(page.getByText("Add OpenVPN Client")).toBeVisible();
    await expect(page.locator("#client-name")).toBeVisible();
    await expect(page.locator("#client-password")).toBeVisible();

    // Create button should be disabled without input
    await expect(
      page.getByRole("button", { name: "Create Client" }),
    ).toBeDisabled();

    await page.screenshot({
      path: "tests/screenshots/openvpn-add-client-dialog.png",
    });
  });
});
