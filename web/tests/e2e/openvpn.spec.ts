import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN management page (/openvpn).
 *
 * Validates server configuration, client management, and certificate listing (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_SERVER = {
  available: true,
  enabled: true,
  port: 1194,
  mode: "ip",
  protocol: "tcp",
  certificate: "server-cert",
  default_profile: "default",
  cipher: "aes256-cbc",
  auth: "sha1",
  netmask: "255.255.255.0",
  require_client_certificate: false,
};

const MOCK_OVPN_SERVER_UNAVAILABLE = {
  available: false,
  enabled: false,
  port: null,
  mode: null,
  protocol: null,
  certificate: null,
  default_profile: null,
  cipher: null,
  auth: null,
  netmask: null,
  require_client_certificate: false,
};

const MOCK_CLIENTS = [
  {
    id: "*1",
    name: "john-laptop",
    service: "ovpn",
    profile: "default",
    local_address: null,
    remote_address: "10.8.0.2",
    disabled: false,
    comment: "John's work laptop",
  },
  {
    id: "*2",
    name: "jane-phone",
    service: "ovpn",
    profile: "default",
    local_address: null,
    remote_address: "10.8.0.3",
    disabled: true,
    comment: null,
  },
];

const MOCK_CERTIFICATES = [
  {
    id: "*1",
    name: "server-cert",
    common_name: "panoptikon-ovpn",
    fingerprint: "abcdef1234567890",
    key_type: "rsa",
    key_size: "2048",
    days_valid: "3650",
    trusted: true,
    ca: false,
    issuer: "panoptikon-ca",
    serial_number: "001",
    invalid_before: "2024-01-01",
    invalid_after: "2034-01-01",
    expires_after: "2920d",
    has_private_key: true,
    authority: false,
  },
  {
    id: "*2",
    name: "panoptikon-ca",
    common_name: "Panoptikon CA",
    fingerprint: "fedcba0987654321",
    key_type: "rsa",
    key_size: "4096",
    days_valid: "7300",
    trusted: true,
    ca: true,
    issuer: null,
    serial_number: "000",
    invalid_before: "2024-01-01",
    invalid_after: "2044-01-01",
    expires_after: "6570d",
    has_private_key: true,
    authority: true,
  },
];

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
        body: JSON.stringify(opts?.clients ?? MOCK_CLIENTS),
      });
    }
    return route.fulfill({ status: 201 });
  });
  await page.route("**/api/v1/certificates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts?.certificates ?? MOCK_CERTIFICATES),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("OpenVPN Management Page (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("displays page header and summary cards", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards
    await expect(page.getByText("Enabled")).toBeVisible();
    await expect(page.getByText("2")).toBeVisible(); // 2 clients

    await page.screenshot({
      path: "tests/screenshots/openvpn-page.png",
      fullPage: true,
    });
  });

  test("shows server configuration form", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Server Config tab should be active by default
    await expect(page.getByText("OpenVPN Server Configuration")).toBeVisible();
    await expect(page.getByText("Save Configuration")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-server-config.png",
    });
  });

  test("shows unavailable message when MikroTik not configured", async ({
    page,
  }) => {
    await mockOpenVpnApis(page, { server: MOCK_OVPN_SERVER_UNAVAILABLE });
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Unavailable")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-unavailable.png",
    });
  });

  test("lists OpenVPN clients in Clients tab", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Clients tab
    await page.getByRole("tab", { name: "Clients" }).click();
    await expect(page.getByText("john-laptop")).toBeVisible();
    await expect(page.getByText("jane-phone")).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
    await expect(page.getByText("disabled")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-clients-tab.png",
    });
  });

  test("opens add client dialog", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Clients tab
    await page.getByRole("tab", { name: "Clients" }).click();

    // Click Add Client button
    await page.getByRole("button", { name: "Add Client" }).click();
    await expect(page.getByText("Add OpenVPN Client")).toBeVisible();
    await expect(page.getByPlaceholder("client-username")).toBeVisible();
    await expect(page.getByPlaceholder("Strong password")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-add-client-dialog.png",
    });
  });

  test("lists certificates in Certificates tab", async ({ page }) => {
    await mockOpenVpnApis(page);
    await page.goto("/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Switch to Certificates tab
    await page.getByRole("tab", { name: "Certificates" }).click();
    await expect(page.getByText("server-cert")).toBeVisible();
    await expect(page.getByText("panoptikon-ca")).toBeVisible();
    await expect(page.getByText("CA")).toBeVisible();
    await expect(page.getByText("Leaf")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates-tab.png",
    });
  });
});
