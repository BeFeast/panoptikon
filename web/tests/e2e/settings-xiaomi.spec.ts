import { test, expect, login } from "../../e2e/fixtures";

test.describe("Xiaomi Mesh Settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/xiaomi-mesh/");
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
    // Wait for the settings API call to complete so tests don't race with it
    await page.waitForLoadState("networkidle");
  });

  test("save default IP 10.10.0.199 persists after reload", async ({
    page,
  }) => {
    // Explicitly clear and set the default IP to ensure a known state
    // regardless of what the database contains from previous test runs
    // (avoids test-pollution and browser autofill overriding the value).
    await page.locator("#xiaomi-ip").clear();
    await page.locator("#xiaomi-ip").fill("10.10.0.199");
    await expect(page.locator("#xiaomi-ip")).toHaveValue("10.10.0.199");

    // Tweak poll interval to make the form dirty so Save is enabled
    await page.locator("#xiaomi-poll-interval").fill("60");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
    // Wait for the settings API to finish loading before asserting persisted values
    await page.waitForLoadState("networkidle");

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

  test.skip("disabled persists after reload", async ({ page }) => {
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

  test("password persists after save and reload (shows saved badge)", async ({
    page,
  }) => {
    // Enable integration so password field is relevant
    const toggle = page.locator("#xiaomi-enabled");
    const currentState = await toggle.getAttribute("aria-checked");
    if (currentState !== "true") {
      await toggle.click();
    }

    // Fill and save password
    await page.locator("#xiaomi-password").fill("e2e-password-roundtrip");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    // Reload and verify password was stored
    await page.reload();
    await expect(page.locator("#xiaomi-password")).toBeVisible({
      timeout: 15000,
    });

    // The "(saved)" badge next to the password label confirms it was stored
    await expect(
      page.locator('label[for="xiaomi-password"]'),
    ).toContainText("(saved)");

    // Password field should be empty (not echoed back) with a placeholder hint
    await expect(page.locator("#xiaomi-password")).toHaveValue("");

    await page.screenshot({
      path: "tests/screenshots/settings-xiaomi-password-saved.png",
    });
  });

  test("poll interval persists after save and reload", async ({ page }) => {
    await page.locator("#xiaomi-poll-interval").fill("120");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Xiaomi Mesh settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#xiaomi-poll-interval")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.locator("#xiaomi-poll-interval")).toHaveValue("120");

    await page.screenshot({
      path: "tests/screenshots/settings-xiaomi-poll-interval.png",
    });
  });
});
