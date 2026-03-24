import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings — Email Notifications (SMTP)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("email settings page loads with heading", async ({ page }) => {
    await page.goto("/settings/email");
    await expect(
      page.getByRole("heading", { name: "Email Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "tests/screenshots/settings-email-page.png",
      fullPage: true,
    });
  });

  test("SMTP settings save and reload roundtrip", async ({ page }) => {
    // Seed settings via API
    const seedRes = await page.request.patch("/api/v1/settings", {
      data: {
        smtp_host: "smtp.e2etest.com",
        smtp_port: 587,
        smtp_username: "e2euser",
        smtp_password: "e2epass",
        smtp_from_email: "from@e2etest.com",
        smtp_to_email: "to@e2etest.com",
        smtp_tls_enabled: true,
      },
    });
    expect(seedRes.ok()).toBeTruthy();

    // Verify via GET settings
    const getRes = await page.request.get("/api/v1/settings");
    const settings = await getRes.json();
    expect(settings.smtp_host).toBe("smtp.e2etest.com");
    expect(settings.smtp_port).toBe(587);
    expect(settings.smtp_username).toBe("e2euser");
    expect(settings.smtp_password_set).toBe(true);
    expect(settings.smtp_from_email).toBe("from@e2etest.com");
    expect(settings.smtp_to_email).toBe("to@e2etest.com");
    expect(settings.smtp_tls_enabled).toBe(true);

    // Load the page and verify fields
    await page.goto("/settings/email");
    await expect(
      page.getByRole("heading", { name: "Email Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#smtp-host")).toHaveValue("smtp.e2etest.com");
    await expect(page.locator("#smtp-port")).toHaveValue("587");
    await expect(page.locator("#smtp-username")).toHaveValue("e2euser");
    await expect(page.locator("#smtp-from")).toHaveValue("from@e2etest.com");
    await expect(page.locator("#smtp-to")).toHaveValue("to@e2etest.com");

    await page.screenshot({
      path: "tests/screenshots/settings-email-loaded.png",
      fullPage: true,
    });
  });

  test("SMTP settings are included in settings API response", async ({
    page,
  }) => {
    const res = await page.request.get("/api/v1/settings");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    // SMTP fields should exist (even if null by default)
    expect("smtp_host" in data).toBeTruthy();
    expect("smtp_port" in data).toBeTruthy();
    expect("smtp_password_set" in data).toBeTruthy();
    expect("smtp_tls_enabled" in data).toBeTruthy();
  });
});
