import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * Refs #806 — pfSense router page hash subroutes must switch panels.
 *
 * Each tab on /router/pfsense is addressable by its URL hash
 * (#system, #interfaces, #firewall, #dhcp, #dns, #services, #routing,
 * #config). Direct URL loads, in-page tab clicks, and browser back/forward
 * must all stay in sync with the active panel. Invalid hashes must fall
 * back to the default (system) panel without breaking the page.
 *
 * The tests route-mock pfSense endpoints so they pass in CI with no real
 * firewall available.
 */

async function mockPfsenseApis(page: Page) {
  // Catch-all for any pfSense endpoint we don't override below.
  await page.route("**/api/v1/pfsense/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route("**/api/v1/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mikrotik_enabled: false,
          pfsense_enabled: true,
          xiaomi_mesh_enabled: false,
          default_router: "pfsense",
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/v1/pfsense/status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        reachable: true,
        hostname: "pfSense-test",
        domain: "localdomain",
        version: "2.7.0",
        uptime: "1 day",
        cpu_usage: 5,
        memory_total: 8 * 1024 * 1024 * 1024,
        memory_used: 2 * 1024 * 1024 * 1024,
        platform: "amd64",
      }),
    }),
  );

  await page.route("**/api/v1/pfsense/interfaces", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "wan",
          descr: "WAN",
          iface_type: "ethernet",
          status: "up",
          ip_address: "203.0.113.1",
          subnet: 24,
          mac: "aa:bb:cc:dd:ee:01",
          mtu: 1500,
        },
        {
          name: "lan",
          descr: "LAN",
          iface_type: "ethernet",
          status: "up",
          ip_address: "192.168.1.1",
          subnet: 24,
          mac: "aa:bb:cc:dd:ee:02",
          mtu: 1500,
        },
      ]),
    }),
  );

  await page.route("**/api/v1/pfsense/firewall/rules", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          tracker: "1700000001",
          interface: "wan",
          action: "pass",
          source: "any",
          destination: "any",
          description: "Allow HTTPS",
          disabled: false,
        },
      ]),
    }),
  );

  await page.route("**/api/v1/pfsense/dhcp/leases", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          ip: "192.168.1.100",
          mac: "aa:bb:cc:dd:ee:99",
          hostname: "test-device",
          start: "2026-05-21T10:00:00Z",
          end: "2026-05-22T10:00:00Z",
          status: "active",
          interface: "lan",
        },
      ]),
    }),
  );
}

const HASH_TO_PANEL: Record<string, string> = {
  system: "pfsense-panel-system",
  dns: "pfsense-panel-dns",
  services: "pfsense-panel-services",
  routing: "pfsense-panel-routing",
  config: "pfsense-panel-config",
};

async function expectTabActive(page: Page, tabId: string) {
  await expect(page.getByTestId(`router-tab-${tabId}`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

test.describe("pfSense router hash subroutes (#806)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
  });

  for (const tabId of [
    "system",
    "interfaces",
    "firewall",
    "dhcp",
    "dns",
    "services",
    "routing",
    "config",
  ] as const) {
    test(`direct navigation to #${tabId} activates the ${tabId} tab`, async ({
      page,
    }) => {
      await page.goto(`/router/pfsense/#${tabId}`);
      await expect(page.getByTestId("router-tabs")).toBeVisible({
        timeout: 25_000,
      });
      await expectTabActive(page, tabId);

      const expectedPanel = HASH_TO_PANEL[tabId];
      if (expectedPanel) {
        await expect(page.getByTestId(expectedPanel)).toBeVisible({
          timeout: 15_000,
        });
      } else {
        // For interfaces / firewall / dhcp the panel is the literal-port
        // table card. Verify the heading rendered by RouterPage.
        const headings: Record<string, string> = {
          interfaces: "Interfaces",
          firewall: "Firewall rules",
          dhcp: "DHCP leases",
        };
        await expect(
          page.getByRole("heading", { name: headings[tabId] }),
        ).toBeVisible({ timeout: 15_000 });
      }
    });
  }

  test("clicking a tab updates the URL hash and switches the panel", async ({
    page,
  }) => {
    await page.goto("/router/pfsense/");
    await expect(page.getByTestId("router-tabs")).toBeVisible({
      timeout: 25_000,
    });

    await page.getByTestId("router-tab-dhcp").click();
    await expect(page).toHaveURL(/\/router\/pfsense\/?#dhcp$/);
    await expectTabActive(page, "dhcp");
    await expect(
      page.getByRole("heading", { name: "DHCP leases" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("router-tab-dns").click();
    await expect(page).toHaveURL(/\/router\/pfsense\/?#dns$/);
    await expectTabActive(page, "dns");
    await expect(page.getByTestId("pfsense-panel-dns")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("browser back/forward steps between previously-visited tabs", async ({
    page,
  }) => {
    await page.goto("/router/pfsense/");
    await expect(page.getByTestId("router-tabs")).toBeVisible({
      timeout: 25_000,
    });

    await page.getByTestId("router-tab-firewall").click();
    await expect(page).toHaveURL(/#firewall$/);
    await expectTabActive(page, "firewall");

    await page.getByTestId("router-tab-routing").click();
    await expect(page).toHaveURL(/#routing$/);
    await expectTabActive(page, "routing");
    await expect(page.getByTestId("pfsense-panel-routing")).toBeVisible({
      timeout: 15_000,
    });

    await page.goBack();
    await expect(page).toHaveURL(/#firewall$/);
    await expectTabActive(page, "firewall");
    await expect(
      page.getByRole("heading", { name: "Firewall rules" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.goForward();
    await expect(page).toHaveURL(/#routing$/);
    await expectTabActive(page, "routing");
    await expect(page.getByTestId("pfsense-panel-routing")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("invalid hash falls back to the default (system) panel", async ({
    page,
  }) => {
    await page.goto("/router/pfsense/#totally-unknown");
    await expect(page.getByTestId("router-tabs")).toBeVisible({
      timeout: 25_000,
    });

    await expectTabActive(page, "system");
    await expect(page.getByTestId("pfsense-panel-system")).toBeVisible({
      timeout: 15_000,
    });
  });
});
