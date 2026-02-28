import { test, expect, login } from "../../e2e/fixtures";

test.describe("Xiaomi Mesh Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
  });

  test("save default IP 10.10.0.199 persists after reload", async ({
    page,
  }) => {
    // The default IP is pre-filled in the form
    await expect(page.locator("#xiaomi-ip")).toHaveValue("10.10.0.199");

    // Tweak poll interval to make the form dirty so Save is enabled
    await page.locator("#xiaomi-poll-interval").fill("60");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });

    // IP must be 10.10.0.199 — not empty or null
    await expect(page.locator("#xiaomi-ip")).toHaveValue("10.10.0.199");

    await page.screenshot({
      path: "tests/screenshots/settings-xiaomi-default-ip.png",
    });
  });

  test("save non-default IP 10.10.0.1 persists after reload", async ({
    page,
  }) => {
    await page.locator("#xiaomi-ip").fill("10.10.0.1");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#xiaomi-ip")).toHaveValue("10.10.0.1");

    await page.screenshot({
      path: "tests/screenshots/settings-xiaomi-custom-ip.png",
    });
  });

  test("toggle enabled persists after reload", async ({ page }) => {
    const toggle = page.locator("#xiaomi-enabled");

    // Enable the integration
    const currentState = await toggle.getAttribute("aria-checked");
    if (currentState !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }

    // Password is required when enabled
    await page.locator("#xiaomi-password").fill("e2e-xiaomi-pass");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.screenshot({
      path: "tests/screenshots/settings-xiaomi-enabled.png",
    });
  });
});
