import { test, expect, login } from "../../e2e/fixtures";

test.describe("SNMP Configuration — save / reload roundtrip", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/settings/snmp/");
    await expect(page.locator("#snmp-community")).toBeVisible({
      timeout: 15000,
    });
    await page.waitForLoadState("networkidle");
  });

  test("form renders with expected fields", async ({ page }) => {
    await expect(page.locator("#snmp-community")).toBeVisible();
    await expect(page.locator("#snmp-version")).toBeVisible();
    await expect(page.locator("#snmp-port")).toBeVisible();
    await expect(page.locator("#snmp-trap-enabled")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/settings-snmp-form.png",
    });
  });

  test("save and reload persists SNMP settings", async ({ page }) => {
    const testCommunity = "e2e-community";
    const testPort = "1610";

    await page.locator("#snmp-community").fill(testCommunity);
    await page.locator("#snmp-version").selectOption("v3");
    await page.locator("#snmp-port").fill(testPort);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("SNMP settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#snmp-community")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.locator("#snmp-community")).toHaveValue(testCommunity);
    await expect(page.locator("#snmp-version")).toHaveValue("v3");
    await expect(page.locator("#snmp-port")).toHaveValue(testPort);

    await page.screenshot({
      path: "tests/screenshots/settings-snmp-persisted.png",
    });
  });

  test("enabling traps reveals trap target field", async ({ page }) => {
    const trapCheckbox = page.locator("#snmp-trap-enabled");

    // Enable traps
    if (!(await trapCheckbox.isChecked())) {
      await trapCheckbox.click();
    }

    await expect(page.locator("#snmp-trap-target")).toBeVisible();

    await page.locator("#snmp-trap-target").fill("10.0.0.1:162");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("SNMP settings saved."),
    ).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.locator("#snmp-trap-enabled")).toBeVisible({
      timeout: 15000,
    });

    // Trap should still be enabled and target persisted
    await expect(page.locator("#snmp-trap-enabled")).toBeChecked();
    await expect(page.locator("#snmp-trap-target")).toHaveValue("10.0.0.1:162");

    await page.screenshot({
      path: "tests/screenshots/settings-snmp-traps.png",
    });
  });

  test("settings page links to SNMP configuration", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("SNMP")).toBeVisible({ timeout: 10000 });
  });
});
