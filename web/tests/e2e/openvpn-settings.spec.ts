import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for OpenVPN Settings page (/settings/openvpn).
 *
 * Validates that the OpenVPN settings page loads and shows
 * server configuration and client management UI (#664).
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_OVPN_OVERVIEW = {
  server: {
    enabled: true,
    port: 1194,
    protocol: "tcp",
    mode: "ip",
    cipher: "aes256-cbc",
    auth: "sha1",
    certificate: "ovpn-server-cert",
    default_profile: "default",
    require_client_certificate: false,
  },
  clients: [
    {
      id: "*1",
      name: "alice",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: "10.8.0.2",
      comment: "Alice laptop",
      disabled: false,
    },
    {
      id: "*2",
      name: "bob",
      service: "ovpn",
      profile: "default",
      local_address: null,
      remote_address: "10.8.0.3",
      comment: null,
      disabled: true,
    },
  ],
  active_connections: [
    {
      name: "alice",
      caller_id: "198.51.100.10",
      address: "10.8.0.2",
      uptime: "1h30m",
      encoding: "BF-128-CBC",
    },
  ],
  certificates: [
    {
      id: "*1",
      name: "ca-cert",
      common_name: "Panoptikon CA",
      fingerprint: "abc123",
      expires: "2028-01-01",
      expired: false,
      is_ca: true,
      has_private_key: true,
    },
    {
      id: "*2",
      name: "ovpn-server-cert",
      common_name: "ovpn.example.com",
      fingerprint: "def456",
      expires: "2027-06-15",
      expired: false,
      is_ca: false,
      has_private_key: true,
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────

async function mockOvpnOverview(page: Page, data: unknown) {
  await page.route("**/api/v1/openvpn/overview", (route) =>
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

  test("loads and displays server configuration", async ({ page }) => {
    await mockOvpnOverview(page, MOCK_OVPN_OVERVIEW);
    await page.goto("/settings/openvpn");

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings" }),
    ).toBeVisible({ timeout: 15000 });

    // Server config section should be visible
    await expect(page.getByText("Server Configuration")).toBeVisible();

    // Client accounts section should be visible
    await expect(page.getByText("Client Accounts")).toBeVisible();

    // Active connections section should be visible
    await expect(page.getByText("Active Connections")).toBeVisible();

    // Verify client data is rendered
    await expect(page.getByText("alice")).toBeVisible();
    await expect(page.getByText("bob")).toBeVisible();

    // Verify active connection shows
    await expect(page.getByText("198.51.100.10")).toBeVisible();
    await expect(page.getByText("1h30m")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings.png",
    });
  });

  test("shows Add Client dialog", async ({ page }) => {
    await mockOvpnOverview(page, MOCK_OVPN_OVERVIEW);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings" }),
    ).toBeVisible({ timeout: 15000 });

    // Click Add Client button
    await page.getByRole("button", { name: "Add Client" }).click();

    // Dialog should appear
    await expect(
      page.getByRole("heading", { name: "Add OpenVPN Client" }),
    ).toBeVisible({ timeout: 5000 });

    // Dialog should have username and password fields
    await expect(page.getByPlaceholder("client-name")).toBeVisible();
    await expect(page.getByPlaceholder("Strong password")).toBeVisible();

    // Cancel button should close dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Add OpenVPN Client" }),
    ).not.toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "tests/screenshots/openvpn-settings-dialog.png",
    });
  });

  test("displays certificates section", async ({ page }) => {
    await mockOvpnOverview(page, MOCK_OVPN_OVERVIEW);
    await page.goto("/settings/openvpn");

    await expect(
      page.getByRole("heading", { name: "OpenVPN Settings" }),
    ).toBeVisible({ timeout: 15000 });

    // Certificates section should be visible
    await expect(page.getByText("Certificates")).toBeVisible();

    // Verify certificate data
    await expect(page.getByText("ca-cert")).toBeVisible();
    await expect(page.getByText("Panoptikon CA")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/openvpn-certificates.png",
    });
  });
});
