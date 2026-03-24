import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Settings page (/settings/openvpn).
 *
 * Tests server configuration, client management, and certificate
 * listing with mocked MikroTik API responses.
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_SERVER = {
  enabled: true,
  port: 1194,
  mode: "ip",
  protocol: "tcp",
  certificate: "server-cert",
  default_profile: "default",
  cipher: "aes256-cbc",
  auth: "sha1",
  require_client_certificate: false,
};

const MOCK_CLIENTS = [
  {
    id: "*1",
    name: "alice",
    service: "ovpn",
    profile: "default",
    local_address: "10.8.0.1",
    remote_address: "10.8.0.2",
    disabled: false,
    comment: "Alice VPN",
  },
  {
    id: "*2",
    name: "bob",
    service: "ovpn",
    profile: "default",
    local_address: "",
    remote_address: "",
    disabled: true,
    comment: "",
  },
];

const MOCK_CERTIFICATES = [
  {
    id: "*1",
    name: "ca-cert",
    common_name: "Panoptikon CA",
    key_type: "rsa",
    key_size: "4096",
    trusted: true,
    ca: true,
    issuer: "Panoptikon CA",
    serial_number: "1",
    invalid_before: "2024-01-01 00:00:00",
    invalid_after: "2034-01-01 00:00:00",
    expired: false,
    has_private_key: true,
  },
  {
    id: "*2",
    name: "server-cert",
    common_name: "vpn.example.com",
    key_type: "rsa",
    key_size: "2048",
    trusted: true,
    ca: false,
    issuer: "Panoptikon CA",
    serial_number: "2",
    invalid_before: "2024-01-01 00:00:00",
    invalid_after: "2025-01-01 00:00:00",
    expired: true,
    has_private_key: true,
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
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Client created" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CLIENTS),
    });
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

test.describe("OpenVPN Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays server configuration tab with settings", async ({
    page,
  }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    // Wait for heading
    await expect(
      page.getByRole("heading", { name: "OpenVPN" }),
    ).toBeVisible({ timeout: 15000 });

    // Server tab should be active by default
    await expect(page.getByRole("tab", { name: "Server" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Clients" })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Certificates" }),
    ).toBeVisible();

    // Server configuration should be visible
    await expect(page.getByText("Server Configuration")).toBeVisible();
    await expect(page.getByText("Enabled")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save Configuration" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-server-tab.png",
    });
  });

  test("displays VPN clients in table", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Clients tab
    await page.getByRole("tab", { name: "Clients" }).click();

    // Check client table
    await expect(page.getByText("alice")).toBeVisible();
    await expect(page.getByText("bob")).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
    await expect(page.getByText("disabled")).toBeVisible();

    // Add Client button should be visible
    await expect(
      page.getByRole("button", { name: "Add Client" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-clients-tab.png",
    });
  });

  test("opens add client dialog", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN" }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: "Clients" }).click();
    await page.getByRole("button", { name: "Add Client" }).click();

    // Dialog should open
    await expect(
      page.getByRole("heading", { name: "Add VPN Client" }),
    ).toBeVisible({ timeout: 5000 });

    // Form fields should be present
    await expect(page.getByPlaceholder("vpn-user")).toBeVisible();
    await expect(page.getByPlaceholder("Client password")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-add-client-dialog.png",
    });
  });

  test("displays certificates with status badges", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Certificates tab
    await page.getByRole("tab", { name: "Certificates" }).click();

    // Check certificates
    await expect(page.getByText("ca-cert")).toBeVisible();
    await expect(page.getByText("server-cert")).toBeVisible();
    await expect(page.getByText("Panoptikon CA")).toBeVisible();

    // Status badges
    await expect(page.getByText("CA")).toBeVisible();
    await expect(page.getByText("valid")).toBeVisible();
    await expect(page.getByText("expired")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates-tab.png",
    });
  });

  test("shows error state when MikroTik is unavailable", async ({ page }) => {
    // Mock with error responses
    await page.route("**/api/v1/openvpn/server", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "service_unavailable",
          message: "MikroTik integration is not enabled",
        }),
      }),
    );
    await page.route("**/api/v1/openvpn/clients", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "service_unavailable",
          message: "MikroTik integration is not enabled",
        }),
      }),
    );
    await page.route("**/api/v1/openvpn/certificates", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "service_unavailable",
          message: "MikroTik integration is not enabled",
        }),
      }),
    );

    await page.goto("/settings/openvpn/");

    await expect(
      page.getByRole("heading", { name: "OpenVPN" }),
    ).toBeVisible({ timeout: 15000 });

    // Should show error message with router settings link
    await expect(page.getByText("Router Settings")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-unavailable.png",
    });
  });
});
