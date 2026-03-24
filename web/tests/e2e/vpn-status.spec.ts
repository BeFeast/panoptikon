import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for VPN Status page (/vpn-status).
 *
 * Validates tab visibility, OpenVPN integration, per-tunnel bandwidth,
 * and WireGuard handshake times (#476, #664).
 */

// ── Mock data ────────────────────────────────────────────────

/** VPN status response with no MikroTik interfaces. */
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
        {
          name: "peer-2",
          public_key: "PEER2KEY1234567890ABCDEF1234567890ABCDE=",
          endpoint: "203.0.113.2:51820",
          allowed_ips: ["10.0.0.3/32"],
          last_handshake: Math.floor(Date.now() / 1000) - 600,
          rx_bytes: 2097152,
          tx_bytes: 1048576,
          connectivity: "offline",
        },
      ],
      peers_online: 1,
      peers_total: 2,
      source: "mikrotik",
      vpn_type: "wireguard",
      uptime: null,
    },
  ],
  total_peers: 2,
  online_peers: 1,
  total_rx_bytes: 3145728,
  total_tx_bytes: 1572864,
};

/** VPN status response with OpenVPN connected clients. */
const MOCK_VPN_WITH_OPENVPN = {
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
      uptime: null,
    },
    {
      name: "ovpn-server",
      address: null,
      port: 1194,
      public_key: null,
      status: "up",
      peers: [
        {
          name: "vpn-user-1",
          public_key: null,
          endpoint: "192.168.1.100",
          allowed_ips: ["10.10.0.5"],
          last_handshake: Math.floor(Date.now() / 1000),
          rx_bytes: null,
          tx_bytes: null,
          connectivity: "online",
        },
      ],
      peers_online: 1,
      peers_total: 1,
      source: "mikrotik",
      vpn_type: "openvpn",
      uptime: null,
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

test.describe("VPN Status Page — OpenVPN integration (#664)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows OpenVPN tab when OpenVPN is available", async ({ page }) => {
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
    await expect(page.getByText("ovpn-server")).toBeVisible();
    await expect(page.getByText("vpn-user-1")).toBeVisible();

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
  });

  test("displays per-tunnel bandwidth metrics", async ({ page }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should show total RX/TX
    await expect(page.getByText("Total RX")).toBeVisible();
    await expect(page.getByText("Total TX")).toBeVisible();

    // Click MikroTik tab to see per-peer data
    await page.getByRole("tab", { name: "MikroTik" }).click();

    // Peer bandwidth data should be displayed in the table
    // peer-1 has 1 MiB RX, 512 KiB TX
    await expect(page.getByText("1.0 MiB")).toBeVisible();
    await expect(page.getByText("512.0 KiB")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-bandwidth-metrics.png",
    });
  });

  test("displays WireGuard peer handshake times", async ({ page }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_MIKROTIK_WG);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click MikroTik tab
    await page.getByRole("tab", { name: "MikroTik" }).click();

    // Last Handshake column header should be visible
    await expect(page.getByText("Last Handshake")).toBeVisible();

    // peer-1 handshake was 30s ago — should show "30s ago" or similar
    await expect(page.getByText(/\d+s ago/)).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-handshake-times.png",
    });
  });

  test("overview shows both WireGuard and OpenVPN summaries", async ({
    page,
  }) => {
    await mockVpnStatus(page, MOCK_VPN_WITH_OPENVPN);
    await page.goto("/vpn-status/");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click Overview tab
    await page.getByRole("tab", { name: "Overview" }).click();

    // Both WireGuard and OpenVPN summaries should appear
    await expect(page.getByText("WireGuard")).toBeVisible();
    await expect(page.getByText("OpenVPN")).toBeVisible();

    // Peers Online summary card should show 2
    await expect(page.getByText("of 2 total")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/vpn-status-overview-both.png",
    });
  });
});
