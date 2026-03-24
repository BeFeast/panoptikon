import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for card border visual fix (#656).
 *
 * Verifies that Card components on VPN Status, QoS, and DNS Logs pages
 * render with clean rounded borders and no decorative ::before pseudo-element
 * that was causing a bracket/parenthesis-shaped glitch on the left edge.
 */

/** Assert that the first Card on a page has clean border styling. */
async function assertCleanCardBorder(page: Page) {
  // Find the first card element (all Card components render with rounded-xl + border)
  const card = page.locator("[class*='rounded-xl'][class*='border']").first();
  await expect(card).toBeVisible({ timeout: 15000 });

  // Verify the ::before pseudo-element does not inject decorative content
  const beforeContent = await card.evaluate((el) => {
    const style = window.getComputedStyle(el, "::before");
    return style.content;
  });
  // Should be "none" or empty — no gradient top-line decoration
  expect(
    beforeContent === "none" || beforeContent === "" || beforeContent === "normal",
    `Card ::before pseudo-element should have no content, got "${beforeContent}"`,
  ).toBeTruthy();

  // Verify uniform border (no different left-side border)
  const borders = await card.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      top: style.borderTopWidth,
      right: style.borderRightWidth,
      bottom: style.borderBottomWidth,
      left: style.borderLeftWidth,
    };
  });
  expect(borders.left).toBe(borders.top);
  expect(borders.left).toBe(borders.right);
  expect(borders.left).toBe(borders.bottom);
}

test.describe("Card border visual fix (#656)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VPN Status — Tunnel Overview card has clean borders", async ({
    page,
  }) => {
    await page.goto("/vpn-status/");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await assertCleanCardBorder(page);

    await page.screenshot({
      path: "tests/screenshots/card-border-vpn-status.png",
      fullPage: true,
    });
  });

  test("QoS — cards have clean borders", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", {
        name: "QoS / Traffic Shaping",
        level: 1,
      }),
    ).toBeVisible({ timeout: 15000 });

    await assertCleanCardBorder(page);

    await page.screenshot({
      path: "tests/screenshots/card-border-qos.png",
      fullPage: true,
    });
  });

  test("DNS Logs — Query Log table card has clean borders", async ({
    page,
  }) => {
    await page.goto("/dns-logs");
    await expect(
      page.getByRole("heading", { name: "DNS Query Log", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await assertCleanCardBorder(page);

    await page.screenshot({
      path: "tests/screenshots/card-border-dns-logs.png",
      fullPage: true,
    });
  });
});
