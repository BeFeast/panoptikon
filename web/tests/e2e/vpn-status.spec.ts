import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for VPN Status page (/vpn-status).
 *
 * Validates that the MikroTik tab is only shown when the router
 * actually has WireGuard interfaces configured (#476).
 * Also validates OpenVPN tab and connected clients display (#664).
 */

// ── Mock data ────────────────────────────────────────────────

/** VPN status response with no MikroTik WireGuard interfaces. */
const MOCK_VPN_NO_MIKROTIK_WG = {
  mikrotik_available: false,
  interfaces: [],
  total_peers: 0,
  online_peers: 0,
  total_rx_bytes: 0,
  total_tx_bytes: 0,
  openvpn_clients: [],
  openvpn_enabled: false,
};

/** VPN status response with MikroTik WireGuard interfaces. */
const MOCK_VPN_WITH_MIKROTIK_WG = {
  mikrotik_available: true,
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
  openvpn_clients: [],
  openvpn_enabled: false,
};

/** VPN status response with OpenVPN enabled and connected clients. */
const MOCK_VPN_WITH_OPENVPN = {
  mikrotik_available: true,
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
      name: "OpenVPN Server",
      address: null,
      port: 1194,
      public_key: null,
      status: "up",
      peers: [
        {
          name: "ovpn-user1",
          public_key: null,
          endpoint: "AA:BB:CC:DD:EE:01",
          allowed_ips: [],
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
  openvpn_clients: [
    {
      name: "ovpn-user1",
      caller_id: "203.0.113.50",
      address: "10.8.0.2",
      uptime: "1h30m",
      encoding: "AES-256-CBC",
    },
  ],
  openvpn_enabled: true,
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

  test("hides OpenVPN tab when OpenVPN is not enabled", async ({ page }) => {
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

  test("shows OpenVPN tab with connected clients when enabled", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_OPENVPN);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // OpenVPN tab should be visible
    await expect(
      page.getByRole("tab", { name: "OpenVPN" }),
    ).toBeVisible();

    // Click OpenVPN tab
    await page.getByRole("tab", { name: "OpenVPN" }).click();

    // Verify connected clients heading
    await expect(
      page.getByText("OpenVPN Connected Clients"),
    ).toBeVisible();

    // Verify client data is shown
    await expect(page.getByText("ovpn-user1")).toBeVisible();
    await expect(page.getByText("10.8.0.2")).toBeVisible();
    await expect(page.getByText("1h30m")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-openvpn-clients.png",
    });
  });

  test("shows per-tunnel bandwidth metrics on interface cards", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should show total RX/TX
    await expect(page.getByText("Total RX")).toBeVisible();
    await expect(page.getByText("Total TX")).toBeVisible();

    // Per-tunnel bandwidth should appear on interface cards
    // The wireguard1 interface has 1MiB RX and 512KiB TX
    await expect(page.getByText("1.0 MiB")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-bandwidth-metrics.png",
    });
  });

  test("shows WireGuard peer handshake times", async ({ page }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The peer has last_handshake ~30s ago, should show "30s ago" or similar
    // Check that "Last Handshake" column header exists
    await expect(page.getByText("Last Handshake")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-handshake-times.png",
    });
  });

  test("shows vpn_type badge on interface cards", async ({ page }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_OPENVPN);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Both vpn_type badges should exist on the overview
    await expect(page.getByText("wireguard", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("openvpn", { exact: true }).first()).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-vpn-type-badges.png",
    });
  });
});
