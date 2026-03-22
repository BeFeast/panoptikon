import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for the pfSense Services tab.
 *
 * Uses API mocking since no real pfSense is available in CI.
 * Verifies that the Services tab renders, lists services, and
 * action buttons (start/stop/restart) are present and clickable.
 */
test.describe("pfSense Services Tab", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // Enable pfSense in settings so the router page renders
    await page.goto("/settings/pfsense/");
    await expect(page.locator("#pf-host")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("load");

    const toggle = page.locator("#pf-enabled");
    const checked = await toggle.getAttribute("aria-checked");
    if (checked !== "true") {
      await toggle.click();
    }
    await page.locator("#pf-host").fill("10.10.0.1");
    await page.locator("#pf-username").fill("admin");
    await page.locator("#pf-password").fill("test-pass");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("pfSense settings saved."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Services tab is visible in pfSense router page", async ({ page }) => {
    // Mock the pfSense status API to simulate a connected router
    await page.route("**/api/v1/pfsense/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          hostname: "pfSense-test",
          version: "2.8.1-RELEASE",
          uptime: "1d 2h 30m",
          cpu_usage: 5.0,
          memory_total: 8589934592,
          memory_used: 2147483648,
          platform: "amd64",
        }),
      }),
    );

    await page.goto("/router/pfsense/");

    // Wait for tabs to render
    const servicesTab = page.getByRole("tab", { name: "Services" });
    await expect(servicesTab).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/pfsense-services-tab-visible.png",
    });
  });

  test("Services tab renders service list with mocked data", async ({
    page,
  }) => {
    // Mock pfSense status
    await page.route("**/api/v1/pfsense/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          hostname: "pfSense-test",
          version: "2.8.1-RELEASE",
          uptime: "1d 2h 30m",
          cpu_usage: 5.0,
          memory_total: 8589934592,
          memory_used: 2147483648,
          platform: "amd64",
        }),
      }),
    );

    // Mock services list
    await page.route("**/api/v1/pfsense/services", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { name: "unbound", description: "DNS Resolver", running: true },
          { name: "dhcpd", description: "DHCP Server", running: true },
          { name: "ntpd", description: "NTP Clock Sync", running: true },
          { name: "syslogd", description: "System Logger", running: false },
        ]),
      }),
    );

    await page.goto("/router/pfsense/");

    // Click Services tab
    const servicesTab = page.getByRole("tab", { name: "Services" });
    await expect(servicesTab).toBeVisible({ timeout: 15000 });
    await servicesTab.click();

    // Verify service names are visible
    await expect(page.getByText("unbound")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("dhcpd")).toBeVisible();
    await expect(page.getByText("ntpd")).toBeVisible();
    await expect(page.getByText("syslogd")).toBeVisible();

    // Verify running services show "Running" badge
    const runningBadges = page.locator("text=Running");
    await expect(runningBadges.first()).toBeVisible();

    // Verify stopped service shows "Stopped" badge
    await expect(page.getByText("Stopped")).toBeVisible();

    // Verify running count
    await expect(page.getByText("3 / 4 running")).toBeVisible();

    // Running services should have Restart and Stop buttons
    await expect(page.getByRole("button", { name: "Restart" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" }).first()).toBeVisible();

    // Stopped service should have Start button
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/pfsense-services-list.png",
    });
  });

  test("Service restart action triggers API call", async ({ page }) => {
    // Mock pfSense status
    await page.route("**/api/v1/pfsense/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          hostname: "pfSense-test",
          version: "2.8.1-RELEASE",
        }),
      }),
    );

    // Mock services list
    await page.route("**/api/v1/pfsense/services", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { name: "unbound", description: "DNS Resolver", running: true },
        ]),
      }),
    );

    // Mock service action endpoint
    let actionCalled = false;
    await page.route("**/api/v1/pfsense/services/*/action", (route) => {
      actionCalled = true;
      return route.fulfill({
        status: 204,
      });
    });

    await page.goto("/router/pfsense/");

    const servicesTab = page.getByRole("tab", { name: "Services" });
    await expect(servicesTab).toBeVisible({ timeout: 15000 });
    await servicesTab.click();

    // Wait for service to appear
    await expect(page.getByText("unbound")).toBeVisible({ timeout: 10000 });

    // Click Restart button
    await page.getByRole("button", { name: "Restart" }).click();

    // Verify the toast appears
    await expect(
      page.getByText(/restart successful/i),
    ).toBeVisible({ timeout: 10000 });

    expect(actionCalled).toBe(true);

    await page.screenshot({
      path: "tests/screenshots/pfsense-services-restart.png",
    });
  });
});
