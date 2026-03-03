import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for Router page visual polish (#555).
 *
 * Verifies:
 * 1. Stat cards look like info displays, not interactive elements
 *    (no shadow, subtle border, no pointer cursor)
 * 2. Header badges are vertically centred with the title block
 *    (justify-between layout)
 */
test.describe("Router card polish (#555)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("info stat cards have no box-shadow (non-interactive look)", async ({
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

    // Wait for either System tab (connected) or fallback message
    const systemTab = page.getByRole("tab", { name: "System" });
    const fallback = page.getByText(/not configured|unreachable/i);
    await expect(systemTab.or(fallback)).toBeVisible({ timeout: 40000 });

    // If System tab is rendered, verify stat cards are not interactive-looking
    if (await systemTab.isVisible()) {
      await systemTab.click();

      // InfoStatCards use shadow-none to override the base Card shadow-lg
      const cards = page.locator('[class*="shadow-none"][class*="border-slate-800"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(4);

      // Verify no pointer cursor on stat cards (they're informational)
      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const cursor = await cards.nth(i).evaluate(
          (el) => getComputedStyle(el).cursor,
        );
        expect(cursor).not.toBe("pointer");
      }

      // Verify no box-shadow on stat cards
      for (let i = 0; i < Math.min(cardCount, 6); i++) {
        const shadow = await cards.nth(i).evaluate(
          (el) => getComputedStyle(el).boxShadow,
        );
        expect(shadow).toBe("none");
      }
    }

    await page.screenshot({
      path: "tests/screenshots/router-card-polish-no-shadow.png",
      fullPage: true,
    });
  });

  test("header badges are vertically aligned with the title block", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so header renders with badges
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

    // Wait for status header (Connected/Unreachable badge)
    const badge = page.getByText(/Connected|Unreachable/);
    const fallback = page.getByText(/Not Configured/i);
    await expect(badge.or(fallback)).toBeVisible({ timeout: 40000 });

    // If the status header rendered (badge visible), verify alignment
    if (await badge.isVisible()) {
      const title = page.locator("h1").filter({ hasText: "MikroTik Router" });
      await expect(title).toBeVisible();

      const titleBox = await title.boundingBox();
      const badgeBox = await badge.boundingBox();

      // Both must be visible and have bounding boxes
      expect(titleBox).toBeTruthy();
      expect(badgeBox).toBeTruthy();

      // The title and badge vertical centres should be close (within 20px)
      // allowing for the subtitle pushing the title group taller
      const titleCenterY = titleBox!.y + titleBox!.height / 2;
      const badgeCenterY = badgeBox!.y + badgeBox!.height / 2;
      expect(Math.abs(titleCenterY - badgeCenterY)).toBeLessThanOrEqual(20);
    }

    await page.screenshot({
      path: "tests/screenshots/router-card-polish-header-align.png",
      fullPage: true,
    });
  });
});
