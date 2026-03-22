import { test, expect, login } from "../../e2e/fixtures";

test.describe("pfSense Settings — save / reload roundtrip", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/pfsense/");
    await expect(page.locator("#pf-host")).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("form renders with expected fields", async ({ page }) => {
    await expect(page.locator("#pf-enabled")).toBeVisible();
    await expect(page.locator("#pf-host")).toBeVisible();
    await expect(page.locator("#pf-port")).toBeVisible();
    await expect(page.locator("#pf-username")).toBeVisible();

    await expect(page.locator("#pf-host")).toHaveAttribute(
      "placeholder",
      "10.10.0.1",
    );

    await page.screenshot({
      path: "tests/screenshots/settings-pfsense-form.png",
    });
  });

  test("save and reload persists host, port, username and password", async ({
    page,
  }) => {
    const testHost = "10.10.0.99";
    const testPort = "2222";
    const testUser = "e2e-pfsense";

    await page.locator("#pf-host").fill(testHost);
    await page.locator("#pf-port").fill(testPort);
    await page.locator("#pf-username").fill(testUser);
    await page.locator("#pf-password").fill("e2e-secret-123");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("pfSense settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#pf-host")).toBeVisible({ timeout: 15000 });

    await expect(page.locator("#pf-host")).toHaveValue(testHost);
    await expect(page.locator("#pf-port")).toHaveValue(testPort);
    await expect(page.locator("#pf-username")).toHaveValue(testUser);

    // Secret fields show "(saved)" badge instead of actual value
    await expect(
      page.locator('label[for="pf-password"]'),
    ).toContainText("(saved)");

    await page.screenshot({
      path: "tests/screenshots/settings-pfsense-persisted.png",
    });
  });

  test("toggle enabled persists after reload", async ({ page }) => {
    const toggle = page.locator("#pf-enabled");
    const before = await toggle.getAttribute("aria-checked");
    const expected = before === "true" ? "false" : "true";

    await toggle.click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("pfSense settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-checked", expected);

    await page.screenshot({
      path: "tests/screenshots/settings-pfsense-toggle.png",
    });
  });

  test("Test Connection button is present and clickable", async ({ page }) => {
    await page.locator("#pf-host").fill("192.168.1.1");
    await page.locator("#pf-username").fill("admin");

    const testBtn = page.getByRole("button", { name: "Test Connection" });
    await expect(testBtn).toBeEnabled();

    await testBtn.click();

    // Connection will fail in test env but the button should trigger a response
    await expect(
      page.getByText(/Connected|unreachable|Failed|Error|refused/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("successful connection test auto-enables the integration toggle", async ({
    page,
  }) => {
    // Ensure toggle starts OFF
    const toggle = page.locator("#pf-enabled");
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      await toggle.click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(
        page.getByText("pfSense settings saved."),
      ).toBeVisible({ timeout: 10000 });
      await page.reload();
      await expect(toggle).toBeVisible({ timeout: 15000 });
    }
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Mock the test-connection API to return a successful response
    await page.route("**/api/v1/pfsense/test-connection", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          configured: true,
          reachable: true,
          hostname: "pfSense-test",
          version: "2.8.1-RELEASE",
        }),
      }),
    );

    await page.locator("#pf-host").fill("10.10.0.1");
    await page.locator("#pf-username").fill("admin");

    await page.getByRole("button", { name: "Test Connection" }).click();
    await expect(page.getByText(/Connected!/)).toBeVisible({ timeout: 10000 });

    // Toggle should be auto-enabled after successful connection
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // Save button should be enabled (dirty state from toggle change)
    await expect(
      page.getByRole("button", { name: "Save" }),
    ).toBeEnabled();

    await page.screenshot({
      path: "tests/screenshots/settings-pfsense-auto-enable.png",
    });
  });
});
