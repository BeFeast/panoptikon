import { test, expect, login } from "../../e2e/fixtures";

test.describe("DHCP page — sub-tabs for Active Leases / Static Mappings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/router/pfsense");
    await page.waitForLoadState("networkidle");
  });

  test("DHCP tab shows Active Leases and Static Mappings sub-tabs", async ({
    page,
  }) => {
    // Click the top-level DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Verify both sub-tabs are visible
    const leasesTab = page.getByRole("tab", { name: "Active Leases" });
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(leasesTab).toBeVisible({ timeout: 10000 });
    await expect(mappingsTab).toBeVisible();

    // Active Leases should be the default selected tab
    await expect(leasesTab).toHaveAttribute("data-state", "active");

    await page.screenshot({
      path: "tests/screenshots/dhcp-active-leases-tab.png",
    });
  });

  test("clicking Static Mappings tab shows mappings content", async ({
    page,
  }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    // Click Static Mappings sub-tab
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(mappingsTab).toBeVisible({ timeout: 10000 });
    await mappingsTab.click();

    // Verify mappings tab is now active
    await expect(mappingsTab).toHaveAttribute("data-state", "active");

    // The Add Mapping button should be visible in the Static Mappings section
    await expect(
      page.getByRole("button", { name: "Add Mapping" }),
    ).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/dhcp-static-mappings-tab.png",
    });
  });

  test("switching between tabs preserves tab state", async ({ page }) => {
    // Navigate to DHCP tab
    const dhcpTab = page.getByRole("tab", { name: "DHCP" });
    await expect(dhcpTab).toBeVisible({ timeout: 15000 });
    await dhcpTab.click();

    const leasesTab = page.getByRole("tab", { name: "Active Leases" });
    const mappingsTab = page.getByRole("tab", { name: "Static Mappings" });
    await expect(leasesTab).toBeVisible({ timeout: 10000 });

    // Switch to Static Mappings
    await mappingsTab.click();
    await expect(mappingsTab).toHaveAttribute("data-state", "active");
    await expect(leasesTab).toHaveAttribute("data-state", "inactive");

    // Switch back to Active Leases
    await leasesTab.click();
    await expect(leasesTab).toHaveAttribute("data-state", "active");
    await expect(mappingsTab).toHaveAttribute("data-state", "inactive");

    await page.screenshot({
      path: "tests/screenshots/dhcp-tab-switching.png",
    });
  });
});
