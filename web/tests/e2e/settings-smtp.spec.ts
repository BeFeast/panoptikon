import { test, expect, login } from "../../e2e/fixtures";

test.describe("SMTP Email Notifications — save / reload roundtrip", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/smtp/");
    await expect(page.locator("#smtp-host")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("form renders with expected fields", async ({ page }) => {
    await expect(page.locator("#smtp-host")).toBeVisible();
    await expect(page.locator("#smtp-port")).toBeVisible();
    await expect(page.locator("#smtp-username")).toBeVisible();
    await expect(page.locator("#smtp-password")).toBeVisible();
    await expect(page.locator("#smtp-from")).toBeVisible();
    await expect(page.locator("#smtp-to")).toBeVisible();
    await expect(page.locator("#smtp-tls")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-smtp-form.png",
    });
  });

  test("save and reload persists SMTP settings", async ({ page }) => {
    const testHost = "smtp.e2e-test.com";
    const testPort = "465";
    const testUser = "e2e@test.com";
    const testFrom = "panoptikon@e2e.com";
    const testTo = "admin@e2e.com";

    await page.locator("#smtp-host").fill(testHost);
    await page.locator("#smtp-port").fill(testPort);
    await page.locator("#smtp-username").fill(testUser);
    await page.locator("#smtp-password").fill("e2e-smtp-pass");
    await page.locator("#smtp-from").fill(testFrom);
    await page.locator("#smtp-to").fill(testTo);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("SMTP settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#smtp-host")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#smtp-host")).toHaveValue(testHost);
    await expect(page.locator("#smtp-port")).toHaveValue(testPort);
    await expect(page.locator("#smtp-username")).toHaveValue(testUser);
    await expect(page.locator("#smtp-from")).toHaveValue(testFrom);
    await expect(page.locator("#smtp-to")).toHaveValue(testTo);

    // Password shows "(saved)" label
    await expect(
      page.locator('label[for="smtp-password"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/settings-smtp-persisted.png",
    });
  });

  test("settings page links to email notifications", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByText("Email Notifications"),
    ).toBeVisible({ timeout: 10000 });
  });
});
