import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E tests for the Xiaomi router page (#489).
 *
 * Verifies that when the Xiaomi auth works (either SHA256 or plain password
 * fallback), the router page shows actual system stats instead of "?" marks.
 *
 * Uses route-level mocking because no real Xiaomi router is available in CI.
 */

// ── Mock data ────────────────────────────────────────────────

const MOCK_STATUS = {
  configured: true,
  reachable: true,
  cpu_cores: 4,
  cpu_freq: "880MHz",
  cpu_load: 0.12,
  mem_usage: 0.42,
  mem_total: "256MB",
  mem_type: "DDR3",
  temperature: 46,
  wan_download: "12345",
  wan_upload: "9876",
  devices_online: 7,
  devices_total: 11,
  uptime: "86400",
};

const MOCK_WAN_INFO = {
  ip: "203.0.113.42",
  gateway: "203.0.113.1",
  dns: "8.8.8.8, 1.1.1.1",
  wan_type: "dhcp",
  mask: "255.255.255.0",
  ipv6_status: "disabled",
};

const MOCK_WIFI_BANDS = [
  {
    ssid: "HomeWiFi",
    channel: "6",
    bandwidth: "20/40MHz",
    encryption: "WPA2-PSK",
    signal: null,
    status: "1",
    band_steering: "1",
  },
  {
    ssid: "HomeWiFi_5G",
    channel: "36",
    bandwidth: "80MHz",
    encryption: "WPA2-PSK",
    signal: null,
    status: "1",
    band_steering: "1",
  },
];

const MOCK_WIFI_DEVICES: unknown[] = [];

const MOCK_FIRMWARE = {
  configured: true,
  reachable: true,
  router_name: "Xiaomi BE3600",
  language: "en",
  rom_version: "1.0.67",
  hardware: "RB03",
  model: "xiaomi.router.rb03",
  country_code: "US",
  update_available: false,
  update_version: null,
};

// ── Mock setup ──────────────────────────────────────────────

async function mockXiaomiApis(page: Page) {
  await page.route("**/api/v1/xiaomi/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_STATUS),
    }),
  );
  await page.route("**/api/v1/xiaomi/wan-info", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WAN_INFO),
    }),
  );
  await page.route("**/api/v1/xiaomi/wifi-bands", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WIFI_BANDS),
    }),
  );
  await page.route("**/api/v1/xiaomi/wifi-devices", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WIFI_DEVICES),
    }),
  );
  await page.route("**/api/v1/xiaomi/firmware", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_FIRMWARE),
    }),
  );
}

/** Mock status endpoint to return auth-failure state (pre-fix behavior). */
async function mockXiaomiAuthFailure(page: Page) {
  await page.route("**/api/v1/xiaomi/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        reachable: true,
        cpu_cores: null,
        cpu_freq: null,
        cpu_load: null,
        mem_usage: null,
        mem_total: null,
        mem_type: null,
        temperature: null,
        wan_download: null,
        wan_upload: null,
        devices_online: null,
        devices_total: null,
        uptime: null,
      }),
    }),
  );
  // Authenticated endpoints return 502 when auth fails
  for (const path of ["wan-info", "wifi-bands", "wifi-devices"]) {
    await page.route(`**/api/v1/xiaomi/${path}`, (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: "{}" }),
    );
  }
  await page.route("**/api/v1/xiaomi/firmware", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        reachable: false,
        router_name: null,
        language: null,
        rom_version: null,
        hardware: null,
        model: null,
        country_code: null,
        update_available: false,
        update_version: null,
      }),
    }),
  );
}

// ── Enable Xiaomi integration helper ─────────────────────────

async function enableXiaomi(page: Page) {
  await page.goto("/settings/xiaomi-mesh/");
  await expect(page.locator("#xiaomi-ip")).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState("networkidle");

  const toggle = page.locator("#xiaomi-enabled");
  const checked = await toggle.getAttribute("aria-checked");
  if (checked !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }

  await page.locator("#xiaomi-ip").fill("10.10.0.199");
  await page.locator("#xiaomi-password").fill("test-password-e2e");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Xiaomi Mesh settings saved."),
  ).toBeVisible({ timeout: 10000 });
}

// ── Tests ────────────────────────────────────────────────────

test.describe("Xiaomi Router — auth fallback (#489)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await enableXiaomi(page);
  });

  test("shows real system stats when auth succeeds (post-fix)", async ({
    page,
  }) => {
    await mockXiaomiApis(page);
    await page.goto("/router/xiaomi/");

    // "System Stats" card should be visible with real values
    await expect(page.getByText("System Stats")).toBeVisible({
      timeout: 15000,
    });

    // CPU should show real cores and freq, NOT "?" marks
    await expect(page.getByText("4-core")).toBeVisible();
    await expect(page.getByText("880MHz")).toBeVisible();

    // Temperature should show real value
    await expect(page.getByText("46°C")).toBeVisible();

    // Devices online count should appear in the header
    await expect(page.getByText("7 devices online")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/xiaomi-auth-success.png",
    });
  });

  test("shows WAN info when auth succeeds", async ({ page }) => {
    await mockXiaomiApis(page);
    await page.goto("/router/xiaomi/");

    await expect(page.getByText("WAN Info")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("203.0.113.42")).toBeVisible();
    await expect(page.getByText("203.0.113.1")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wan-info.png",
    });
  });

  test("shows WiFi bands when auth succeeds", async ({ page }) => {
    await mockXiaomiApis(page);
    await page.goto("/router/xiaomi/");

    await expect(page.getByText("WiFi Bands")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("HomeWiFi")).toBeVisible();
    await expect(page.getByText("HomeWiFi_5G")).toBeVisible();
    await expect(page.getByText("2.4 GHz")).toBeVisible();
    await expect(page.getByText("5 GHz")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/xiaomi-wifi-bands.png",
    });
  });

  test("shows firmware info when auth succeeds", async ({ page }) => {
    await mockXiaomiApis(page);
    await page.goto("/router/xiaomi/");

    await expect(page.getByText("Firmware & Updates")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("1.0.67")).toBeVisible();
    await expect(page.getByText("RB03")).toBeVisible();
    await expect(page.getByText("Up to date")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/xiaomi-firmware.png",
    });
  });

  test("shows ? marks when auth fails (pre-fix behavior)", async ({
    page,
  }) => {
    await mockXiaomiAuthFailure(page);
    await page.goto("/router/xiaomi/");

    // System Stats should load but show "?" for missing values
    await expect(page.getByText("System Stats")).toBeVisible({
      timeout: 15000,
    });

    // CPU should show "?" marks since auth failed and data is null
    await expect(page.getByText("?-core")).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/xiaomi-auth-failure.png",
    });
  });
});
