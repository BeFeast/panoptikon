import { test, expect, login } from "../../e2e/fixtures";

test.describe.skip("DNS Security settings page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/dns-security");
  });

  test("page loads with DNS Security heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: "tests/screenshots/dns-security-page.png",
      fullPage: true,
    });
  });

  test("shows DNSSEC and DoT sections", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // DNSSEC section
    await expect(page.getByText("DNSSEC Validation")).toBeVisible();
    await expect(
      page.getByText("Validate DNS responses with cryptographic signatures")
    ).toBeVisible();

    // DoT section
    await expect(page.getByText("DNS-over-TLS (DoT)")).toBeVisible();
    await expect(
      page.getByText("Encrypt DNS queries to upstream resolvers using TLS")
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dns-security-sections.png",
      fullPage: true,
    });
  });

  test("DNSSEC toggle is visible and clickable", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    const dnssecToggle = page.getByTestId("dnssec-toggle");
    await expect(dnssecToggle).toBeVisible();
    await expect(dnssecToggle).toBeEnabled();

    await page.screenshot({
      path: "tests/screenshots/dns-security-dnssec-toggle.png",
    });
  });

  test("DoT toggle is visible and clickable", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    const dotToggle = page.getByTestId("dot-toggle");
    await expect(dotToggle).toBeVisible();
    await expect(dotToggle).toBeEnabled();

    await page.screenshot({
      path: "tests/screenshots/dns-security-dot-toggle.png",
    });
  });

  test("Add Server button opens dialog", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "DNS Security", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Add Server" }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });

    // Dialog should have address and port fields
    await expect(
      page
        .locator('[role="dialog"]')
        .getByText("Add DoT Upstream Server", { exact: true })
    ).toBeVisible();
    await expect(page.locator("#dot-address")).toBeVisible();
    await expect(page.locator("#dot-port")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/dns-security-add-server-dialog.png",
    });
  });

  test("settings page shows DNS Security card in Network section", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "Settings", level: 1 })
    ).toBeVisible({ timeout: 15000 });

    // DNS Security card should be visible
    await expect(page.getByText("DNS Security")).toBeVisible();
    await expect(
      page.getByText("Configure DNS-over-TLS (DoT) and DNSSEC validation.")
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-dns-security-card.png",
      fullPage: true,
    });
  });
});
