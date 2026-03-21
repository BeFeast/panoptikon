import { test, expect, login } from "../../e2e/fixtures";

/**
 * Verify that tab/filter bars on inner pages use static positioning
 * and do not stick to the top of the viewport on scroll.
 *
 * Regression test for #482 — same class of bug as #452 (Settings headers).
 */
test.describe("No sticky tab/filter bars (#482)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("alerts filter bar has static positioning", async ({ page }) => {
    await page.goto("/alerts/");
    await expect(
      page.getByRole("heading", { name: "Alerts", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The filter wrapper div contains the status and type filter buttons
    const filterSection = page.locator("text=All Types").locator("..");
    await expect(filterSection).toBeVisible();

    const position = await filterSection.evaluate(
      (el) => window.getComputedStyle(el).position,
    );
    expect(position).toBe("static");

    await page.screenshot({
      path: "tests/screenshots/no-sticky-alerts-filter.png",
    });
  });

  test("devices filter bar has static positioning", async ({ page }) => {
    await page.goto("/devices/");
    await expect(
      page.getByRole("heading", { name: "Devices", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // The filter bar contains All/Online/Offline/Unknown buttons
    const filterBar = page.getByRole("button", { name: "All" }).locator("..");
    await expect(filterBar).toBeVisible();

    const position = await filterBar.evaluate(
      (el) => window.getComputedStyle(el).position,
    );
    // position must not be sticky or fixed — static or relative are both fine
    expect(["static", "relative"]).toContain(position);

    await page.screenshot({
      path: "tests/screenshots/no-sticky-devices-filter.png",
    });
  });
});
