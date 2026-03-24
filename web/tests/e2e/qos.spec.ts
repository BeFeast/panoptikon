import { test, expect, login } from "../../e2e/fixtures";

test.describe("QoS / Traffic Shaping", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("QoS page loads with heading and summary cards", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Summary cards should be visible
    await expect(page.getByText("MikroTik Simple Queues")).toBeVisible();
    await expect(page.getByText("MikroTik Queue Tree")).toBeVisible();

    // Refresh button present
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/qos-page.png",
      fullPage: true,
    });
  });

  test("overview tab shows traffic shaping description", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Click overview tab
    await page.getByRole("tab", { name: "Overview" }).click();

    await expect(
      page.getByText("Traffic Shaping Overview"),
    ).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/qos-overview.png",
      fullPage: true,
    });
  });

  test("MikroTik tab shows queue tables when available", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for summary to load
    await page.waitForTimeout(2000);

    // Check if MikroTik tab exists (depends on router being configured)
    const mtTab = page.getByRole("tab", { name: "MikroTik Queues" });
    if (await mtTab.isVisible()) {
      await mtTab.click();

      // Simple Queues section should be present
      await expect(page.getByText("Simple Queues")).toBeVisible({ timeout: 10000 });
      // Queue Tree section should be present
      await expect(page.getByText("Queue Tree")).toBeVisible();

      // Add Queue button should be present
      await expect(
        page.getByRole("button", { name: "Add Queue" }),
      ).toBeVisible();

      // Add Tree Entry button should be present
      await expect(
        page.getByRole("button", { name: "Add Tree Entry" }),
      ).toBeVisible();

      // Search/filter input should be present
      await expect(
        page.getByPlaceholder("Filter by queue name, target, or comment..."),
      ).toBeVisible();

      // Auto-refresh button should be present
      await expect(
        page.getByRole("button", { name: "Auto-refresh" }),
      ).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/qos-mikrotik-tab.png",
        fullPage: true,
      });
    }
  });

  test("Add Queue dialog opens and validates fields", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for summary to load
    await page.waitForTimeout(2000);

    const mtTab = page.getByRole("tab", { name: "MikroTik Queues" });
    if (await mtTab.isVisible()) {
      await mtTab.click();
      await expect(
        page.getByRole("button", { name: "Add Queue" }),
      ).toBeVisible({ timeout: 10000 });

      // Open add dialog
      await page.getByRole("button", { name: "Add Queue" }).click();

      // Dialog should appear
      await expect(
        page.getByRole("heading", { name: "Add Simple Queue" }),
      ).toBeVisible({ timeout: 5000 });

      // Form fields should be present
      await expect(page.locator("#queue-name")).toBeVisible();
      await expect(page.locator("#queue-target")).toBeVisible();
      await expect(page.locator("#queue-max-limit")).toBeVisible();

      // Submit empty form should show validation error
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Name is required")).toBeVisible();

      // Cancel closes dialog
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByRole("heading", { name: "Add Simple Queue" }),
      ).not.toBeVisible({ timeout: 3000 });

      await page.screenshot({
        path: "tests/screenshots/qos-add-queue-dialog.png",
        fullPage: true,
      });
    }
  });

  test("Add Tree Entry dialog opens and validates fields", async ({
    page,
  }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(2000);

    const mtTab = page.getByRole("tab", { name: "MikroTik Queues" });
    if (await mtTab.isVisible()) {
      await mtTab.click();
      await expect(
        page.getByRole("button", { name: "Add Tree Entry" }),
      ).toBeVisible({ timeout: 10000 });

      // Open add tree dialog
      await page.getByRole("button", { name: "Add Tree Entry" }).click();

      // Dialog should appear
      await expect(
        page.getByRole("heading", { name: "Add Queue Tree Entry" }),
      ).toBeVisible({ timeout: 5000 });

      // Form fields should be present
      await expect(page.locator("#tree-name")).toBeVisible();
      await expect(page.locator("#tree-parent")).toBeVisible();
      await expect(page.locator("#tree-packet-mark")).toBeVisible();

      // Parent should default to "global"
      await expect(page.locator("#tree-parent")).toHaveValue("global");

      // Clear name and submit should show validation error
      await page.locator("#tree-name").fill("");
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Name is required")).toBeVisible();

      // Cancel closes dialog
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByRole("heading", { name: "Add Queue Tree Entry" }),
      ).not.toBeVisible({ timeout: 3000 });

      await page.screenshot({
        path: "tests/screenshots/qos-add-tree-dialog.png",
        fullPage: true,
      });
    }
  });

  test("auto-refresh toggle works", async ({ page }) => {
    await page.goto("/qos");
    await expect(
      page.getByRole("heading", { name: "QoS / Traffic Shaping", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(2000);

    const mtTab = page.getByRole("tab", { name: "MikroTik Queues" });
    if (await mtTab.isVisible()) {
      await mtTab.click();

      // Click auto-refresh button
      const autoRefreshBtn = page.getByRole("button", {
        name: "Auto-refresh",
      });
      await expect(autoRefreshBtn).toBeVisible({ timeout: 10000 });
      await autoRefreshBtn.click();

      // Button text should change to "Live"
      await expect(
        page.getByRole("button", { name: "Live" }),
      ).toBeVisible({ timeout: 5000 });

      // Click again to stop
      await page.getByRole("button", { name: "Live" }).click();
      await expect(
        page.getByRole("button", { name: "Auto-refresh" }),
      ).toBeVisible({ timeout: 5000 });

      await page.screenshot({
        path: "tests/screenshots/qos-auto-refresh.png",
        fullPage: true,
      });
    }
  });
});
