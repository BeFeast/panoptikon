import { test, expect, login } from "../../e2e/fixtures";

type Page = import("@playwright/test").Page;

/**
 * Regression for #806 — pfSense router page hash sub-routes did not switch
 * panels. Each tab id (system, interfaces, firewall, dhcp, dns, services,
 * routing, config) is also a hash sub-route on /router/pfsense; loading
 * #<tab> directly, clicking the tab, or navigating browser back/forward
 * must render the matching panel below the tabs strip.
 */

const TAB_IDS = [
  "system",
  "interfaces",
  "firewall",
  "dhcp",
  "dns",
  "services",
  "routing",
  "config",
] as const;

/**
 * Mock all pfSense endpoints so the page renders fully in CI without a real
 * firewall reachable.
 */
async function mockPfsenseApis(page: Page) {
  // Generic catch-all for unspecified endpoints returns []. Playwright
  // evaluates routes in reverse registration order, so the specific mocks
  // below win.
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
        hostname: "pfSense-test",
        domain: "localdomain",
        version: "2.7.0",
        uptime: "1 day",
        cpu_usage: 5,
        memory_total: 8192 * 1024 * 1024,
        memory_used: 2048 * 1024 * 1024,
        platform: "pfSense",
      },
    }),
  );

  await page.route("**/api/v1/pfsense/interfaces", (route) =>
    route.fulfill({
      json: [
        {
          name: "lan",
          descr: "LAN",
          iface_type: "ethernet",
          status: "up",
          ip_address: "192.168.1.1",
          subnet: "24",
          mac: "00:11:22:33:44:55",
          mtu: 1500,
        },
      ],
    }),
  );

  await page.route("**/api/v1/pfsense/firewall/rules", (route) =>
    route.fulfill({ json: [] }),
  );

  await page.route("**/api/v1/pfsense/dhcp/leases", (route) =>
    route.fulfill({ json: [] }),
  );

  await page.route("**/api/v1/pfsense/dns/config", (route) =>
    route.fulfill({
      json: {
        resolver_enabled: true,
        servers: ["1.1.1.1", "9.9.9.9"],
      },
    }),
  );

  await page.route("**/api/v1/pfsense/dns/overrides", (route) =>
    route.fulfill({ json: [] }),
  );
}

async function gotoPfsense(page: Page, hash = "") {
  await login(page);
  await mockPfsenseApis(page);
  await page.goto(`/router/pfsense${hash}`);
  // Wait for the tabs strip to be present — proves pfSense was enabled and
  // the design wrapper mounted.
  await expect(page.getByTestId("router-tabs")).toBeVisible({
    timeout: 15000,
  });
}

test.describe("pfSense router — hash sub-routes (#806)", () => {
  for (const tab of TAB_IDS) {
    test(`direct navigation to #${tab} renders the matching panel`, async ({
      page,
    }) => {
      await gotoPfsense(page, `#${tab}`);

      await expect(page.getByTestId(`router-tabpanel-${tab}`)).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId(`router-tab-${tab}`)).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await page.screenshot({
        path: `tests/screenshots/pfsense-hash-${tab}.png`,
      });
    });
  }

  test("clicking each tab updates URL hash and panel content", async ({
    page,
  }) => {
    await gotoPfsense(page);

    for (const tab of TAB_IDS) {
      await page.getByTestId(`router-tab-${tab}`).click();

      await expect.poll(() => new URL(page.url()).hash).toBe(`#${tab}`);
      await expect(page.getByTestId(`router-tabpanel-${tab}`)).toBeVisible();
      await expect(page.getByTestId(`router-tab-${tab}`)).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
  });

  test("browser back/forward navigates between panels", async ({ page }) => {
    await gotoPfsense(page);

    // Default tab is "system" — each click pushes a history entry via
    // useHashTab → window.history.pushState.
    await page.getByTestId("router-tab-interfaces").click();
    await expect(page.getByTestId("router-tabpanel-interfaces")).toBeVisible();
    await page.getByTestId("router-tab-firewall").click();
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible();
    await page.getByTestId("router-tab-dhcp").click();
    await expect(page.getByTestId("router-tabpanel-dhcp")).toBeVisible();

    // Back twice → interfaces; forward → firewall.
    await page.goBack();
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible({
      timeout: 10000,
    });
    await expect.poll(() => new URL(page.url()).hash).toBe("#firewall");

    await page.goBack();
    await expect(page.getByTestId("router-tabpanel-interfaces")).toBeVisible({
      timeout: 10000,
    });
    await expect.poll(() => new URL(page.url()).hash).toBe("#interfaces");

    await page.goForward();
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible({
      timeout: 10000,
    });
    await expect.poll(() => new URL(page.url()).hash).toBe("#firewall");
  });

  test("invalid hash falls back to default panel without breaking state", async ({
    page,
  }) => {
    await gotoPfsense(page, "#totally-not-a-tab");

    // Default tab is "system" — the page should mount that panel rather than
    // erroring out or rendering nothing.
    await expect(page.getByTestId("router-tabpanel-system")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("router-tab-system")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // The tabs strip is still interactive after the invalid hash.
    await page.getByTestId("router-tab-firewall").click();
    await expect(page.getByTestId("router-tabpanel-firewall")).toBeVisible();
  });
});
