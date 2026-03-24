import type { Page } from "@playwright/test";
import { test, expect, login } from "../../e2e/fixtures";

async function seedSmtpSettings(page: Page) {
  const res = await page.request.patch("/api/v1/settings", {
    data: {
      smtp_enabled: false,
      smtp_host: "smtp.example.com",
      smtp_port: 587,
      smtp_username: "testuser",
      smtp_password: "testpass",
      smtp_from_email: "alerts@example.com",
      smtp_tls: true,
    },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Settings — SMTP Email Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await seedSmtpSettings(page);
  });

  test("SMTP settings page loads with seeded values", async ({ page }) => {
    await page.goto("/settings/smtp");
    await expect(
      page.getByRole("heading", { name: "Email Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("SMTP Configuration")).toBeVisible();
    await expect(page.locator("#smtp-host")).toHaveValue("smtp.example.com");
    await expect(page.locator("#smtp-port")).toHaveValue("587");
    await expect(page.locator("#smtp-username")).toHaveValue("testuser");
    await expect(page.locator("#smtp-from")).toHaveValue(
      "alerts@example.com",
    );
  });

  test("SMTP settings save/reload roundtrip", async ({ page }) => {
    await page.goto("/settings/smtp");
    await expect(
      page.getByRole("heading", { name: "Email Notifications", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");

    // Toggle enabled
    const enableSwitch = page.locator("#smtp-enabled");
    await enableSwitch.click();

    // Update host
    const hostInput = page.locator("#smtp-host");
    await hostInput.fill("smtp.gmail.com");

    // Update port
    const portInput = page.locator("#smtp-port");
    await portInput.fill("465");

    // Save
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("SMTP settings saved.")).toBeVisible({
      timeout: 10000,
    });

    // Reload and verify
    await page.reload();
    await expect(hostInput).toHaveValue("smtp.gmail.com", { timeout: 15000 });
    await expect(portInput).toHaveValue("465");
  });
});
