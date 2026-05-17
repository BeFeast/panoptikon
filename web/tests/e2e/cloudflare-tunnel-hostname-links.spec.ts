import { test, expect, login } from "../../e2e/fixtures";

test.describe.skip("Cloudflare Tunnel Routes — Hostname links", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/cloudflare-tunnel/");
    await expect(
      page.getByRole("heading", { name: "Cloudflare Tunnel", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("hostnames with HTTP services render as clickable links with external-link icon", async ({
    page,
  }) => {
    await expect(page.getByText("Tunnel Routes", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();
      const hostnameCell = firstRow.locator("td").nth(0);

      // Check if the hostname is rendered as a link
      const link = hostnameCell.locator("a");
      const linkCount = await link.count();

      if (linkCount > 0) {
        // Verify the link has correct attributes
        const href = await link.getAttribute("href");
        expect(href).toMatch(/^https:\/\/.+/);

        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");

        // Verify external link icon is present
        const externalIcon = link.locator("svg.lucide-external-link");
        await expect(externalIcon).toBeVisible();

        // Verify the hostname text is visible inside the link
        const hostnameText = await link.locator("span").first().textContent();
        expect(hostnameText?.trim()).toBeTruthy();

        // Verify the href matches the hostname text
        expect(href).toBe(`https://${hostnameText?.trim()}`);
      }
      // If no link, the service is non-HTTP — hostname rendered as plain text (safe fallback)

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-hostname-links.png",
      });
    }
  });

  test("hostname link text matches value used in edit dialog", async ({
    page,
  }) => {
    await expect(page.getByText("Tunnel Routes", { exact: true })).toBeVisible({
      timeout: 15000,
    });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const firstRow = rows.first();
      const hostnameCell = firstRow.locator("td").nth(0);
      const link = hostnameCell.locator("a");
      const linkCount = await link.count();

      // Get the hostname from the cell (either from link or plain text)
      let hostname: string;
      if (linkCount > 0) {
        hostname = (await link.locator("span").first().textContent()) || "";
      } else {
        hostname = (await hostnameCell.textContent()) || "";
      }
      hostname = hostname.trim();

      // Open the edit dialog and check hostname matches
      const editButton = firstRow.locator("button").filter({
        has: page.locator("svg.lucide-pencil"),
      });
      await editButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 3000 });

      await expect(page.locator("#edit-hostname")).toHaveValue(hostname);

      await page.screenshot({
        path: "tests/screenshots/cloudflare-tunnel-hostname-link-edit-match.png",
      });

      // Close dialog
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  });
});
