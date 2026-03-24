import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for VPN Status page (/vpn-status).
 *
 * Validates that the MikroTik tab is only shown when the router
 * actually has WireGuard interfaces configured (#476), and that
 * the OpenVPN tab is shown when OpenVPN is enabled (#664).
 */

// ── Mock data ────────────────────────────────────────────────

/** VPN status response with no MikroTik WireGuard interfaces. */
const MOCK_VPN_NO_MIKROTIK_WG = {
  mikrotik_available: false,
  openvpn_available: false,
  interfaces: [],
  total_peers: 0,
  online_peers: 0,
  total_rx_bytes: 0,
  total_tx_bytes: 0,
};

/** VPN status response with MikroTik WireGuard interfaces. */
const MOCK_VPN_WITH_MIKROTIK_WG = {
  mikrotik_available: true,
  openvpn_available: false,
  interfaces: [
    {
      name: "wireguard1",
      address: null,
      port: 13231,
      public_key: "ABCDEF1234567890ABCDEF1234567890ABCDEFGH=",
      status: "up",
      peers: [
        {
          name: "peer-1",
          public_key: "PEER1KEY1234567890ABCDEF1234567890ABCDE=",
          endpoint: "203.0.113.1:51820",
          allowed_ips: ["10.0.0.2/32"],
          last_handshake: Math.floor(Date.now() / 1000) - 30,
          rx_bytes: 1048576,
          tx_bytes: 524288,
          connectivity: "online",
        },
      ],
      peers_online: 1,
      peers_total: 1,
      source: "mikrotik",
      vpn_type: "wireguard",
    },
  ],
  total_peers: 1,
  online_peers: 1,
  total_rx_bytes: 1048576,
  total_tx_bytes: 524288,
};

/** VPN status response with OpenVPN enabled and connected clients. */
const MOCK_VPN_WITH_OPENVPN = {
  mikrotik_available: false,
  openvpn_available: true,
  interfaces: [
    {
      name: "ovpn-server",
      address: null,
      port: 1194,
      public_key: null,
      status: "up",
      peers: [
        {
          name: "client-alice",
          public_key: null,
          endpoint: "198.51.100.10:54321",
          allowed_ips: ["10.8.0.2"],
          last_handshake: null,
          rx_bytes: null,
          tx_bytes: null,
          connectivity: "online",
        },
      ],
      peers_online: 1,
      peers_total: 1,
      source: "mikrotik",
      vpn_type: "openvpn",
    },
  ],
  total_peers: 1,
  online_peers: 1,
  total_rx_bytes: 0,
  total_tx_bytes: 0,
};

/** VPN status with both WireGuard and OpenVPN. */
const MOCK_VPN_WITH_BOTH = {
  mikrotik_available: true,
  openvpn_available: true,
  interfaces: [
    {
      name: "wireguard1",
      address: null,
      port: 13231,
      public_key: "ABCDEF1234567890ABCDEF1234567890ABCDEFGH=",
      status: "up",
      peers: [
        {
          name: "peer-1",
          public_key: "PEER1KEY1234567890ABCDEF1234567890ABCDE=",
          endpoint: "203.0.113.1:51820",
          allowed_ips: ["10.0.0.2/32"],
          last_handshake: Math.floor(Date.now() / 1000) - 30,
          rx_bytes: 1048576,
          tx_bytes: 524288,
          connectivity: "online",
        },
      ],
      peers_online: 1,
      peers_total: 1,
      source: "mikrotik",
      vpn_type: "wireguard",
    },
    {
      name: "ovpn-server",
      address: null,
      port: 1194,
      public_key: null,
      status: "up",
      peers: [
        {
          name: "client-bob",
          public_key: null,
          endpoint: "198.51.100.20:12345",
          allowed_ips: ["10.8.0.3"],
          last_handshake: null,
          rx_bytes: null,
          tx_bytes: null,
          connectivity: "online",
        },
      ],
      peers_online: 1,
      peers_total: 1,
      source: "mikrotik",
      vpn_type: "openvpn",
    },
  ],
  total_peers: 2,
  online_peers: 2,
  total_rx_bytes: 1048576,
  total_tx_bytes: 524288,
};

// ── Helpers ──────────────────────────────────────────────────

async function mockVpnStatus(page: Page, data: unknown) {
  await page.route("**/api/v1/vpn-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    }),
  );
}

// ── Tests ────────────────────────────────────────────────────

test.describe("VPN Status Page — MikroTik tab visibility (#476)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("hides MikroTik tab when no WireGuard interfaces exist", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_NO_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    // Wait for page to load — heading should be visible
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Overview tab should be visible
    await expect(
      page.getByRole("tab", { name: "Overview" }),
    ).toBeVisible();

    // MikroTik tab should NOT be visible
    await expect(
      page.getByRole("tab", { name: "MikroTik" }),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-no-mikrotik-tab.png",
    });
  });

  test("shows MikroTik tab when WireGuard interfaces exist", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    // Wait for page to load
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // MikroTik tab should be visible
    await expect(
      page.getByRole("tab", { name: "MikroTik" }),
    ).toBeVisible();

    // Click MikroTik tab and verify interface data is shown
    await page.getByRole("tab", { name: "MikroTik" }).click();
    await expect(page.getByText("wireguard1")).toBeVisible();
    await expect(page.getByText("peer-1")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-with-mikrotik-tab.png",
    });
  });
});

test.describe("VPN Status Page — OpenVPN tab (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows OpenVPN tab when OpenVPN is enabled", async ({ page }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_OPENVPN);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // OpenVPN tab should be visible
    await expect(
      page.getByRole("tab", { name: "OpenVPN" }),
    ).toBeVisible();

    // Click OpenVPN tab and verify client data is shown
    await page.getByRole("tab", { name: "OpenVPN" }).click();
    await expect(page.getByText("ovpn-server")).toBeVisible();
    await expect(page.getByText("client-alice")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-openvpn-tab.png",
    });
  });

  test("hides OpenVPN tab when OpenVPN is not available", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // OpenVPN tab should NOT be visible
    await expect(
      page.getByRole("tab", { name: "OpenVPN" }),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-no-openvpn-tab.png",
    });
  });

  test("shows both MikroTik and OpenVPN tabs when both are available", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_BOTH);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Both tabs should be visible
    await expect(
      page.getByRole("tab", { name: "MikroTik" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "OpenVPN" }),
    ).toBeVisible();

    // Verify overview shows both protocols
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("MikroTik WireGuard")).toBeVisible();
    await expect(page.getByText("OpenVPN")).toBeVisible();

    // Switch to OpenVPN tab and verify data
    await page.getByRole("tab", { name: "OpenVPN" }).click();
    await expect(page.getByText("client-bob")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-both-tabs.png",
    });
  });
});
