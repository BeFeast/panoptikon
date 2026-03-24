import { test, expect, login } from "../../e2e/fixtures";

test.describe("Settings — SNMP Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("SNMP settings page loads", async ({ page }) => {
    await page.goto("/settings/snmp");
    await expect(
      page.getByRole("heading", { name: "SNMP Configuration", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("SNMP Managed Devices")).toBeVisible();
  });

  test("Create and delete SNMP config roundtrip", async ({ page }) => {
    await page.goto("/settings/snmp");
    await expect(
      page.getByRole("heading", { name: "SNMP Configuration", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    // Open create form
    await page.getByRole("button", { name: "Add SNMP Device" }).click();
    await expect(page.getByText("New SNMP Configuration")).toBeVisible();

    // Fill form
    await page.locator("#snmp-device-name").fill("E2E Router");
    await page.locator("#snmp-host").fill("10.0.0.99");
    await page.locator("#snmp-port").fill("161");
    await page.locator("#snmp-community").fill("e2e-community");
    await page.locator("#snmp-version").selectOption("v2c");

    // Create
    await page.getByRole("button", { name: "Add Configuration" }).click();
    await expect(page.getByText("SNMP configuration created.")).toBeVisible({
      timeout: 10000,
    });

    // Verify config appears in list
    await expect(page.getByText("E2E Router")).toBeVisible();
    await expect(page.getByText("10.0.0.99:161")).toBeVisible();

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByText("E2E Router")).toBeVisible({
      timeout: 15000,
    });

    // Cleanup via API
    const listRes = await page.request.get("/api/v1/snmp-configs");
    const configs = await listRes.json();
    const testConfig = configs.find(
      (c: { device_name: string }) => c.device_name === "E2E Router",
    );
    if (testConfig) {
      await page.request.delete(`/api/v1/snmp-configs/${testConfig.id}`);
    }
  });

  test("SNMP config CRUD via API", async ({ page }) => {
    // Create
    const createRes = await page.request.post("/api/v1/snmp-configs", {
      data: {
        device_name: "API Router",
        host: "10.0.0.100",
        port: 161,
        community: "private",
        version: "v2c",
      },
    });
    expect(createRes.ok() || createRes.status() === 201).toBeTruthy();
    const created = await createRes.json();

    // List
    const listRes = await page.request.get("/api/v1/snmp-configs");
    expect(listRes.ok()).toBeTruthy();
    const configs = await listRes.json();
    expect(
      configs.some(
        (c: { device_name: string }) => c.device_name === "API Router",
      ),
    ).toBeTruthy();

    // Update
    const updateRes = await page.request.put(
      `/api/v1/snmp-configs/${created.id}`,
      {
        data: { community: "updated-community" },
      },
    );
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.community).toBe("updated-community");

    // Delete
    const deleteRes = await page.request.delete(
      `/api/v1/snmp-configs/${created.id}`,
    );
    expect(deleteRes.ok() || deleteRes.status() === 204).toBeTruthy();
  });
});
