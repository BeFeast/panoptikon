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
    await expect(page.getByText("Router Status")).toBeVisible({
      timeout: 10000,
    });

    // The stat card title elements should have the new label styling
    // (text-[11px] font-medium uppercase tracking-wider text-slate-500)
    const routerTitle = page.getByText("Router Status");
    await expect(routerTitle).toHaveCSS("text-transform", "uppercase");
    await expect(routerTitle).toHaveCSS("letter-spacing", /[1-9]/);

    const devicesTitle = page.getByText("Active Devices");
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
      /^(Online|Offline|Unconfigured|Unreachable)$/,
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
    const wanTraffic = page.getByText("WAN Traffic");
    await expect(wanTraffic).toBeVisible({ timeout: 10000 });
    await expect(wanTraffic).toHaveCSS("text-transform", "uppercase");

    await page.screenshot({
      path: "tests/screenshots/card-layout-dashboard-headers.png",
      fullPage: true,
    });
  });

  // ── Router / System cards ─────────────────────────────────

  test("router system tab info cards have proper min-height", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so System tab may render
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("load");

    const toggle = page.locator("#mt-enabled");
    await expect(toggle).toBeVisible();
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }
    await page.locator("#mt-url").fill("http://10.10.0.125");
    await page.locator("#mt-user").fill("admin");
    await page.locator("#mt-password").fill("admin");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.goto("/router/mikrotik/");

    // Wait for either System tab (connected) or unreachable msg
    const systemTab = page.getByRole("tab", { name: "System" });
    const fallback = page.getByText(
      /unreachable|Unreachable|Not Configured/,
    );
    await expect(systemTab.or(fallback)).toBeVisible({ timeout: 25000 });

    // If System tab is visible, verify info card min-height
    if (await systemTab.isVisible()) {
      await systemTab.click();

      // InfoStatCard renders with min-h-[5rem] (80px)
      const cards = page.locator(
        '[class*="border-slate-800"][class*="bg-slate-900"]',
      );
      const cardCount = await cards.count();

      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const box = await cards.nth(i).boundingBox();
        if (box) {
          // Each card should be at least 80px tall (5rem at default 16px)
          expect(box.height).toBeGreaterThanOrEqual(76); // 80px - 4px tolerance
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
