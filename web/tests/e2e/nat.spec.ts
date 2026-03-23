import { test, expect, login } from "../../e2e/fixtures";

test.describe("NAT / Port Forwarding page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/nat/");
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("page loads with heading, summary card, and action buttons", async ({
    page,
  }) => {
    // Heading
    await expect(
      page.getByRole("heading", { name: "NAT / Port Forwarding", level: 1 }),
    ).toBeVisible();

    // Summary card
    await expect(
      page.getByText("MikroTik NAT Rules"),
    ).toBeVisible();

    // Action buttons
    await expect(
      page.getByRole("button", { name: "Refresh" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Rule" }),
    ).toBeVisible();

    // Search input
    await expect(
      page.getByPlaceholder("Filter by comment, action, destination port..."),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-page.png",
      fullPage: true,
    });
  });

  test("empty state or table is shown", async ({ page }) => {
    const emptyState = page.getByText("No NAT rules configured.");
    const table = page.getByRole("table");

    // One of these should be visible
    await Promise.race([
      emptyState.waitFor({ state: "visible", timeout: 10000 }),
      table.waitFor({ state: "visible", timeout: 10000 }),
    ]);

    await page.screenshot({
      path: "tests/screenshots/nat-empty-or-list.png",
      fullPage: true,
    });
  });

  test("Add Rule dialog opens and shows all form fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    const dialog = page.locator('[role="dialog"]');

    // Dialog title
    await expect(dialog.getByText("Add MikroTik NAT Rule")).toBeVisible();

    // Core fields
    await expect(dialog.getByText("Chain")).toBeVisible();
    await expect(dialog.getByText("Action")).toBeVisible();
    await expect(dialog.getByText("Protocol")).toBeVisible();
    await expect(dialog.getByText("Dst Port")).toBeVisible();

    // Address fields for 1:1 NAT and outbound NAT
    await expect(dialog.getByText("Src Address")).toBeVisible();
    await expect(dialog.getByText("Dst Address")).toBeVisible();
    await expect(dialog.getByText("To Addresses")).toBeVisible();
    await expect(dialog.getByText("To Ports")).toBeVisible();
    await expect(dialog.getByText("Out Interface")).toBeVisible();

    // Comment and disabled
    await expect(dialog.getByText("Comment")).toBeVisible();
    await expect(dialog.getByText("Disabled")).toBeVisible();

    // Create button should be present
    await expect(
      dialog.getByRole("button", { name: "Create" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-add-dialog.png",
    });
  });

  test("Add Rule dialog validates required fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    const dialog = page.locator('[role="dialog"]');
    const createBtn = dialog.getByRole("button", { name: "Create" });

    // Pre-filled with defaults (chain=dstnat, action=dst-nat) so button should be enabled
    await expect(createBtn).toBeEnabled();

    // Clear chain — button should become disabled
    await dialog.getByPlaceholder("dstnat").clear();
    await expect(createBtn).toBeDisabled();

    // Restore chain, clear action — button should still be disabled
    await dialog.getByPlaceholder("dstnat").fill("dstnat");
    await dialog.getByPlaceholder("dst-nat").clear();
    await expect(createBtn).toBeDisabled();

    await page.screenshot({
      path: "tests/screenshots/nat-add-validation.png",
    });
  });

  test("table shows correct column headers when rules exist", async ({
    page,
  }) => {
    const table = page.getByRole("table");
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      await expect(
        page.getByRole("columnheader", { name: "Chain" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Action" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Protocol" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Src Address" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Dst Address" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Dst Port" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "To Address" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "To Port" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Status" }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Actions" }),
      ).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/nat-table-headers.png",
      });
    }
  });

  test("cancel button closes dialog without changes", async ({ page }) => {
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3000,
    });

    // Click cancel
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Dialog should be gone
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/nat-dialog-cancelled.png",
    });
  });
});
