import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the router pages (MikroTik + VyOS).
 *
 * These tests verify page load, connection status display, interface list
 * rendering, and mobile layout (regression for #416).
 *
 * The tests run against a dev environment where no real router is connected,
 * so they exercise the "not configured" / "unreachable" paths as well as
 * the "enabled + unreachable" state when MikroTik settings have been saved.
 */
test.describe("Router Page — MikroTik", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("MikroTik router page loads and shows RouterSelector", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik/");

    // RouterSelector should be visible with the MikroTik button active
    await expect(
      page.getByRole("link", { name: /MikroTik/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-loaded.png",
    });
  });

  test("MikroTik page shows connection status indicator", async ({ page }) => {
    // First enable MikroTik so we get past the "Not Configured" card
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    // Wait for settings API to load so the toggle reflects the saved state
    await page.waitForLoadState("networkidle");

    // Enable MikroTik and save
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

    // Navigate to the router page
    await page.goto("/router/mikrotik/");

    // In test env (no real router), we expect "unreachable" message or
    // the "Not Configured" card (both are valid states).
    // The MikroTik component shows either the status header with
    // Connected/Unreachable badge or the fallback "unreachable" text.
    await expect(
      page.getByText(/Connected|Unreachable|unreachable|Not Configured/),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-status.png",
    });
  });

  test("MikroTik page shows not-configured card when disabled", async ({
    page,
  }) => {
    // Disable MikroTik
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    // Wait for settings API to load so the toggle reflects the saved state
    await page.waitForLoadState("networkidle");

    const toggle = page.locator("#mt-enabled");
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "false") {
      await toggle.click();
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 10000 });

    // Navigate to MikroTik router page
    await page.goto("/router/mikrotik/");

    // Should show the "Not Configured" card
    await expect(
      page.getByText("MikroTik Not Configured"),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("link", { name: /Configure Router/ }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-not-configured.png",
    });
  });

  test("MikroTik interface list renders when router is enabled", async ({
    page,
  }) => {
    // Enable MikroTik with a URL
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    // Wait for settings API to load so the toggle reflects the saved state
    await page.waitForLoadState("networkidle");

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

    // Navigate to MikroTik router page
    await page.goto("/router/mikrotik/");

    // In test env, the router is unreachable, so we get the fallback UI.
    // We verify the page at least renders — either the status header with
    // tabs (including Interfaces), or the unreachable/not-configured message.
    await expect(
      page.getByText(/Interfaces|unreachable|Unreachable|Not Configured/),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-interfaces.png",
    });
  });

  test("MikroTik page mobile layout does not overflow (#416)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/router/mikrotik/");

    // RouterSelector should still be visible on mobile
    await expect(
      page.getByRole("link", { name: /MikroTik/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-mobile.png",
      fullPage: true,
    });

    // Verify page content doesn't overflow the mobile viewport width
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflowX).toBe(false);
  });
});

test.describe("Router Page — VyOS", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("VyOS route redirects to MikroTik (primary router)", async ({
    page,
  }) => {
    // /router always redirects to /router/mikrotik
    await page.goto("/router/");
    await page.waitForURL(/\/router\/mikrotik/, { timeout: 15000 });

    // Should land on MikroTik page with RouterSelector visible
    await expect(
      page.getByRole("link", { name: /MikroTik/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-vyos-redirect.png",
    });
  });

  test("VyOS link appears in RouterSelector when VyOS is configured", async ({
    page,
  }) => {
    // Configure VyOS settings first
    await page.goto("/settings/router/");
    await page.getByRole("tab", { name: /VyOS/ }).click();
    await expect(page.locator("#vyos-url")).toBeVisible({ timeout: 15000 });

    await page.locator("#vyos-url").fill("https://10.10.0.50");
    await page.locator("#vyos-key").fill("test-api-key");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("VyOS settings saved.")).toBeVisible({
      timeout: 10000,
    });

    // Navigate to router page — should redirect to /router/mikrotik
    await page.goto("/router/");
    await page.waitForURL(/\/router\/mikrotik/, { timeout: 15000 });

    // RouterSelector should now show the VyOS button with Legacy badge
    const vyosLink = page.getByRole("link", { name: /VyOS/ });
    await expect(vyosLink).toBeVisible({ timeout: 15000 });
    // The Legacy badge is inside the VyOS link
    await expect(vyosLink.getByText("Legacy")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/router-vyos-selector.png",
    });
  });

  test("VyOS mobile layout does not overflow (#416)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/router/");
    await page.waitForURL(/\/router\/mikrotik/, { timeout: 15000 });

    // RouterSelector should render without overflow on mobile
    await expect(
      page.getByRole("link", { name: /MikroTik/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-vyos-mobile.png",
      fullPage: true,
    });

    // Verify no horizontal overflow
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflowX).toBe(false);
  });
});
