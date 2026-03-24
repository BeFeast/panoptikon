import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for card border visual fix (#656).
 *
 * Verifies that Card components on VPN Status, QoS, and DNS Logs pages
 * render with clean rounded corners — no bracket/parenthesis-shaped
 * border artifacts caused by unclipped ::before pseudo-elements.
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_VPN_STATUS = {
  mikrotik_available: true,
  interfaces: [
    {
      name: "wireguard1",
      address: null,
      port: 13231,
      public_key: "TESTKEY1234567890ABCDEF1234567890ABCDEFGH=",
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
    },
  ],
  total_peers: 1,
  online_peers: 1,
  total_rx_bytes: 1048576,
  total_tx_bytes: 524288,
};

const MOCK_QOS_SUMMARY = {
  mikrotik_available: false,
  mikrotik_simple_queue_count: 0,
  mikrotik_queue_tree_count: 0,
};

const MOCK_DNS_STATS = {
  total_queries: 100,
  total_blocked: 5,
  unique_domains: 42,
  unique_clients: 3,
  top_queried: [],
  top_blocked: [],
  device_stats: [],
};

const MOCK_DNS_LOG = {
  entries: [],
  total: 0,
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Verify that all Card components on the current page have overflow:hidden
 * and no visible ::before pseudo-element with a gradient background.
 */
async function verifyCardBorders(page: Page): Promise<number> {
  // Find all Card elements — they are divs with rounded-xl, border, and
  // specific card styling. Use a broad selector and check overflow.
  const cardCount = await page.evaluate(() => {
    // Card components render as div elements with rounded border
    const candidates = document.querySelectorAll("div");
    let count = 0;
    for (const el of candidates) {
      const style = getComputedStyle(el);
      const hasRoundedBorder =
        style.borderRadius.includes("12px") || // rounded-xl = 0.75rem = 12px
        style.borderRadius.includes("0.75rem");
      const hasBorder = style.borderStyle === "solid" && style.borderWidth !== "0px";

      if (hasRoundedBorder && hasBorder) {
        count++;
        // Verify overflow is hidden (the fix)
        const overflow = style.overflow;
        if (overflow !== "hidden") {
          throw new Error(
            `Card element has overflow: ${overflow} instead of hidden. ` +
              `Text: "${el.textContent?.slice(0, 50)}"`
          );
        }

        // Verify ::before pseudo-element doesn't have a gradient background
        const beforeStyle = getComputedStyle(el, "::before");
        const beforeBg = beforeStyle.backgroundImage;
        if (beforeBg && beforeBg !== "none") {
          throw new Error(
            `Card ::before has background-image: ${beforeBg}. ` +
              `This decorative element causes bracket border artifacts.`
          );
        }
      }
    }
    return count;
  });

  return cardCount;
}

// ── Tests ────────────────────────────────────────────────────

test.describe("Card border visual fix (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status page cards have clean borders", async ({ page }) => {
    await page.route("**/api/v1/vpn-status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_VPN_STATUS),
      }),
    );

    await page.goto("/vpn-status/");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for data to render
    await expect(page.getByText("Tunnel Overview")).toBeVisible({
      timeout: 10000,
    });

    const cardCount = await verifyCardBorders(page);
    expect(
      cardCount,
      "VPN Status page should have at least one card with clean borders",
    ).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS page cards have clean borders", async ({ page }) => {
    await page.route("**/api/v1/qos/summary", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_QOS_SUMMARY),
      }),
    );

    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const cardCount = await verifyCardBorders(page);
    expect(
      cardCount,
      "QoS page should have at least one card with clean borders",
    ).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-qos.png",
      fullPage: true,
    });
  });

  test("DNS Logs page cards have clean borders", async ({ page }) => {
    await page.route("**/api/v1/dns-logs/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DNS_STATS),
      }),
    );
    await page.route("**/api/v1/dns-logs?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DNS_LOG),
      }),
    );

    await page.goto("/dns-logs");
    await expect(
      page.getByRole("heading", { name: "DNS Query Log", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for stats cards to render
    await page.waitForTimeout(2000);

    const cardCount = await verifyCardBorders(page);
    expect(
      cardCount,
      "DNS Logs page should have at least one card with clean borders",
    ).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-dns-logs.png",
      fullPage: true,
    });
  });
});
