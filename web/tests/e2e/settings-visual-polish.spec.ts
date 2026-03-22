import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings visual polish — sections, validation, save animation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("scanner page shows two visual sections with icons", async ({ page }) => {
    await page.goto("/settings/scanner/");
    await expect(
      page.getByRole("heading", { name: "Network Scanner", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Two section cards with distinct headers
    await expect(page.getByText("Scan Configuration")).toBeVisible();
    await expect(page.getByText("Enrichment Sources")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-scanner-sections.png",
    });
  });

  test("retention page shows two visual sections", async ({ page }) => {
    await page.goto("/settings/retention/");
    await expect(
      page.getByRole("heading", { name: "Data Retention", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Retention Periods")).toBeVisible();
    await expect(page.getByText("Database Maintenance")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-retention-sections.png",
    });
  });

  test("scanner inline validation shows error for interval < 10", async ({
    page,
  }) => {
    await page.goto("/settings/scanner/");
    await expect(page.locator("#scan-interval")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Type an invalid interval
    await page.locator("#scan-interval").fill("5");

    // Inline error message should appear
    await expect(page.getByText("Must be at least 10 seconds")).toBeVisible();

    // Fix the value
    await page.locator("#scan-interval").fill("30");

    // Error should disappear and checkmark should appear
    await expect(
      page.getByText("Must be at least 10 seconds"),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-scanner-validation.png",
    });
  });

  test("save button shows animated success state", async ({ page }) => {
    await page.goto("/settings/scanner/");
    await expect(page.locator("#scan-interval")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Make a change to enable save
    const currentVal = await page.locator("#scan-interval").inputValue();
    const newVal = currentVal === "60" ? "90" : "60";
    await page.locator("#scan-interval").fill(newVal);

    // Click save
    await page.getByRole("button", { name: "Save" }).click();

    // Button should briefly show "Saved" text
    await expect(
      page.getByRole("button", { name: "Saved" }),
    ).toBeVisible({ timeout: 10000 });

    // Success message should also appear
    await expect(page.getByText("Scanner settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({
      path: "tests/screenshots/settings-save-animation.png",
    });

    // Restore original value
    await page.locator("#scan-interval").fill(currentVal);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Scanner settings saved.")).toBeVisible({
      timeout: 10000,
    });
  });

  test("password page shows strength meter", async ({ page }) => {
    await page.goto("/settings/password/");
    await expect(
      page.getByRole("heading", { name: "Change Password", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Type a short password — should show "Weak"
    await page.locator("#new").fill("abc");
    await expect(page.getByText("Weak")).toBeVisible();

    // Requirements should show inline
    await expect(page.getByText("At least 8 characters")).toBeVisible();
    await expect(page.getByText("Special character")).toBeVisible();

    // Type a strong password — should show "Strong"
    await page.locator("#new").fill("MyStr0ng!Pass99");
    await expect(page.getByText("Strong")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-password-strength.png",
    });
  });

  test("password confirm inline validation", async ({ page }) => {
    await page.goto("/settings/password/");
    await expect(page.locator("#new")).toBeVisible({ timeout: 15000 });

    await page.locator("#new").fill("StrongPass1!");
    await page.locator("#confirm").fill("mismatch");

    // Should show mismatch error inline
    await expect(page.getByText("Passwords do not match")).toBeVisible();

    // Fix the confirmation
    await page.locator("#confirm").fill("StrongPass1!");
    await expect(
      page.getByText("Passwords do not match"),
    ).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-password-confirm-validation.png",
    });
  });

  test("webhook URL inline validation", async ({ page }) => {
    await page.goto("/settings/webhook/");
    await expect(page.locator("#webhook-url")).toBeVisible({ timeout: 15000 });

    // Type an invalid URL
    await page.locator("#webhook-url").fill("not-a-url");
    await expect(
      page.getByText("Enter a valid URL"),
    ).toBeVisible();

    // Type a valid URL
    await page.locator("#webhook-url").fill("https://hooks.slack.com/test");
    await expect(page.getByText("Enter a valid URL")).not.toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-webhook-validation.png",
    });
  });
});
