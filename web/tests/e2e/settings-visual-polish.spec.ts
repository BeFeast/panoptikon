import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings pages — visual sections, inline validation, save animation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("password page has visual sections with icons and strength meter", async ({ page }) => {
    await page.goto("/settings/password");
    await expect(
      page.getByRole("heading", { name: "Change Password", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Verify visual sections exist (card-based sections with data-testid)
    const sections = page.locator('[data-testid="settings-section"]');
    await expect(sections).toHaveCount(2); // Current Password + New Password

    // Type a new password to trigger strength meter
    await page.locator("#new").fill("short");
    const strengthMeter = page.locator('[data-testid="password-strength-meter"]');
    await expect(strengthMeter).toBeVisible();
    // Strength bar should be visible (gradient bar)
    await expect(strengthMeter.locator(".bg-gradient-to-r")).toBeVisible();
    // Requirements should be visible
    await expect(strengthMeter.getByText("8+ chars")).toBeVisible();
    await expect(strengthMeter.getByText("Uppercase")).toBeVisible();
    await expect(strengthMeter.getByText("Number")).toBeVisible();
    await expect(strengthMeter.getByText("Symbol")).toBeVisible();

    // Type a strong password to see strength update
    await page.locator("#new").fill("Str0ng!Pass#99");
    await expect(strengthMeter.getByText("Strong")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-password-visual-sections.png",
    });
  });

  test("password page shows inline validation on confirm field", async ({ page }) => {
    await page.goto("/settings/password");
    await expect(
      page.getByRole("heading", { name: "Change Password", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Type mismatched passwords
    await page.locator("#new").fill("ValidPass123!");
    await page.locator("#confirm").fill("WrongPass");

    // Error message should show inline
    await expect(page.getByText("Passwords do not match.")).toBeVisible();

    // Fix the confirm field
    await page.locator("#confirm").fill("ValidPass123!");

    // Error should disappear, and checkmark should appear
    await expect(page.getByText("Passwords do not match.")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-password-inline-validation.png",
    });
  });

  test("scanner page has separate visual sections for scan config and enrichment", async ({ page }) => {
    await page.goto("/settings/scanner");
    await expect(
      page.getByRole("heading", { name: "Network Scanner", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should have two visual sections
    const sections = page.locator('[data-testid="settings-section"]');
    await expect(sections).toHaveCount(2);

    // Verify section titles
    await expect(page.getByText("Scan Configuration")).toBeVisible();
    await expect(page.getByText("Enrichment Sources")).toBeVisible();

    // Verify inline validation on scan interval
    await page.locator("#scan-interval").fill("5");
    await expect(page.getByText("Must be at least 10 seconds.")).toBeVisible();

    await page.locator("#scan-interval").fill("60");
    await expect(page.getByText("Must be at least 10 seconds.")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-scanner-visual-sections.png",
    });
  });

  test("retention page has separate sections for policies and maintenance", async ({ page }) => {
    await page.goto("/settings/retention");
    await expect(
      page.getByRole("heading", { name: "Data Retention", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should have two visual sections
    const sections = page.locator('[data-testid="settings-section"]');
    await expect(sections).toHaveCount(2);

    // Verify section titles
    await expect(page.getByText("Retention Policies")).toBeVisible();
    await expect(page.getByText("Database Maintenance")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-retention-visual-sections.png",
    });
  });

  test("save button shows animated state on router settings save", async ({ page }) => {
    // Seed known state
    await page.request.patch("/api/v1/settings", {
      data: { mikrotik_url: "http://10.10.0.125", mikrotik_enabled: false },
    });

    await page.goto("/settings/router");
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Make a change to enable save
    await page.locator("#mt-url").fill("http://10.10.0.126");

    // Find the save button by data-testid
    const saveBtn = page.locator('[data-testid="save-button"]');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // After save, button should show "Saved" text briefly
    await expect(saveBtn).toContainText("Saved", { timeout: 5000 });
    // Success message should also appear
    await expect(page.getByText("MikroTik settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: "tests/screenshots/settings-router-save-animation.png",
    });
  });

  test("cloudflare page shows inline validation for account ID and tunnel ID", async ({ page }) => {
    await page.goto("/settings/cloudflare-tunnel");
    await expect(
      page.getByRole("heading", { name: "Cloudflare Tunnel", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Type invalid account ID
    await page.locator("#cf-account-id").fill("not-hex");
    await expect(page.getByText("Must be a 32-character hex string.")).toBeVisible();

    // Type valid account ID
    await page.locator("#cf-account-id").fill("1a2b3c4d5e6f7890abcdef1234567890");
    await expect(page.getByText("Must be a 32-character hex string.")).not.toBeVisible();

    // Type invalid tunnel ID
    await page.locator("#cf-tunnel-id").fill("not-a-uuid");
    await expect(page.getByText("Must be a valid UUID format.")).toBeVisible();

    // Type valid tunnel ID
    await page.locator("#cf-tunnel-id").fill("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    await expect(page.getByText("Must be a valid UUID format.")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-cloudflare-inline-validation.png",
    });
  });

  test("webhook page shows URL validation inline", async ({ page }) => {
    await page.goto("/settings/webhook");
    await expect(
      page.getByRole("heading", { name: "Webhook Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Type invalid URL
    await page.locator("#webhook-url").fill("not-a-url");
    await expect(page.getByText("Enter a valid URL (http:// or https://).")).toBeVisible();

    // Type valid URL
    await page.locator("#webhook-url").fill("https://ntfy.sh/test");
    await expect(page.getByText("Enter a valid URL (http:// or https://).")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-webhook-inline-validation.png",
    });
  });
});
