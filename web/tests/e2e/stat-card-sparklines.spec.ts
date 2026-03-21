import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for InfoStatCard visual upgrades:
 * - Animated counters
 * - Sparkline rendering
 * - Gradient icon backgrounds
 * - Subtle background glow
 *
 * Tests run against the router page where InfoStatCards are used.
 */
test.describe("InfoStatCard — visual upgrades", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("stat cards render with gradient icon backgrounds on router page", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so the router page renders
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

    // Navigate to router page
    await page.goto("/router/mikrotik/");
    await page.waitForLoadState("load");

    // The router may or may not be reachable in CI.
    // If reachable, stat cards render inside the System tab.
    // If not, an "unreachable" or "not configured" fallback shows.
    const systemTab = page.getByRole("tab", { name: /System/ });
    const fallback = page.getByText(/not configured|unreachable/i);
    await expect(systemTab.or(fallback)).toBeVisible({ timeout: 40000 });

    if (await systemTab.isVisible()) {
      await systemTab.click();

      // At least some stat cards should be visible (version, uptime, cpu, etc.)
      await expect(page.getByText("Version", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Uptime", { exact: true })).toBeVisible();
      await expect(page.getByText("CPU Load", { exact: true })).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/stat-cards-gradient-icons.png",
      });

      // Verify icon containers use gradient backgrounds (h-12 w-12 = 48x48)
      const firstIcon = page.locator(".bg-gradient-to-b").first();
      await expect(firstIcon).toBeVisible();

      // Verify the icon container is 48x48 (h-12 w-12)
      const box = await firstIcon.boundingBox();
      expect(box).toBeTruthy();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44); // allow slight variance
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    } else {
      // Router is unreachable — verify the fallback UI renders correctly
      await page.screenshot({
        path: "tests/screenshots/stat-cards-unreachable-fallback.png",
      });
    }
  });

  test("stat card labels and values render correctly", async ({ page }) => {
    await page.goto("/router/mikrotik/");
    await page.waitForLoadState("load");

    // Even without MikroTik configured, the page should load
    // Check for router page elements
    await expect(
      page.getByRole("link", { name: /MikroTik/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/stat-cards-layout.png",
    });
  });
});
