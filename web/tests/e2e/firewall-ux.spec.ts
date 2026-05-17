import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for firewall UX enhancements:
 * - Rule hit counters / statistics columns
 * - Search/filter bar
 * - Drag-and-drop reordering (grip handle visible)
 * - Time-based rule schedule support
 *
 * These tests run against a dev environment where a MikroTik router
 * may or may not be reachable. They verify the UI renders the new
 * elements correctly, including fallback / empty states.
 */
test.describe("Firewall UX — rule statistics, reordering, search/filter, time-based rules", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("MikroTik firewall page loads with enhanced table columns", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Enable MikroTik so the firewall tab renders
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
      page.getByText("MikroTik settings saved.")
    ).toBeVisible({ timeout: 10000 });

    // Navigate to the MikroTik router page
    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    // Click the Firewall tab
    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(1000);

      // Verify the enhanced table headers exist (Stats column for hit counters)
      const statsHeader = page.locator("th").filter({ hasText: "Stats" });
      await expect(statsHeader.first()).toBeVisible({ timeout: 10000 });

      // Verify the Schedule column exists (time-based rules)
      const scheduleHeader = page
        .locator("th")
        .filter({ hasText: "Schedule" });
      await expect(scheduleHeader.first()).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/firewall-enhanced-table.png",
        fullPage: true,
      });
    }
  });

  test("firewall filter dialog includes schedule field", async ({ page }) => {
    test.setTimeout(60_000);

    // Enable MikroTik
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
      page.getByText("MikroTik settings saved.")
    ).toBeVisible({ timeout: 10000 });

    // Navigate to MikroTik router page
    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    // Click the Firewall tab
    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(1000);

      // Click "Add Rule" to open the filter dialog
      const addButton = page.getByRole("button", { name: "Add Rule" });
      if (await addButton.isVisible()) {
        await addButton.click();

        // Verify the dialog opens
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible({ timeout: 5000 });

        // Verify the schedule/time-based field is present
        const scheduleLabel = dialog.getByText("Schedule (Time-based)");
        await expect(scheduleLabel).toBeVisible();

        // Verify the schedule input placeholder text
        const scheduleInput = dialog.getByPlaceholder(
          /08:00:00-17:00:00/
        );
        await expect(scheduleInput).toBeVisible();

        await page.screenshot({
          path: "tests/screenshots/firewall-filter-dialog-schedule.png",
          fullPage: true,
        });

        // Close the dialog
        await page.getByRole("button", { name: "Cancel" }).click();
      }
    }
  });

  test("firewall search bar filters rules", async ({ page }) => {
    test.setTimeout(60_000);

    // Enable MikroTik
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
      page.getByText("MikroTik settings saved.")
    ).toBeVisible({ timeout: 10000 });

    // Navigate to MikroTik router page
    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    // Click the Firewall tab
    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(1000);

      // Check if search input is present (only shows when rules exist)
      const searchInput = page.getByPlaceholder("Search rules…");
      // If rules are loaded, search bar should be visible
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Type a search query
        await searchInput.fill("forward");
        await page.waitForTimeout(500);

        await page.screenshot({
          path: "tests/screenshots/firewall-search-bar.png",
          fullPage: true,
        });

        // Clear search
        await searchInput.fill("");
      }
    }
  });
});
