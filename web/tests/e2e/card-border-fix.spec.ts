import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card border fix (#656).
 *
 * Verifies that cards on VPN Status, QoS, and DNS Logs pages
 * render with clean rounded-lg borders and overflow-hidden
 * (no bracket/parenthesis-shaped artifacts).
 */
test.describe("Card border fix — no bracket artifacts (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status cards have overflow-hidden and uniform border", async ({
    page,
  }) => {
    await page.goto("/vpn-status/");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Find a Card element (rounded-lg + border + overflow-hidden)
    const card = page
      .locator('[class*="rounded-lg"][class*="overflow-hidden"][class*="border"]')
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Verify computed overflow is hidden (clips pseudo-element within rounded corners)
    const overflow = await card.evaluate(
      (el) => window.getComputedStyle(el).overflow,
    );
    expect(overflow).toBe("hidden");

    // Verify border is uniform on all sides
    const borders = await card.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        top: s.borderTopWidth,
        right: s.borderRightWidth,
        bottom: s.borderBottomWidth,
        left: s.borderLeftWidth,
      };
    });
    expect(borders.top).toBe(borders.bottom);
    expect(borders.left).toBe(borders.right);
    expect(borders.top).toBe(borders.left);

    await page.screenshot({
      path: "tests/screenshots/card-border-fix-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS cards have overflow-hidden and uniform border", async ({
    page,
  }) => {
    await page.goto("/qos/");
    await expect(
      page.getByRole("heading", { name: /QoS/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const card = page
      .locator('[class*="rounded-lg"][class*="overflow-hidden"][class*="border"]')
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });

    const overflow = await card.evaluate(
      (el) => window.getComputedStyle(el).overflow,
    );
    expect(overflow).toBe("hidden");

    await page.screenshot({
      path: "tests/screenshots/card-border-fix-qos.png",
      fullPage: true,
    });
  });

  test("DNS Logs cards have overflow-hidden and uniform border", async ({
    page,
  }) => {
    await page.goto("/dns-logs/");
    await expect(
      page.getByRole("heading", { name: /DNS Query Log/i, level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Stats cards within the grid
    const card = page
      .locator('[data-testid="dns-stats-grid"] [class*="rounded-lg"][class*="overflow-hidden"]')
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });

    const overflow = await card.evaluate(
      (el) => window.getComputedStyle(el).overflow,
    );
    expect(overflow).toBe("hidden");

    await page.screenshot({
      path: "tests/screenshots/card-border-fix-dns-logs.png",
      fullPage: true,
    });
  });
});
