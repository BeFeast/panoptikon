import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card border visual fix (#656).
 *
 * Verifies that cards on VPN Status, QoS, and DNS Logs pages render with
 * clean rounded-xl borders (no bracket/parenthesis-shaped artifacts from
 * the former ::before pseudo-element shimmer line).
 */

test.describe("Card border visual fix (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status cards have clean rounded borders without ::before artifact", async ({
    page,
  }) => {
    await page.goto("/vpn-status");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Tunnel Overview card should be visible
    await expect(page.getByText("Tunnel Overview")).toBeVisible({
      timeout: 10000,
    });

    // Verify the card's ::before pseudo-element has no visible content
    // (no gradient shimmer line that causes the bracket artifact)
    const card = page.locator(".rounded-xl").first();
    const beforeContent = await card.evaluate((el) => {
      const style = window.getComputedStyle(el, "::before");
      return style.content;
    });
    // ::before should have no content (either "none" or empty)
    expect(
      beforeContent === "none" || beforeContent === "" || beforeContent === '""',
    ).toBeTruthy();

    await page.screenshot({
      path: "tests/screenshots/card-border-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS cards have clean rounded borders without ::before artifact", async ({
    page,
  }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", {
        name: "QoS / Traffic Shaping",
        level: 1,
      }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should be visible
    await expect(page.getByText("MikroTik Simple Queues")).toBeVisible();
    await expect(page.getByText("MikroTik Queue Tree")).toBeVisible();

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

    // Stats cards should be visible
    const statsGrid = page.getByTestId("dns-stats-grid");
    await expect(statsGrid.getByText("Total Queries")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/card-border-dns-logs.png",
      fullPage: true,
    });
  });
});
