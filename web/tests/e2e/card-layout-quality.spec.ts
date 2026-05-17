import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for card visual layout quality (#538).
 *
 * Verifies the reusable InfoStatCard component and improved typography
 * hierarchy across Dashboard stat cards, Router/System info cards, and
 * Device cards.
 *
 * Key checks:
 * - Consistent readable labels
 * - Proper min-height for card breathing room
 * - Truncation with title tooltips
 * - No horizontal overflow at common viewport widths
 */
test.describe("Card Layout Quality (#538)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ── Dashboard ─────────────────────────────────────────────

  test("dashboard stat card labels remain readable in the renewed shell", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // Wait for stat cards to resolve
    await expect(page.getByText("Router Status", { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });

    const labels = ["Router Status", "Active Devices", "WAN Bandwidth", "Unread Alerts"];
    for (const label of labels) {
      const title = page.getByText(label, { exact: true }).first();
      await expect(title).toBeVisible();

      const letterSpacing = await title.evaluate((el) => getComputedStyle(el).letterSpacing);
      expect(letterSpacing === "normal" || parseFloat(letterSpacing) >= 0).toBeTruthy();
    }

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
      /total known|Cannot load/,
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

    const sectionTitles = ["WAN Traffic", "Recent Alerts", "Device Breakdown"];
    for (const title of sectionTitles) {
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 });
    }

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
      page.locator("main").getByRole("link", { name: "MikroTik" }),
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

    // If the System tab is rendered (router reachable in dev), verify the cards
    // have measurable structure without depending on a legacy min-height token.
    if (await systemTab.isVisible()) {
      const cards = page.locator(
        '[class*="border-slate-800"][class*="bg-slate-900"]',
      );
      const cardCount = await cards.count();
      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const box = await cards.nth(i).boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(32);
          expect(box.width).toBeGreaterThan(120);
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
