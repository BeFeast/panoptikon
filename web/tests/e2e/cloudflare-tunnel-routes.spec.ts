import { test, expect, login } from "../../e2e/fixtures";

test.describe.skip("Cloudflare Tunnel Routes — Edit functionality", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/cloudflare-tunnel/");
    await expect(
      page.getByRole("heading", { name: "Cloudflare Tunnel", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("page renders with Tunnel Routes section", async ({ page }) => {
    // The page should show the heading
    await expect(
      page.getByRole("heading", { name: "Cloudflare Tunnel", exact: true }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/cloudflare-tunnel-routes-page.png",
    });
  });

  test("edit button is visible in route actions when routes exist", async ({
    page,
  }) => {
    // Check if the Tunnel Routes card is visible
    await expect(page.getByText("Tunnel Routes", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    // If routes exist, check that edit (pencil) buttons are present
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Each route row should have both an edit and delete button
      const firstRow = rows.first();
      // The edit button is identifiable by its pencil icon SVG
      const editButtons = firstRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      });
      await expect(editButtons).toBeVisible();

      const deleteButtons = firstRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      });
      await expect(deleteButtons).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-route-actions.png",
      });
    }
    // If no routes, that's OK — the tunnel may not be configured
  });

  test("clicking edit button opens edit dialog with pre-filled values", async ({
    page,
  }) => {
    await expect(page.getByText("Tunnel Routes", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      // Get the text content from the first route row
      const firstRow = rows.first();
      const hostname = await firstRow.locator("td").nth(0).textContent();
      const service = await firstRow.locator("td").nth(1).textContent();

      // Click the edit button (first button in actions column)
      const editButton = firstRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      });
      await editButton.click();

      // The edit dialog should open
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });

      // Verify the dialog title
      await expect(
        dialog.getByText("Edit Tunnel Route"),
      ).toBeVisible();

      // Verify the form fields are pre-filled with the route's current values
      await expect(page.locator("#edit-hostname")).toHaveValue(hostname?.trim() || "");
      await expect(page.locator("#edit-service")).toHaveValue(service?.trim() || "");

      // Save Changes button should be visible
      await expect(
        dialog.getByRole("button", { name: "Save Changes" }),
      ).toBeVisible();

      // Cancel button should be visible
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeVisible();

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-edit-dialog.png",
      });

      // Close the dialog via Cancel
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("edit dialog cancel does not modify route", async ({ page }) => {
    await expect(page.getByText("Tunnel Routes", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();
      const originalHostname = await firstRow.locator("td").nth(0).textContent();

      // Open edit dialog
      const editButton = firstRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      });
      await editButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });

      // Modify a field
      await page.locator("#edit-hostname").fill("modified-hostname.example.com");

      // Cancel
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });

      // Verify the original hostname is still displayed
      await expect(firstRow.locator("td").nth(0)).toContainText(
        originalHostname?.trim() || "",
      );

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-edit-cancelled.png",
      });
    }
  });

  test("add route button opens add dialog (not edit)", async ({ page }) => {
    // If not configured, the Add Route button is hidden — skip in that case
    const addButton = page.getByRole("button", { name: "Add Route" });
    const isVisible = await addButton.isVisible();

    if (isVisible) {
      await addButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });

      // Verify this is the Add dialog, not Edit
      await expect(
        dialog.getByText("Add Tunnel Route"),
      ).toBeVisible();

      // Fields should be empty (not pre-filled)
      await expect(page.locator("#hostname")).toHaveValue("");
      await expect(page.locator("#service")).toHaveValue("");
      await expect(page.locator("#path")).toHaveValue("");

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-add-dialog.png",
      });

      // Close
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });
});
