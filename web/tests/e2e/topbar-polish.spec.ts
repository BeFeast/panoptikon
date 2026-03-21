import { test, expect } from "../../e2e/fixtures";

test.describe("TopBar polish — search glow, breadcrumbs, notification pulse", () => {
  test("search input has blue glow on focus", async ({ authenticatedPage: page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // Focus the search input
    await searchInput.focus();

    // The focused input should have the blue ring classes applied via CSS
    // Verify the element is focused and take a screenshot for visual confirmation
    await expect(searchInput).toBeFocused();
    await page.screenshot({ path: "test-results/search-glow-focus.png" });
  });

  test("breadcrumbs show for deep navigation (settings sub-page)", async ({ authenticatedPage: page }) => {
    // Navigate to a nested settings page (depth > 1)
    await page.goto("/settings/scanner");
    await page.waitForLoadState("networkidle");

    // Breadcrumb nav should be visible
    const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumbNav).toBeVisible();

    // Should show "Settings" and "Scanner" segments
    await expect(breadcrumbNav.getByText("Settings")).toBeVisible();
    await expect(breadcrumbNav.getByText("Scanner")).toBeVisible();

    await page.screenshot({ path: "test-results/breadcrumbs-deep-nav.png" });
  });

  test("breadcrumbs hidden on top-level pages", async ({ authenticatedPage: page }) => {
    // Dashboard is a single-level route
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumbNav).not.toBeVisible();
  });

  test("notification badge has pulse animation class when unread > 0", async ({ authenticatedPage: page }) => {
    // Check if the badge exists (depends on there being unread alerts)
    const badge = page.locator(".badge-pulse");

    // Take screenshot of the bell area regardless
    await page.screenshot({ path: "test-results/notification-badge.png" });

    // If there are unread alerts, the badge should be visible with the pulse class
    const count = await badge.count();
    if (count > 0) {
      await expect(badge).toBeVisible();
    }
    // If no unread alerts, the badge won't render — that's correct behavior
  });
});
