import { test, expect, login } from "../../e2e/fixtures";

test.describe("Deep linking — URL hash activates correct tab", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("NAT page: navigating to /nat#dnat activates DNAT tab", async ({ page }) => {
    await page.goto("/nat#dnat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const dnatTab = page.getByRole("tab", { name: "DNAT" });
    await expect(dnatTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/deep-link-nat-dnat.png",
      fullPage: true,
    });
  });

  test("NAT page: clicking tab updates URL hash", async ({ page }) => {
    await page.goto("/nat");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Default tab is "all" — click SNAT
    await page.getByRole("tab", { name: "SNAT" }).click();
    await expect(page).toHaveURL(/\/nat#snat/);

    await page.screenshot({
      path: "tests/screenshots/deep-link-nat-snat-hash.png",
      fullPage: true,
    });
  });

  test("DNS logs page: navigating to /dns-logs#stats activates Statistics tab", async ({ page }) => {
    await page.goto("/dns-logs#stats");
    await expect(
      page.getByRole("heading", { name: "DNS Query Log", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const statsTab = page.getByRole("tab", { name: "Statistics" });
    await expect(statsTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/deep-link-dns-stats.png",
      fullPage: true,
    });
  });

  test("QoS page: navigating to /qos#mikrotik activates MikroTik tab if available", async ({ page }) => {
    await page.goto("/qos#mikrotik");
    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });

    // Check hash is preserved in URL
    await expect(page).toHaveURL(/\/qos#mikrotik/);

    await page.screenshot({
      path: "tests/screenshots/deep-link-qos-mikrotik.png",
      fullPage: true,
    });
  });

  test("VPN status page: navigating to /vpn-status#overview keeps overview tab", async ({ page }) => {
    await page.goto("/vpn-status#overview");
    await expect(
      page.getByRole("heading", { name: "VPN Status", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const overviewTab = page.getByRole("tab", { name: "Overview" });
    await expect(overviewTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/deep-link-vpn-overview.png",
      fullPage: true,
    });
  });

  test("NAT page: invalid hash falls back to default tab", async ({ page }) => {
    await page.goto("/nat#nonexistent");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should fall back to the default "all" tab
    const allTab = page.getByRole("tab", { name: "All Rules" });
    await expect(allTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/deep-link-nat-fallback.png",
      fullPage: true,
    });
  });
});
