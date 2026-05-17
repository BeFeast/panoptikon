import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

const now = new Date("2026-05-17T03:00:00Z").toISOString();

const devices = [
  {
    id: "device-alpha",
    mac: "AA:BB:CC:DD:EE:01",
    name: "Core Switch",
    hostname: "core-switch",
    vendor: "MikroTik",
    icon: "router",
    notes: null,
    is_known: true,
    is_favorite: false,
    first_seen_at: now,
    last_seen_at: now,
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
  },
  {
    id: "device-beta",
    mac: "AA:BB:CC:DD:EE:02",
    name: "Desk Laptop",
    hostname: "desk-laptop",
    vendor: "Framework",
    icon: "laptop",
    notes: null,
    is_known: false,
    is_favorite: false,
    first_seen_at: now,
    last_seen_at: now,
    is_online: false,
    ips: ["192.168.1.50"],
    mdns_services: null,
    agent: null,
    muted_until: null,
    os_family: "Linux",
    os_version: null,
    device_type: "laptop",
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
    location: null,
    owner: null,
    tags: "new",
    status_timeline: [true, false, false, false],
  },
];

const alerts = [
  {
    id: "alert-critical",
    type: "device_offline",
    device_id: "device-alpha",
    agent_id: null,
    message: "Core switch offline",
    details: "No ARP activity for 5 minutes",
    is_read: false,
    severity: "CRITICAL",
    acknowledged_at: null,
    acknowledged_by: null,
    created_at: now,
  },
  {
    id: "alert-info",
    type: "device_online",
    device_id: "device-beta",
    agent_id: null,
    message: "Desk laptop recovered",
    details: null,
    is_read: true,
    severity: "INFO",
    acknowledged_at: null,
    acknowledged_by: null,
    created_at: now,
  },
];

async function mockOperationsApis(page: Page) {
  await page.route("**/api/v1/alerts?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(alerts),
    }),
  );
  await page.route("**/api/v1/alerts/**", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/v1/alerts/mark-all-read", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/api/v1/devices", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(devices),
    }),
  );
  await page.route("**/api/v1/devices/*/sysinfo", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.route("**/api/v1/xiaomi/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false }),
    }),
  );
  await page.route("**/api/v1/topology/graph", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        router: {
          router_type: "mikrotik",
          is_online: true,
          wan_ip: "203.0.113.5",
          hostname: "edge-router",
          version: "7.15",
        },
        devices: devices.map((device) => ({
          id: device.id,
          mac: device.mac,
          name: device.name,
          hostname: device.hostname,
          vendor: device.vendor,
          is_online: device.is_online,
          ips: device.ips,
          custom_name: device.custom_name,
          custom_type: device.custom_type,
          custom_vendor: device.custom_vendor,
          device_type: device.device_type,
          device_model: device.device_model,
          device_brand: device.device_brand,
          mdns_services: device.mdns_services,
          icon: device.icon,
          first_seen_at: device.first_seen_at,
          last_seen_at: device.last_seen_at,
          os_family: device.os_family,
          os_version: device.os_version,
          location: device.location,
          owner: device.owner,
          tags: device.tags,
          rx_bps: 1200,
          tx_bps: 800,
        })),
        positions: [],
      }),
    }),
  );
  await page.route("**/api/v1/topology/positions", (route) =>
    route.fulfill({
      status: route.request().method() === "GET" ? 200 : 204,
      contentType: "application/json",
      body: "[]",
    }),
  );
}

test.describe("operations route renewal", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockOperationsApis(page);
  });

  test("alerts show two-pane triage and detail actions", async ({ page }) => {
    await page.goto("/alerts/");

    await expect(
      page.getByRole("heading", { name: "Alerts", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Severity")).toBeVisible();
    await expect(page.getByTestId("alert-row")).toHaveCount(2);

    await page
      .getByTestId("alert-row")
      .filter({ hasText: "Desk laptop recovered" })
      .click();
    const detail = page.locator("aside");
    await expect(detail.getByText("Desk laptop recovered")).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Acknowledge" }),
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "Mute" })).toBeVisible();
  });

  test("devices support selected-device deep links without fake data", async ({
    page,
  }) => {
    await page.goto("/devices?selected=device-alpha");

    await expect(page.getByText("192.168.1.2").first()).toBeVisible();
    await expect(page.getByText("New")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "core-switch" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByText("desk-laptop").click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "desk-laptop" }),
    ).toBeVisible();
  });

  test("topology renders renewed graph controls with persisted-position API", async ({
    page,
  }) => {
    await page.goto("/topology/");

    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("topology-auto-layout")).toBeVisible();
    await expect(page.getByTestId("topology-fit-view")).toBeVisible();
    await expect(page.getByText(/2 devices/)).toBeVisible();
  });
});
