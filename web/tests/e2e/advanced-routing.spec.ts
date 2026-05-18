import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for advanced routing features (#668):
 * - Policy Routing tab (mangle rules + routing rules)
 * - Gateway Monitoring tab (netwatch)
 * - Dynamic Routing tab (BGP/OSPF + IPv6 ND)
 *
 * These tabs appear on the MikroTik router page when the router is
 * connected. In CI (no real router), we verify the tabs are present
 * in either connected or unreachable state.
 *
 * SKIPPED (PR #792 — fix/port-router-literal):
 *   The literal port of router-page.jsx ships a fixed 9-tab strip
 *   (System / Interfaces / VLANs / Routes / DHCP / Firewall / NAT /
 *   DNS / WireGuard). Policy Routing / Gateways / Dynamic Routing are
 *   not present in the design source and will be ported as part of a
 *   follow-up vendor-specific CRUD pass. The legacy CRUD UI is still
 *   reachable via `/router/mikrotik?legacy=1`.
 *
 * Follow-up tracking: re-enable once these tabs are ported into
 * <MikrotikRouterDesign /> (or move the assertions onto the legacy
 * `?legacy=1` path explicitly).
 */
test.describe.skip("Advanced Routing — MikroTik Router Tabs (#668)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);

    // Enable MikroTik so the tab bar renders (even if unreachable)
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
  });

  test("Policy Routing tab is visible and clickable", async ({ page }) => {
    await page.goto("/router/mikrotik/");

    // Wait for the page to resolve — either tabs or unreachable fallback
    const policyTab = page.getByRole("tab", { name: "Policy Routing" });
    const fallback = page.getByText(
      /Connected|Unreachable|unreachable|Not Configured|not configured/,
    ).first();
    await expect(policyTab.or(fallback)).toBeVisible({ timeout: 40000 });

    // If tabs are visible, click Policy Routing
    if (await policyTab.isVisible()) {
      await policyTab.click();
      // Verify policy routing content renders (table or empty state)
      await expect(
        page
          .getByText("Mangle Rules (Policy Routing)")
          .or(page.getByText("No mangle rules configured")),
      ).toBeVisible({ timeout: 10000 });
    }

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-policy.png",
    });
  });

  test("Gateway Monitoring tab is visible and clickable", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik/");

    const gatewayTab = page.getByRole("tab", { name: "Gateways" });
    const fallback = page.getByText(
      /Connected|Unreachable|unreachable|Not Configured|not configured/,
    ).first();
    await expect(gatewayTab.or(fallback)).toBeVisible({ timeout: 40000 });

    if (await gatewayTab.isVisible()) {
      await gatewayTab.click();
      // Verify gateway monitoring content renders
      await expect(
        page
          .getByText("Gateway Health Monitors")
          .or(page.getByText("No gateway monitors configured")),
      ).toBeVisible({ timeout: 10000 });
    }

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-gateways.png",
    });
  });

  test("Dynamic Routing tab is visible and clickable", async ({ page }) => {
    await page.goto("/router/mikrotik/");

    const dynamicTab = page.getByRole("tab", { name: "Dynamic Routing" });
    const fallback = page.getByText(
      /Connected|Unreachable|unreachable|Not Configured|not configured/,
    ).first();
    await expect(dynamicTab.or(fallback)).toBeVisible({ timeout: 40000 });

    if (await dynamicTab.isVisible()) {
      await dynamicTab.click();
      // Verify dynamic routing content renders
      await expect(
        page
          .getByText("BGP Connections")
          .or(page.getByText("No BGP connections configured")),
      ).toBeVisible({ timeout: 10000 });
    }

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-dynamic.png",
    });
  });

  test("all three advanced routing tabs exist in tab bar", async ({
    page,
  }) => {
    await page.goto("/router/mikrotik/");

    // Wait for either tabs or fallback
    const systemTab = page.getByRole("tab", { name: "System" });
    const fallback = page.getByText(
      /Connected|Unreachable|unreachable|Not Configured|not configured/,
    ).first();
    await expect(systemTab.or(fallback)).toBeVisible({ timeout: 40000 });

    // If the tab bar renders (router connected or status loaded), check all tabs
    if (await systemTab.isVisible()) {
      await expect(
        page.getByRole("tab", { name: "Policy Routing" }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Gateways" }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Dynamic Routing" }),
      ).toBeVisible();
    }

    await page.screenshot({
      path: "tests/screenshots/advanced-routing-all-tabs.png",
      fullPage: true,
    });
  });
});
