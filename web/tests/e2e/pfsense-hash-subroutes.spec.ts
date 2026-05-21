import { test, expect, login } from "../../e2e/fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E coverage for pfSense router page hash subroutes (#806).
 *
 * Verifies:
 *   - Direct navigation to `/router/pfsense#<tab>` renders the matching panel.
 *   - Clicking a tab updates `location.hash` and swaps the visible panel.
 *   - Browser back/forward navigates between previously-selected tabs.
 *   - Invalid hashes (#bogus) fall back to the default tab and clean the URL.
 */

const HASH_TABS = [
  "system",
  "interfaces",
  "firewall",
  "dhcp",
  "dns",
  "services",
  "routing",
  "config",
] as const;

async function mockPfsenseApis(page: Page) {
  // Generic catch-all for any pfSense endpoint we don't explicitly mock.
  await page.route("**/api/v1/pfsense/**", (route) =>
    route.fulfill({ json: [] }),
  );

  await page.route("**/api/v1/settings", (route) =>
    route.fulfill({
      json: {
        mikrotik_enabled: false,
        pfsense_enabled: true,
        xiaomi_mesh_enabled: false,
        default_router: "pfsense",
      },
    }),
  );

  await page.route("**/api/v1/pfsense/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        reachable: true,
        hostname: "pfsense-test",
        domain: "example.lan",
        version: "2.7.0",
        uptime: "1d 02:03",
        cpu_usage: 7,
        memory_total: 8 * 1024 * 1024 * 1024,
        memory_used: 2 * 1024 * 1024 * 1024,
        platform: "pfSense",
      },
    }),
  );

  await page.route("**/api/v1/pfsense/interfaces", (route) =>
    route.fulfill({
      json: [
        {
          name: "wan",
          descr: "WAN",
          iface_type: "ethernet",
          status: "up",
          ip_address: "203.0.113.5",
          subnet: "24",
          mac: "aa:bb:cc:dd:ee:01",
          mtu: 1500,
          media: "1000baseT",
        },
        {
          name: "lan",
          descr: "LAN",
          iface_type: "ethernet",
          status: "up",
          ip_address: "192.168.1.1",
          subnet: "24",
          mac: "aa:bb:cc:dd:ee:02",
          mtu: 1500,
          media: "1000baseT",
        },
      ],
    }),
  );

  await page.route("**/api/v1/pfsense/firewall/rules", (route) =>
    route.fulfill({
      json: [
        {
          id: "1",
          action: "pass",
          interface: "wan",
          protocol: "tcp",
          source: "any",
          destination: "192.168.1.1",
          port: "443",
          description: "Allow HTTPS",
          disabled: false,
          log: false,
          tracker: "100",
        },
      ],
    }),
  );

  await page.route("**/api/v1/pfsense/dhcp/leases", (route) =>
    route.fulfill({
      json: [
        {
          ip: "192.168.1.100",
          mac: "aa:bb:cc:dd:ee:10",
          hostname: "client-1",
          start: "2026-05-20T10:00:00Z",
          end: "2026-05-21T10:00:00Z",
          status: "active",
          interface: "lan",
        },
      ],
    }),
  );
}

test.describe("pfSense hash subroutes (#806)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await mockPfsenseApis(page);
  });

  test("direct navigation to each hash route renders the matching panel", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    for (const tab of HASH_TABS) {
      await page.goto(`/router/pfsense/#${tab}`);
      await expect(page.getByTestId("router-page").first()).toBeVisible({
        timeout: 30_000,
      });
      // Active tab has aria-selected=true
      await expect(page.getByTestId(`router-tab-${tab}`)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // Matching panel is rendered
      await expect(page.getByTestId(`router-tabpanel-${tab}`)).toBeVisible();
      // Other panels are NOT in the DOM
      for (const other of HASH_TABS) {
        if (other === tab) continue;
        await expect(
          page.getByTestId(`router-tabpanel-${other}`),
        ).toHaveCount(0);
      }
    }
    await page.screenshot({
      path: "tests/screenshots/pfsense-hash-subroutes-final.png",
      fullPage: true,
    });
  });

  test("clicking a tab updates the hash and swaps the visible panel", async ({
    page,
  }) => {
    await page.goto("/router/pfsense/");
    await expect(page.getByTestId("router-page").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("router-tabpanel-system")).toBeVisible();

    await page.getByTestId("router-tab-firewall").click();
    await expect(page).toHaveURL(/#firewall$/);
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible();
    await expect(page.getByTestId("router-tabpanel-system")).toHaveCount(0);

    await page.getByTestId("router-tab-dhcp").click();
    await expect(page).toHaveURL(/#dhcp$/);
    await expect(page.getByTestId("router-tabpanel-dhcp")).toBeVisible();
    await expect(page.getByTestId("router-tabpanel-firewall")).toHaveCount(0);
  });

  test("browser back/forward navigates between tabs", async ({ page }) => {
    await page.goto("/router/pfsense/");
    await expect(page.getByTestId("router-page").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("router-tab-interfaces").click();
    await expect(page).toHaveURL(/#interfaces$/);
    await expect(
      page.getByTestId("router-tabpanel-interfaces"),
    ).toBeVisible();

    await page.getByTestId("router-tab-firewall").click();
    await expect(page).toHaveURL(/#firewall$/);
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible();

    // Back → interfaces
    await page.goBack();
    await expect(page).toHaveURL(/#interfaces$/);
    await expect(
      page.getByTestId("router-tabpanel-interfaces"),
    ).toBeVisible();
    await expect(page.getByTestId("router-tabpanel-firewall")).toHaveCount(0);

    // Forward → firewall
    await page.goForward();
    await expect(page).toHaveURL(/#firewall$/);
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible();
    await expect(
      page.getByTestId("router-tabpanel-interfaces"),
    ).toHaveCount(0);
  });

  test("invalid hash falls back to the default tab and cleans the URL", async ({
    page,
  }) => {
    await page.goto("/router/pfsense/#bogus-not-a-tab");
    await expect(page.getByTestId("router-page").first()).toBeVisible({
      timeout: 30_000,
    });
    // Default tab is "system"
    await expect(page.getByTestId("router-tabpanel-system")).toBeVisible();
    await expect(page.getByTestId("router-tab-system")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // URL should no longer carry the bogus hash
    await expect(page).not.toHaveURL(/#bogus-not-a-tab/);
  });
});
