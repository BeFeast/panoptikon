import { test, expect, login } from "../../e2e/fixtures";

test.describe("Router Settings — MikroTik", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/router/");
    // MikroTik tab is active by default
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });
  });

  test("default URL placeholder shows 10.10.0.125", async ({ page }) => {
    await expect(page.locator("#mt-url")).toHaveAttribute(
      "placeholder",
      "http://10.10.0.125",
    );
  });

  test("save and reload persists URL, user and password", async ({ page }) => {
    const testUrl = "http://10.10.0.125";
    const testUser = "e2e-admin";

    await page.locator("#mt-url").fill(testUrl);
    await page.locator("#mt-user").fill(testUser);
    await page.locator("#mt-password").fill("e2e-pass-123");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#mt-url")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#mt-url")).toHaveValue(testUrl);
    await expect(page.locator("#mt-user")).toHaveValue(testUser);
    // Password is never returned; the "(saved)" badge confirms it was stored
    await expect(
      page.locator('label[for="mt-password"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/settings-mikrotik-persisted.png",
    });
  });

  test("toggle enabled persists after reload", async ({ page }) => {
    const toggle = page.locator("#mt-enabled");
    const before = await toggle.getAttribute("aria-checked");
    const expected = before === "true" ? "false" : "true";

    await toggle.click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("MikroTik settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-checked", expected);
  });

  test("Test Connection works with unsaved form values", async ({ page }) => {
    // Fill URL without saving
    await page.locator("#mt-url").fill("http://192.168.88.1");
    await page.locator("#mt-user").fill("admin");

    const testBtn = page.getByRole("button", { name: "Test Connection" });
    await expect(testBtn).toBeEnabled();

    await testBtn.click();

    // Any response (success or error) means the button worked without prior save.
    // "Router URL is required." would indicate unsaved values were ignored.
    await expect(
      page.getByText(/Connected|unreachable|Failed to test/),
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Router Settings — VyOS", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/router/");
    // Switch to VyOS tab
    await page.getByRole("tab", { name: /VyOS/ }).click();
    await expect(page.locator("#vyos-url")).toBeVisible({ timeout: 15000 });
  });

  test("save and reload persists URL and API key", async ({ page }) => {
    const testUrl = "https://10.10.0.50";

    await page.locator("#vyos-url").fill(testUrl);
    await page.locator("#vyos-key").fill("e2e-api-key-123");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("VyOS settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();
    await page.getByRole("tab", { name: /VyOS/ }).click();
    await expect(page.locator("#vyos-url")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#vyos-url")).toHaveValue(testUrl);
    await expect(
      page.locator('label[for="vyos-key"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/settings-vyos-persisted.png",
    });
  });
});
