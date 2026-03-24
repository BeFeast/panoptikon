import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings — SNMP Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("SNMP settings page loads with heading", async ({ page }) => {
    await page.goto("/settings/snmp");
    await expect(
      page.getByRole("heading", { name: "SNMP Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "tests/screenshots/settings-snmp-page.png",
      fullPage: true,
    });
  });

  test("SNMP config API roundtrip", async ({ page }) => {
    // Update SNMP config
    const updateRes = await page.request.patch("/api/v1/snmp/config", {
      data: {
        enabled: true,
        community: "e2ecommunity",
        version: "2c",
        port: 162,
        timeout_seconds: 10,
        retries: 3,
      },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.config.enabled).toBe(true);
    expect(updated.config.community).toBe("e2ecommunity");
    expect(updated.config.port).toBe(162);
    expect(updated.config.timeout_seconds).toBe(10);
    expect(updated.config.retries).toBe(3);

    // Verify via GET
    const getRes = await page.request.get("/api/v1/snmp/config");
    expect(getRes.ok()).toBeTruthy();
    const data = await getRes.json();
    expect(data.config.enabled).toBe(true);
    expect(data.config.community).toBe("e2ecommunity");
    expect(data.config.port).toBe(162);
  });

  test("SNMP settings save and reload in UI", async ({ page }) => {
    // Seed via API
    await page.request.patch("/api/v1/snmp/config", {
      data: {
        enabled: true,
        community: "testcommunity",
        version: "2c",
        port: 161,
        timeout_seconds: 5,
        retries: 1,
      },
    });

    // Load page
    await page.goto("/settings/snmp");
    await expect(
      page.getByRole("heading", { name: "SNMP Management", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Verify fields loaded
    await expect(page.locator("#snmp-community")).toHaveValue("testcommunity");
    await expect(page.locator("#snmp-port")).toHaveValue("161");
    await expect(page.locator("#snmp-timeout")).toHaveValue("5");
    await expect(page.locator("#snmp-retries")).toHaveValue("1");

    await page.screenshot({
      path: "tests/screenshots/settings-snmp-loaded.png",
      fullPage: true,
    });

    // Reset to defaults
    await page.request.patch("/api/v1/snmp/config", {
      data: {
        enabled: false,
        community: "public",
        version: "2c",
        port: 161,
        timeout_seconds: 5,
        retries: 1,
      },
    });
  });
});
