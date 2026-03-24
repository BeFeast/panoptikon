import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for card border visual fix (#656).
 *
 * Verifies that cards on VPN Status, QoS, and DNS Logs pages render
 * with clean rounded borders (no gradient backgrounds or decorative
 * pseudo-elements that create bracket/parenthesis-shaped glitches).
 */

async function mockVpnStatus(page: Page) {
  await page.route("**/api/v1/vpn-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mikrotik_available: true,
        interfaces: [
          {
            name: "wg0",
            address: "10.0.0.1/24",
            port: 51820,
            public_key: "TESTKEY123456789=",
            status: "up",
            peers: [],
            peers_online: 0,
            peers_total: 0,
            source: "mikrotik",
          },
        ],
        total_peers: 0,
        online_peers: 0,
        total_rx_bytes: 0,
        total_tx_bytes: 0,
      }),
    }),
  );
}

async function assertCardsHaveCleanBorders(page: Page) {
  // Find all Card elements (they have the rounded-xl border class)
  const cards = page.locator(".rounded-xl.border");
  const count = await cards.count();
  expect(count, "Expected at least one card on the page").toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    // Verify no gradient background (cards should use solid bg)
    const bgImage = await card.evaluate((el) =>
      getComputedStyle(el).backgroundImage,
    );
    expect(
      bgImage === "none" || !bgImage.includes("gradient"),
      `Card ${i} should not have a gradient background, got: ${bgImage}`,
    ).toBeTruthy();

    // Verify no ::before pseudo-element with visible content
    const beforeBg = await card.evaluate((el) => {
      const style = getComputedStyle(el, "::before");
      return style.backgroundImage;
    });
    expect(
      beforeBg === "none" || beforeBg === "",
      `Card ${i} ::before should not have a gradient background, got: ${beforeBg}`,
    ).toBeTruthy();
  }
}

test.describe("Card border visual fix (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status cards have clean borders without bracket glitch", async ({
    page,
  }) => {
    await mockVpnStatus(page);
    await page.goto("/vpn-status");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await assertCardsHaveCleanBorders(page);
    await page.screenshot({
      path: "tests/screenshots/card-border-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS cards have clean borders without bracket glitch", async ({
    page,
  }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await assertCardsHaveCleanBorders(page);
    await page.screenshot({
      path: "tests/screenshots/card-border-qos.png",
      fullPage: true,
    });
  });

  test("DNS Logs cards have clean borders without bracket glitch", async ({
    page,
  }) => {
    await page.goto("/dns-logs");
    await expect(
      page.getByRole("heading", { name: "DNS Query Log", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for stats cards to render
    const statsGrid = page.getByTestId("dns-stats-grid");
    await expect(statsGrid.getByText("Total Queries")).toBeVisible();

    await assertCardsHaveCleanBorders(page);
    await page.screenshot({
      path: "tests/screenshots/card-border-dns-logs.png",
      fullPage: true,
    });
  });
});
