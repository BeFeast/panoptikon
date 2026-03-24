import { test, expect, login } from "../../e2e/fixtures";

test.describe("DNS Security settings page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/dns-security");
  });

  test("page loads with DNS Security heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/dns-security-page.png",
      fullPage: true,
    });
  });

  test("shows DNSSEC Validation card with toggle", async ({ page }) => {
    await expect(
      page.getByText("DNSSEC Validation", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText("Enable DNSSEC to validate DNS responses"),
    ).toBeVisible();

    // DNSSEC toggle switch should be present
    const dnssecCard = page.locator("text=DNSSEC Validation").locator("../..");
    await expect(dnssecCard.locator('[role="switch"]')).toBeVisible();
  });

  test("shows DNS-over-TLS Upstreams section", async ({ page }) => {
    await expect(
      page.getByText("DNS-over-TLS Upstreams", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText("Encrypted DNS upstream servers"),
    ).toBeVisible();

    // Add Upstream button should be visible
    await expect(
      page.getByRole("button", { name: "Add Upstream" }),
    ).toBeVisible();
  });

  test("shows empty state when no DoT upstreams configured", async ({
    page,
  }) => {
    await expect(
      page.getByText("No DoT upstream servers configured yet."),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Add Upstream dialog opens with correct fields", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Upstream" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // Verify form fields
    await expect(
      page.locator('[role="dialog"]').getByText("Add DoT Upstream"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByLabel("Name"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByLabel("Address"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByLabel("Port"),
    ).toBeVisible();
    await expect(
      page.locator('[role="dialog"]').getByLabel("TLS Hostname (SNI)"),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dns-security-add-dialog.png",
    });
  });

  test("can create and see a DoT upstream entry", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open the add dialog
    await page.getByRole("button", { name: "Add Upstream" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // Fill out the form
    await page.locator('[role="dialog"]').getByLabel("Name").fill("Cloudflare DoT");
    await page.locator('[role="dialog"]').getByLabel("Address").fill("1.1.1.1");
    await page
      .locator('[role="dialog"]')
      .getByLabel("TLS Hostname (SNI)")
      .fill("cloudflare-dns.com");

    // Submit the form
    await page.locator('[role="dialog"]').getByRole("button", { name: "Create" }).click();

    // Verify the entry appears in the table
    await expect(page.getByText("Cloudflare DoT")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("1.1.1.1")).toBeVisible();
    await expect(page.getByText("cloudflare-dns.com")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dns-security-with-entry.png",
      fullPage: true,
    });
  });

  test("DNSSEC toggle persists after save and reload", async ({ page }) => {
    await expect(
      page.getByText("DNSSEC Validation", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // Find the DNSSEC switch and toggle it
    const dnssecCard = page.locator("text=DNSSEC Validation").locator("../..");
    const toggle = dnssecCard.locator('[role="switch"]');
    await expect(toggle).toBeVisible();

    // Get current state
    const wasChecked = await toggle.getAttribute("data-state") === "checked";

    // Toggle DNSSEC
    await toggle.click();

    // Wait for toast confirmation
    await expect(
      page.getByText(wasChecked ? "DNSSEC disabled" : "DNSSEC enabled"),
    ).toBeVisible({ timeout: 5000 });

    // Reload and verify it persisted
    await page.reload();
    await expect(
      page.getByText("DNSSEC Validation", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    const reloadedToggle = page
      .locator("text=DNSSEC Validation")
      .locator("../..")
      .locator('[role="switch"]');

    const expectedState = wasChecked ? "unchecked" : "checked";
    await expect(reloadedToggle).toHaveAttribute("data-state", expectedState, {
      timeout: 5000,
    });

    await page.screenshot({
      path: "tests/screenshots/dns-security-dnssec-persisted.png",
    });

    // Toggle back to original state to keep test idempotent
    await reloadedToggle.click();
  });
});

test.describe("Settings page — DNS Security nav card", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings");
  });

  test("shows DNS Security card in Network section", async ({ page }) => {
    await expect(
      page.getByText("DNS Security", { exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText("Configure DoT upstreams and DNSSEC validation."),
    ).toBeVisible();
  });
});
