import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card border visual fix (#656).
 *
 * Verifies that cards on VPN Status, QoS, and DNS Logs pages render
 * with clean rounded-xl borders (overflow-hidden, no decorative
 * before:: pseudo-element bracket artifacts).
 */

test.describe("Card border visual fix (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status cards have clean rounded borders", async ({ page }) => {
    await page.goto("/vpn-status");

    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Tunnel Overview card should be visible with proper styling
    const overviewCard = page.locator('[class*="rounded-xl"]').first();
    await expect(overviewCard).toBeVisible();

    // Verify cards have overflow-hidden to prevent bracket artifacts
    const cards = page.locator('[class*="overflow-hidden"][class*="rounded-xl"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS cards have clean rounded borders", async ({ page }) => {
    await page.goto("/qos");

    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should render with overflow-hidden
    const cards = page.locator('[class*="overflow-hidden"][class*="rounded-xl"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-qos.png",
      fullPage: true,
    });
  });

  test("DNS Logs cards have clean rounded borders", async ({ page }) => {
    await page.goto("/dns-logs");

    await expect(
      page.getByRole("heading", { name: "DNS Query Log", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Stats cards should render with overflow-hidden
    const statsGrid = page.getByTestId("dns-stats-grid");
    await expect(statsGrid).toBeVisible({ timeout: 10000 });

    const cards = page.locator('[class*="overflow-hidden"][class*="rounded-xl"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    await page.screenshot({
      path: "tests/screenshots/card-border-dns-logs.png",
      fullPage: true,
    });
  });
});
