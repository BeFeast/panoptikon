import type { Page } from "@playwright/test";
import { test, expect, login } from "../../e2e/fixtures";

const DEFAULT_MIKROTIK_URL = "http://10.10.0.125";
const DEFAULT_XIAOMI_IP = "10.10.0.199";

async function seedSettings(page: Page) {
  const res = await page.request.patch("/api/v1/settings", {
    data: {
      mikrotik_enabled: false,
      mikrotik_url: DEFAULT_MIKROTIK_URL,
      mikrotik_user: "",
      mikrotik_password: "e2e-mikrotik-pass",
      xiaomi_mesh_enabled: false,
      xiaomi_mesh_ip: DEFAULT_XIAOMI_IP,
      xiaomi_mesh_password: "e2e-xiaomi-pass",
      xiaomi_mesh_poll_interval: 30,
    },
  });

  expect(res.ok()).toBeTruthy();
}

test.describe("Settings save/load — MikroTik and Xiaomi", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await seedSettings(page);
  });

  test("MikroTik settings save/load", async ({ page }) => {
    await page.goto("/settings/router");
    await expect(
      page.getByRole("heading", { name: "Router Settings", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const enableSwitch = page.locator("#mt-enabled");
    const urlInput = page.locator("#mt-url");
    const userInput = page.locator("#mt-user");

    await expect(urlInput).toHaveValue(DEFAULT_MIKROTIK_URL);
    await expect(enableSwitch).toHaveAttribute("aria-checked", "false");

    await enableSwitch.click();
    await urlInput.fill(DEFAULT_MIKROTIK_URL);
    await userInput.fill("admin");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("MikroTik settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();

    await expect(enableSwitch).toHaveAttribute("aria-checked", "true");
    await expect(urlInput).toHaveValue(DEFAULT_MIKROTIK_URL);
    await expect(userInput).toHaveValue("admin");
  });

  test("Xiaomi settings save default IP", async ({ page }) => {
    await page.goto("/settings/xiaomi-mesh");
    await expect(
      page.getByRole("heading", { name: "Xiaomi Mesh", level: 1 }),
    ).toBeVisible({ timeout: 15000 });

    const enableSwitch = page.locator("#xiaomi-enabled");
    const ipInput = page.locator("#xiaomi-ip");

    await ipInput.fill(DEFAULT_XIAOMI_IP);
    await enableSwitch.click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Xiaomi Mesh settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();

    await expect(enableSwitch).toHaveAttribute("aria-checked", "true");
    await expect(ipInput).toHaveValue(DEFAULT_XIAOMI_IP);
    expect(await ipInput.inputValue()).not.toBe("");
  });

  test("Xiaomi settings save non-default IP", async ({ page }) => {
    await page.goto("/settings/xiaomi-mesh");

    const enableSwitch = page.locator("#xiaomi-enabled");
    const ipInput = page.locator("#xiaomi-ip");

    await ipInput.fill("10.10.0.1");
    await enableSwitch.click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Xiaomi Mesh settings saved.")).toBeVisible({
      timeout: 10000,
    });

    await page.reload();

    await expect(ipInput).toHaveValue("10.10.0.1");
  });

  test("MikroTik Test Connection works without saving first", async ({ page }) => {
    const presetRes = await page.request.patch("/api/v1/settings", {
      data: {
        mikrotik_url: "http://10.10.0.250",
        mikrotik_user: "saved-user",
        mikrotik_password: "saved-pass",
        mikrotik_enabled: false,
      },
    });
    expect(presetRes.ok()).toBeTruthy();

    await page.goto("/settings/router");

    await page.locator("#mt-url").fill(DEFAULT_MIKROTIK_URL);
    await page.locator("#mt-user").fill("admin");
    await page.locator("#mt-password").fill("unsaved-pass");

    const [request, response] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.method() === "POST" &&
          req.url().includes("/api/v1/mikrotik/test-connection"),
      ),
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/api/v1/mikrotik/test-connection"),
      ),
      page.getByRole("button", { name: "Test Connection" }).click(),
    ]);

    const body = JSON.parse(request.postData() ?? "{}");
    expect(body).toMatchObject({
      url: DEFAULT_MIKROTIK_URL,
      user: "admin",
      password: "unsaved-pass",
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.configured).toBe(true);

    await expect(page.getByText("Save URL and API key first.")).toHaveCount(0);
  });
});
