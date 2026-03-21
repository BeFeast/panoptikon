import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings pages: visual sections, inline validation, save animation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("password page shows strength meter and inline validation", async ({ page }) => {
    await page.goto("/settings/password");
    await expect(
      page.getByRole("heading", { name: "Change Password", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Verify SettingsSection renders with icon badge
    await expect(page.getByText("Password")).toBeVisible();

    // Type a short password — strength meter should appear
    const newPwInput = page.locator("#new");
    await newPwInput.fill("abc");

    // Strength meter bars should be visible
    const strengthBars = page.locator('[class*="bg-gradient-to-r"]');
    await expect(strengthBars.first()).toBeVisible();

    // "Min. 8 characters required" text should appear
    await expect(page.getByText("Min. 8 characters required")).toBeVisible();

    // Inline validation icon should show invalid state
    const invalidIcon = page.locator('[class*="text-rose-400"]').first();
    await expect(invalidIcon).toBeVisible();

    // Type a strong password
    await newPwInput.fill("StrongP@ssw0rd!");

    // Should no longer show the min length warning
    await expect(page.getByText("Min. 8 characters required")).not.toBeVisible();

    // Should show "Strong password" or similar
    await expect(page.getByText(/password$/)).toBeVisible();

    // Confirm field - type mismatch
    const confirmInput = page.locator("#confirm");
    await confirmInput.fill("different");
    await expect(page.getByText("Passwords do not match.")).toBeVisible();

    // Fix mismatch
    await confirmInput.fill("StrongP@ssw0rd!");
    await expect(page.getByText("Passwords do not match.")).not.toBeVisible();

    // Valid checkmark should show
    const validIcon = page.locator('#confirm').locator('..').locator('[class*="text-emerald-400"]');
    await expect(validIcon.first()).toBeVisible();

    await page.screenshot({ path: "test-results/password-validation.png", fullPage: true });
  });

  test("scanner page has multiple visual sections", async ({ page }) => {
    await page.goto("/settings/scanner");
    await expect(
      page.getByRole("heading", { name: "Network Scanner", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should have two separate SettingsSection cards
    const sectionCards = page.locator('[class*="border-slate-800"][class*="bg-slate-900"]');
    await expect(sectionCards).toHaveCount(2);

    // First section: "Scan Settings"
    await expect(page.getByText("Scan Settings")).toBeVisible();

    // Second section: "Enrichment Sources"
    await expect(page.getByText("Enrichment Sources")).toBeVisible();

    // Inline validation: enter invalid scan interval
    const intervalInput = page.locator("#scan-interval");
    await intervalInput.fill("5");
    await expect(page.getByText("Must be at least 10 seconds.")).toBeVisible();

    // Fix it
    await intervalInput.fill("30");
    await expect(page.getByText("Must be at least 10 seconds.")).not.toBeVisible();

    // Valid checkmark icon should appear on the interval input
    const validIcon = page.locator('#scan-interval').locator('..').locator('[class*="text-emerald-400"]');
    await expect(validIcon.first()).toBeVisible();

    await page.screenshot({ path: "test-results/scanner-sections.png", fullPage: true });
  });

  test("retention page has visual sections with inline validation", async ({ page }) => {
    await page.goto("/settings/retention");
    await expect(
      page.getByRole("heading", { name: "Data Retention", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Should have two section cards (Retention Policy + Database)
    const sectionCards = page.locator('[class*="border-slate-800"][class*="bg-slate-900"]');
    await expect(sectionCards).toHaveCount(2);

    await expect(page.getByText("Retention Policy")).toBeVisible();
    await expect(page.getByText("Database")).toBeVisible();

    // Inline validation: set invalid traffic hours
    const trafficInput = page.locator("#ret-traffic");
    await trafficInput.fill("0");
    await expect(page.getByText("Must be at least 1 hour.")).toBeVisible();

    await trafficInput.fill("24");
    await expect(page.getByText("Must be at least 1 hour.")).not.toBeVisible();

    await page.screenshot({ path: "test-results/retention-sections.png", fullPage: true });
  });

  test("webhook page shows validated input for URL", async ({ page }) => {
    await page.goto("/settings/webhook");
    await expect(
      page.getByRole("heading", { name: "Webhook Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // SettingsSection card with icon should be visible
    await expect(page.getByText("Webhook Configuration")).toBeVisible();

    // Type invalid URL
    const urlInput = page.locator("#webhook-url");
    await urlInput.fill("not-a-url");
    await expect(page.getByText("Enter a valid URL.")).toBeVisible();

    // Type valid URL
    await urlInput.fill("https://ntfy.sh/test");
    await expect(page.getByText("Enter a valid URL.")).not.toBeVisible();

    await page.screenshot({ path: "test-results/webhook-validation.png", fullPage: true });
  });

  test("save button shows animated success state", async ({ page }) => {
    // Seed a known state
    await page.request.patch("/api/v1/settings", {
      data: { webhook_url: "" },
    });

    await page.goto("/settings/webhook");
    await expect(
      page.getByRole("heading", { name: "Webhook Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    const urlInput = page.locator("#webhook-url");
    await urlInput.fill("https://example.com/webhook");

    const saveButton = page.getByRole("button", { name: "Save" });
    await saveButton.click();

    // Save button should show "Saved" text briefly
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible({
      timeout: 5000,
    });

    // Should also show success message
    await expect(page.getByText("Webhook URL saved.")).toBeVisible();

    await page.screenshot({ path: "test-results/save-animation.png", fullPage: true });
  });
});
