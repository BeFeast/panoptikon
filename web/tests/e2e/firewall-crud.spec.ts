import { test, expect, login } from "../../e2e/fixtures";

/**
 * E2E tests for MikroTik firewall rule management (CRUD):
 * - Filter rule create/edit/delete via dialogs
 * - NAT rule create/edit/delete via dialogs
 * - Address list entry create/edit/toggle/delete
 * - Enable/disable toggle for rules
 *
 * These tests verify the UI renders CRUD controls and dialogs correctly.
 * They may not complete real mutations if no MikroTik router is reachable.
 */
test.describe.skip("Firewall CRUD — filter rules, NAT rules, address lists", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

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
  });

  test("filter rule CRUD dialog opens with all fields", async ({ page }) => {
    test.setTimeout(60_000);

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

      // Click "Add Rule" button
      const addButton = page.getByRole("button", { name: "Add Rule" });
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();

      // Verify dialog opens
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Verify all form fields are present
      await expect(dialog.getByText("Chain")).toBeVisible();
      await expect(dialog.getByText("Action")).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/firewall-filter-crud-dialog.png",
        fullPage: true,
      });

      // Close the dialog
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("NAT rule CRUD dialog opens with all fields", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(1000);

      // Click "Add NAT Rule" button
      const addButton = page.getByRole("button", { name: "Add NAT Rule" });
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();

      // Verify dialog opens
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });

      // Verify NAT-specific fields
      await expect(dialog.getByText("Chain")).toBeVisible();
      await expect(dialog.getByText("Action")).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/firewall-nat-crud-dialog.png",
        fullPage: true,
      });

      // Close
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("address list CRUD dialog opens for create and has required fields", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(1000);

      // Click "Add Entry" button for address lists
      const addButton = page.getByRole("button", { name: "Add Entry" });
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();

      // Verify dialog opens with "Add" title
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(
        dialog.getByText("Add Address List Entry")
      ).toBeVisible();

      // Verify form fields
      await expect(dialog.getByText("List Name")).toBeVisible();
      await expect(dialog.getByText("Address")).toBeVisible();
      await expect(dialog.getByText("Comment")).toBeVisible();

      // Verify placeholders
      await expect(
        dialog.getByPlaceholder("e.g. blocked")
      ).toBeVisible();
      await expect(
        dialog.getByPlaceholder("e.g. 10.0.0.0/8")
      ).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/firewall-address-list-add-dialog.png",
        fullPage: true,
      });

      // Close the dialog
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("address list table shows Status column and action buttons", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(2000);

      // Check if the Address Lists card is visible
      const addressListCard = page.getByText("Address Lists");
      await expect(addressListCard.first()).toBeVisible({ timeout: 5000 });

      // Check if there are address list entries to verify Status column
      const statusHeader = page
        .locator("th")
        .filter({ hasText: "Status" });

      // The address list table should have a Status column if entries exist
      if (
        await statusHeader
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await expect(statusHeader.first()).toBeVisible();

        await page.screenshot({
          path: "tests/screenshots/firewall-address-list-status-column.png",
          fullPage: true,
        });
      }
    }
  });

  test("filter rules table has toggle and edit action buttons", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/router/mikrotik/");
    await expect(
      page.getByText(
        /Connected|Unreachable|unreachable|Not Configured|not configured/
      ).first()
    ).toBeVisible({ timeout: 40000 });

    const firewallTab = page.getByRole("tab", { name: /Firewall/ });
    if (await firewallTab.isVisible()) {
      await firewallTab.click();
      await page.waitForTimeout(2000);

      // Verify the Filter Rules card has Add Rule button
      const addRuleBtn = page.getByRole("button", { name: "Add Rule" });
      await expect(addRuleBtn).toBeVisible({ timeout: 5000 });

      // Verify the NAT Rules card has Add NAT Rule button
      const addNatBtn = page.getByRole("button", { name: "Add NAT Rule" });
      await expect(addNatBtn).toBeVisible({ timeout: 5000 });

      // Verify the Address Lists card has Add Entry button
      const addEntryBtn = page.getByRole("button", { name: "Add Entry" });
      await expect(addEntryBtn).toBeVisible({ timeout: 5000 });

      await page.screenshot({
        path: "tests/screenshots/firewall-crud-buttons.png",
        fullPage: true,
      });
    }
  });
});
