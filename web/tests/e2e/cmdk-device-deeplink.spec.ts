import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

const device = {
  id: "device-alpha",
  mac: "AA:BB:CC:DD:EE:01",
  name: "Core Switch",
  hostname: "core-switch",
  vendor: "MikroTik",
  icon: "router",
  notes: null,
  is_known: true,
  is_favorite: false,
  first_seen_at: "2026-05-17T03:00:00.000Z",
  last_seen_at: "2026-05-17T03:00:00.000Z",
  is_online: true,
  ips: ["192.168.1.2"],
  mdns_services: null,
  agent: null,
  muted_until: null,
  os_family: "RouterOS",
  os_version: null,
  device_type: "router",
  device_model: null,
  device_brand: null,
  enrichment_source: null,
  enrichment_corrected: null,
  is_randomized_mac: false,
  custom_name: null,
  custom_type: null,
  custom_os: null,
  custom_vendor: null,
  custom_model: null,
  icon_override: null,
  is_manual: false,
  location: "Rack",
  owner: "NetOps",
  tags: "core,router",
  status_timeline: [true, true, true, true],
};

async function mockDeviceSearch(page: Page) {
  await page.route("**/api/v1/devices", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([device]),
    }),
  );
  await page.route("**/api/v1/devices/*/sysinfo", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.route("**/api/v1/search?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        devices: [
          {
            id: device.id,
            name: device.name,
            hostname: device.hostname,
            vendor: device.vendor,
            ip_address: device.ips[0],
            mac_address: device.mac,
            is_online: device.is_online,
          },
        ],
        agents: [],
        ssh_targets: [],
        assets: [],
      }),
    }),
  );
}

test.describe("Command+K device deep-link (#741)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockDeviceSearch(page);
  });

  test("navigating to /devices?selected=<id> opens device detail sheet", async ({
    page,
  }) => {
    await page.goto(`/devices?selected=${device.id}`);
    const sheet = page.locator('[role="dialog"][data-state="open"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(
      sheet.getByRole("heading", { name: "core-switch" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/devices$/, { timeout: 10000 });

    await page.screenshot({
      path: "tests/screenshots/cmdk-deeplink-selected-opens-sheet.png",
      fullPage: true,
    });
  });

  test("Command+K device search navigates to devices page with selected", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("Control+k");
    const dialogContent = page.locator("[cmdk-dialog]");
    await expect(dialogContent).toBeVisible({ timeout: 3000 });

    const searchInput = page.locator("[cmdk-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill(device.name);

    const firstDeviceItem = page
      .locator('[cmdk-item][data-value^="device "]')
      .first();
    await expect(firstDeviceItem).toBeVisible({ timeout: 3000 });
    await firstDeviceItem.click();

    await expect(page).toHaveURL(/\/devices$/, { timeout: 10000 });

    const sheet = page.locator('[role="dialog"][data-state="open"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(
      sheet.getByRole("heading", { name: "core-switch" }),
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/cmdk-deeplink-search-opens-sheet.png",
      fullPage: true,
    });
  });
});
