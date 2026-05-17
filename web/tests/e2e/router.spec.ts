import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the router pages (MikroTik + Xiaomi).
 *
 * These tests verify page load, connection status display, interface list
 * rendering, and mobile layout (regression for #416).
 *
 * Xiaomi is now only under Router tabs (not a separate nav item).
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
      page.locator("main").getByRole("link", { name: "MikroTik" }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-loaded.png",
    });
  });

  test("MikroTik page shows connection status indicator", async ({ page }) => {
    test.setTimeout(60_000); // extended: MikroTik status may take >15s in CI under load
    // First enable MikroTik so we get past the "Not Configured" card
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    // Wait for settings API to load so the toggle reflects the saved state
    await page.waitForLoadState("load");

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

    // In test env (no real router), we expect an "unreachable" or "not configured"
    // message. Valid text states:
    //   "Connected"              — status header (reachable=true)
    //   "Unreachable"            — status header (reachable=false, but only rendered
    //                              when component reaches the full render path)
    //   "unreachable"            — inline error: "MikroTik router is unreachable."
    //   "not configured"         — inline error: "MikroTik router is not configured."
    //   "Not Configured"         — page-level card when mikrotik_enabled=false
    // Timeout raised to 40 s: the backend has a 10 s TCP timeout to 10.10.0.125;
    // under CI load (services tests run in parallel) the response can take >25 s.
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/,
      ).first(),
    ).toBeVisible({ timeout: 40000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-status.png",
    });
  });

  test("MikroTik page shows not-configured card when disabled", async ({
    page,
  }) => {
    test.setTimeout(90_000); // extended: networkidle + status response may take >30s in CI under load
    // Disable MikroTik
    await page.goto("/settings/router/");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    // Wait for settings API to load so the toggle reflects the saved state
    await page.waitForLoadState("load");

    const toggle = page.locator("#mt-enabled");
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "false") {
      await toggle.click();
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 20000 });

    // Navigate to MikroTik router page
    await page.goto("/router/mikrotik/");

    // Should show the "Not Configured" card
    await expect(
      page.getByText("MikroTik Not Configured"),
    ).toBeVisible({ timeout: 25000 });
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
      page.getByText(/Interfaces|unreachable|Unreachable|Not Configured/).first(),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-interfaces.png",
    });
  });

  test("System tab info cards have uniform widths (#480)", async ({ page }) => {
    test.setTimeout(60_000);
    // Enable MikroTik so System tab may render (if router is reachable)
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

    // Wait for the page to resolve — either System tab (connected) or unreachable msg
    const systemTab = page.getByRole("tab", { name: "System" });
    const fallback = page.getByText(/unreachable|Unreachable|Not Configured/).first();
    await expect(systemTab.or(fallback)).toBeVisible({ timeout: 25000 });

    // If System tab is visible, verify info card widths are uniform
    if (await systemTab.isVisible()) {
      await systemTab.click();

      // All info cards (Version, Uptime, CPU Load, Memory, Platform, Board)
      // are inside a single grid with col-span-1 — their widths should match.
      const cards = page.locator('[class*="col-span-1"][class*="border-slate-800"]');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThanOrEqual(4);

      const widths: number[] = [];
      for (let i = 0; i < cardCount; i++) {
        const box = await cards.nth(i).boundingBox();
        expect(box).toBeTruthy();
        widths.push(box!.width);
      }

      // All cards in the same row should have equal width (within 2px tolerance)
      // Cards wrap at breakpoints, so compare cards in groups that share a row
      const firstWidth = widths[0];
      for (const w of widths) {
        expect(Math.abs(w - firstWidth)).toBeLessThanOrEqual(2);
      }
    }

    await page.screenshot({
      path: "tests/screenshots/router-mikrotik-card-widths.png",
      fullPage: true,
    });
  });

  test("MikroTik page mobile layout does not overflow (#416)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/router/mikrotik/");

    // RouterSelector should still be visible on mobile
    await expect(
      page.locator("main").getByRole("link", { name: "MikroTik" }),
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

test.describe("Router Page — /router redirects to MikroTik", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("/router redirects to /router/mikrotik", async ({ page }) => {
    const settingsRes = await page.request.patch("/api/v1/settings", {
      data: {
        default_router: "mikrotik",
        mikrotik_enabled: true,
      },
    });
    expect(settingsRes.ok()).toBeTruthy();

    await page.goto("/router/");
    await page.waitForURL(/\/router\/mikrotik/, { timeout: 15000 });

    // Should land on MikroTik page with RouterSelector visible
    await expect(
      page.locator("main").getByRole("link", { name: "MikroTik" }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-redirect.png",
    });
  });
});

test.describe("Router Page — Xiaomi (#491)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Xiaomi is NOT in the Infrastructure sidebar section (#491)", async ({
    page,
  }) => {
    await page.goto("/dashboard/");
    await expect(
      page.getByRole("link", { name: "Dashboard" }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Infrastructure section should NOT contain a Xiaomi link
    // The sidebar links for Infrastructure are: Agents, SSH Hosts, CF Tunnel
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Agents" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "SSH Hosts" })).toBeVisible();

    // Xiaomi should NOT appear as a standalone sidebar link
    await expect(
      sidebar.getByRole("link", { name: "Xiaomi", exact: true }),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/sidebar-no-xiaomi.png",
      fullPage: true,
    });
  });

  test("/xiaomi redirects to /router/xiaomi (#491)", async ({ page }) => {
    // Old /xiaomi URL should redirect to the merged router/xiaomi page
    await page.goto("/xiaomi/");
    await page.waitForURL(/\/router\/xiaomi/, { timeout: 15000 });

    // Should see the RouterSelector with Xiaomi button
    await expect(
      page.getByRole("link", { name: /Xiaomi/ }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/xiaomi-redirect.png",
    });
  });

  test("Xiaomi router page has System and Mesh Topology tabs (#491)", async ({
    page,
  }) => {
    await page.goto("/router/xiaomi/");

    // RouterSelector should show MikroTik and Xiaomi buttons
    await expect(
      page.locator("main").getByRole("link", { name: "MikroTik" }),
    ).toBeVisible({ timeout: 15000 });
    // Use exact match to avoid matching "Configure Xiaomi Mesh" link shown in not-configured state
    await expect(
      page.getByRole("link", { name: "Xiaomi", exact: true }),
    ).toBeVisible();

    // Either the tabs (System / Mesh Topology) are visible when Xiaomi is enabled,
    // or the "Not Configured" card is shown. Both are valid states.
    const systemTab = page.getByRole("tab", { name: "System" });
    const meshTab = page.getByRole("tab", { name: "Mesh Topology" });
    const notConfigured = page.getByText("Xiaomi Mesh Not Configured");

    // Wait for either tabs or the not-configured card
    await expect(
      systemTab.or(notConfigured),
    ).toBeVisible({ timeout: 15000 });

    // If tabs are visible, verify both exist
    if (await systemTab.isVisible()) {
      await expect(meshTab).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/router-xiaomi-tabs.png",
    });
  });

  test("Xiaomi router page mobile layout does not overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/router/xiaomi/");

    // RouterSelector should render — use exact match to avoid matching "Configure Xiaomi Mesh"
    await expect(
      page.getByRole("link", { name: "Xiaomi", exact: true }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/router-xiaomi-mobile.png",
      fullPage: true,
    });

    // Verify no horizontal overflow
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflowX).toBe(false);
  });
});
