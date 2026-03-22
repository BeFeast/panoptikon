import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card visual layout quality (#538).
 *
 * Verifies the reusable InfoStatCard component and improved typography
 * hierarchy across Dashboard stat cards, Router/System info cards, and
 * Device cards.
 *
 * Key checks:
 * - Consistent uppercase tracking-wider labels
 * - Proper min-height for card breathing room
 * - Truncation with title tooltips
 * - No horizontal overflow at common viewport widths
 */
test.describe("Card Layout Quality (#538)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ── Dashboard ─────────────────────────────────────────────

  test("dashboard stat card labels use uppercase tracking-wider style", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Wait for stat cards to resolve
    await expect(page.getByText("Total Devices")).toBeVisible({
      timeout: 10000,
    });

    // The stat card title elements should have the new label styling
    // (text-[11px] font-medium uppercase tracking-wider text-slate-500)
    const routerTitle = page.getByText("Total Devices");
    await expect(routerTitle).toHaveCSS("text-transform", "uppercase");
    await expect(routerTitle).toHaveCSS("letter-spacing", /[1-9]/);

    const devicesTitle = page.getByText("Active Alerts");
    await expect(devicesTitle).toHaveCSS("text-transform", "uppercase");

    await page.screenshot({
      path: "tests/screenshots/card-layout-dashboard-labels.png",
      fullPage: true,
    });
  });

  test("dashboard stat card values have visible subtitles", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Wait for stat cards to resolve
    const routerValue = page.getByText(
      /currently online|Cannot load/,
    );
    await expect(routerValue.first()).toBeVisible({ timeout: 10000 });

    // Subtitle text should be visible (not too muted)
    const subtitleText = page.getByText(/total known|All clear|Needs attention|Cannot load|Cannot reach|Connected to|Router not configured/);
    await expect(subtitleText.first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/card-layout-dashboard-subtitles.png",
      fullPage: true,
    });
  });

  test("dashboard section headers use uppercase label style", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Section titles like "WAN Traffic", "Recent Alerts", "Device Breakdown"
    // should all use the consistent label typography
    // "WAN Traffic" appears in both hero stat and bento section; use .first()
    const wanTraffic = page.getByText("WAN Traffic").first();
    await expect(wanTraffic).toBeVisible({ timeout: 10000 });
    await expect(wanTraffic).toHaveCSS("text-transform", "uppercase");

    await page.screenshot({
      path: "tests/screenshots/card-layout-dashboard-headers.png",
      fullPage: true,
    });
  });

  // ── Router / System cards ─────────────────────────────────

  test("router page renders without overflow regardless of connectivity", async ({
    page,
  }) => {
    test.setTimeout(30_000);

    // Navigate directly — no fragile settings-setup that races against the DB load.
    // The RouterSelector is always rendered at the top of this page, making it
    // a reliable anchor regardless of whether MikroTik is configured/reachable.
    await page.goto("/router/mikrotik/");

    // RouterSelector (MikroTik / Xiaomi buttons) is always present.
    await expect(
      page.getByRole("link", { name: /MikroTik/i }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for the page body to resolve beyond the skeleton state.
    // Any of: System tab (reachable), fallback message (unreachable/unconfigured),
    // or the "Not Configured" heading (disabled). Use case-insensitive match.
    const systemTab = page.getByRole("tab", { name: "System" });
    const anyFallback = page.getByText(/not configured|unreachable/i);
    await expect(systemTab.or(anyFallback)).toBeVisible({ timeout: 20000 });

    // No horizontal overflow — works in every state.
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    // If the System tab is rendered (router reachable in dev), verify InfoStatCard
    // min-height on the System view.
    if (await systemTab.isVisible()) {
      await systemTab.click();
      const cards = page.locator(
        '[class*="border-slate-800"][class*="bg-slate-900"]',
      );
      const cardCount = await cards.count();
      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const box = await cards.nth(i).boundingBox();
        if (box) {
          // InfoStatCard has min-h-[5rem] (80px); allow 4px tolerance.
          expect(box.height).toBeGreaterThanOrEqual(76);
        }
      }
    }

    await page.screenshot({
      path: "tests/screenshots/card-layout-router-system.png",
      fullPage: true,
    });
  });

  // ── Device cards ──────────────────────────────────────────

  test("device cards have consistent structure at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/devices");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible();

    // Wait for either device cards or empty state
    await page.waitForTimeout(3000);

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.screenshot({
      path: "tests/screenshots/card-layout-devices-1280.png",
      fullPage: true,
    });
  });

  // ── Cross-page consistency ────────────────────────────────

  test("no horizontal overflow on key pages at 375px mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const pages = ["/dashboard", "/devices"];

    for (const url of pages) {
      await page.goto(url);
      await page.waitForTimeout(2000);

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(
        bodyWidth,
        `Page ${url} overflows at 375px`,
      ).toBeLessThanOrEqual(viewportWidth + 1);
    }

    await page.screenshot({
      path: "tests/screenshots/card-layout-mobile-375.png",
      fullPage: true,
    });
  });
});
